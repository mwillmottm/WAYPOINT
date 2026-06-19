import pkg from 'garmin-connect'

const { GarminConnect } = pkg

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const ATHLETE_ID = process.env.ATHLETE_ID

// Run every 30 minutes and only execute on the required AEST times:
// 04:30, 07:00, 12:00, 19:00
export const config = {
  schedule: '*/30 * * * *'
}

const SB_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
}

function todayAEST() {
  const now = new Date()

  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Brisbane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now)

  return date
}



async function sbInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(row)
  })

  if (!res.ok) {
    throw new Error(
      `${table}: ${res.status} ${await res.text()}`
    )
  }

  return res.json()
}

async function sbUpsert(table, rows, conflict) {
  const url =
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflict}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...SB_HEADERS,
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify(rows)
  })

  if (!res.ok) {
    throw new Error(
      `${table}: ${res.status} ${await res.text()}`
    )
  }

  return res.json()
}

async function logFailure(error) {
  try {
    await sbInsert('daily_sync_log', {
      athlete_id: ATHLETE_ID,
      sync_date: todayAEST(),
      synced_at: new Date().toISOString(),
      status: 'error',
      error_msg: error.message || String(error)
    })
  } catch (e) {
    console.error('Failed to write sync log:', e)
  }
}

function safeAverageHeartRate(hrData) {
  try {
    const values =
      hrData?.heartRateValues ||
      hrData?.heartRateSamples ||
      []

    const valid = values.filter(
      v => typeof v === 'number' && v > 0
    )

    if (!valid.length) return null

    return Math.round(
      valid.reduce((a, b) => a + b, 0) / valid.length
    )
  } catch {
    return null
  }
}

export default async function handler() {
  try {
        console.log('Garmin sync started')
    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_KEY ||
      !ATHLETE_ID
    ) {
      throw new Error(
        'Missing SUPABASE_URL, SUPABASE_SERVICE_KEY or ATHLETE_ID'
      )
    }

 

    const gc = new GarminConnect({
      username: process.env.GARMIN_EMAIL,
      password: process.env.GARMIN_PASSWORD
    })
    console.log('Logging into Garmin')
    await gc.login()
        console.log('Garmin login successful')

    const today = todayAEST()

    const [
      profileResult,
      activitiesResult,
      sleepDataResult,
      sleepDurationResult,
      heartRateResult
    ] = await Promise.allSettled([
      gc.getUserProfile(),
      gc.getActivities(0, 20),
      gc.getSleepData(today),
      gc.getSleepDuration(today),
      gc.getHeartRate(today)
    ])

    const profile =
      profileResult.status === 'fulfilled'
        ? profileResult.value
        : null

    const sleepData =
      sleepDataResult.status === 'fulfilled'
        ? sleepDataResult.value
        : null

    const sleepDuration =
      sleepDurationResult.status === 'fulfilled'
        ? sleepDurationResult.value
        : null

    const heartRate =
      heartRateResult.status === 'fulfilled'
        ? heartRateResult.value
        : null

    const activities =
      activitiesResult.status === 'fulfilled'
        ? activitiesResult.value
        : []

    const restingHeartRate =
      heartRate?.restingHeartRate ??
      profile?.userData?.restingHeartRate ??
      null

    const avgHeartRate =
      safeAverageHeartRate(heartRate)

    const sleepScore =
      sleepData?.sleepScore ??
      sleepData?.dailySleepDTO?.sleepScore ??
      null

    const vo2Max =
      profile?.userData?.vo2MaxRunning ??
      profile?.vo2MaxRunning ??
      null

        console.log('Writing fitness snapshot')
    await sbInsert('fitness_snapshot', {
      athlete_id: ATHLETE_ID,
      synced_at: new Date().toISOString(),
      sleep_score: sleepScore,
      resting_heart_rate: restingHeartRate,
      average_heart_rate: avgHeartRate,
      vo2_max: vo2Max,
      sleep_duration_seconds:
        sleepDuration?.sleepTimeSeconds ??
        sleepDuration?.sleepDuration ??
        null
    })

    const activityList = Array.isArray(activities)
      ? activities
      : activities?.activityList || []

    const runRows = []

    for (const activity of activityList) {
      const typeKey =
        activity?.activityType?.typeKey || ''

      if (!typeKey.includes('running')) {
        continue
      }

      let avgHr =
        activity?.averageHR ??
        activity?.averageHeartRate ??
        null

      let distanceKm =
        typeof activity?.distance === 'number'
          ? activity.distance / 1000
          : null

      let pace = null

      if (
        activity?.distance &&
        activity?.duration
      ) {
        const secondsPerKm =
          activity.duration /
          (activity.distance / 1000)

        const mins = Math.floor(
          secondsPerKm / 60
        )

        const secs = Math.round(
          secondsPerKm % 60
        )

        pace = `${mins}:${String(secs).padStart(
          2,
          '0'
        )}`
      }

      try {
        const details = await gc.getActivity(
          activity.activityId
        )

        avgHr =
          details?.summaryDTO?.averageHR ??
          details?.averageHR ??
          avgHr
      } catch (err) {
        console.error(
          `Activity ${activity.activityId} detail failed`,
          err
        )
      }

      runRows.push({
        athlete_id: ATHLETE_ID,
        garmin_activity_id: activity.activityId,
        run_date:
          activity.startTimeLocal?.slice(0, 10) ||
          today,
        title:
          activity.activityName || 'Run',
        distance: distanceKm,
        pace,
        average_heart_rate: avgHr
      })
    }

    if (runRows.length) {
      await sbUpsert(
        'recent_runs',
        runRows,
        'garmin_activity_id'
      )
    }

        console.log('Writing success log')
    await sbInsert('daily_sync_log', {
      athlete_id: ATHLETE_ID,
      sync_date: today,
      synced_at: new Date().toISOString(),
      status: 'success',
      runs_written: runRows.length
    })

    return new Response(
      JSON.stringify({ ok: true }),
      {
        headers: {
          'content-type': 'application/json'
        }
      }
    )
  } catch (error) {
    console.error(error)

    await logFailure(error)

    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message
      }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json'
        }
      }
    )
  }
}
