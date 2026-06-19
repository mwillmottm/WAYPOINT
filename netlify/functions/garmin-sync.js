import pkg from 'garmin-connect'

const { GarminConnect } = pkg

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const ATHLETE_ID = process.env.ATHLETE_ID

// Run every 30 minutes
export const config = {
  schedule: '*/30 * * * *'
}

const SB_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json'
}

function todayAEST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Brisbane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
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

  return true
}

async function sbUpsert(table, rows, conflict) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflict}`,
    {
      method: 'POST',
      headers: {
        ...SB_HEADERS,
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify(rows)
    }
  )

  if (!res.ok) {
    throw new Error(
      `${table}: ${res.status} ${await res.text()}`
    )
  }

  return true
}

async function logFailure(error) {
  try {
    await sbUpsert(
      'daily_sync_log',
      [{
        sync_date: todayAEST(),
        synced_at: new Date().toISOString(),
        status: 'error',
        error_msg: error?.message || String(error),
        activities_written: 0
      }],
      'sync_date'
    )
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

function calculatePace(distanceMeters, durationSeconds) {
  if (!distanceMeters || !durationSeconds) {
    return null
  }

  const distanceKm = distanceMeters / 1000

  if (distanceKm <= 0) {
    return null
  }

  const secondsPerKm = durationSeconds / distanceKm

  const mins = Math.floor(secondsPerKm / 60)
  const secs = Math.round(secondsPerKm % 60)

  return `${mins}:${String(secs).padStart(2, '0')}`
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
    console.log('TODAY VALUE:', today)

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

console.log('sleep status:', sleepDataResult.status)
console.log('heart status:', heartRateResult.status)

if (sleepDataResult.status === 'rejected') {
  console.log('sleep error:', sleepDataResult.reason)
}

if (heartRateResult.status === 'rejected') {
  console.log('heart error:', heartRateResult.reason)
}
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

    const averageHeartRate =
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

      readiness: null,
      recovery_hrs: null,

      rhr: restingHeartRate,
      rhr_7day: null,

      hrv: null,
      hrv_status: null,

      sleep: sleepScore,

      body_battery: null,
      stress: null,
      spo2: null,

      vo2: vo2Max,

      lt_hr: null,

      training_status: null,
      acute_load: null,
      chronic_load: null,
      acwr: null,

      chronic_band_lo: null,
      chronic_band_hi: null,

      balance: null
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

      const distanceKm =
        typeof activity?.distance === 'number'
          ? Number((activity.distance / 1000).toFixed(2))
          : null

      const pace = calculatePace(
        activity?.distance,
        activity?.duration
      )

      const avgHr =
        activity?.averageHR ??
        activity?.averageHeartRate ??
        averageHeartRate ??
        null

      runRows.push({
        athlete_id: ATHLETE_ID,
        garmin_activity_id: activity.activityId,
        run_date:
          activity?.startTimeLocal?.slice(0, 10) ||
          today,
        title:
          activity?.activityName || 'Run',
        distance_km: distanceKm,
        pace,
        avg_hr: avgHr,
        relative_effort: null
      })
    }

    if (runRows.length > 0) {
      console.log(`Upserting ${runRows.length} runs`)

      await sbUpsert(
        'recent_runs',
        runRows,
        'garmin_activity_id'
      )
    }

    console.log('Updating sync log')

    await sbUpsert(
      'daily_sync_log',
      [{
        sync_date: today,
        synced_at: new Date().toISOString(),
        status: 'success',
        error_msg: null,
        activities_written: runRows.length
      }],
      'sync_date'
    )

    console.log('Garmin sync completed successfully')

    return new Response(
      JSON.stringify({ ok: true }),
      {
        headers: {
          'content-type': 'application/json'
        }
      }
    )
  } catch (error) {
    console.error('Garmin sync failed:', error)

    await logFailure(error)

    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || String(error)
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
