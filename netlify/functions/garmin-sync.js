import pkg from 'garmin-connect'

const { GarminConnect } = pkg

//
// Scheduled Garmin sync
// Runs 4 times daily Melbourne time:
//
// 4:30am AEST = 18:30 UTC previous day
// 7:00am AEST = 21:00 UTC previous day
// 12:00pm AEST = 02:00 UTC
// 7:00pm AEST = 09:00 UTC
//

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvmthpqjaqqnfpzwiade.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const ATHLETE_ID = '0a1d0000-0000-4000-8000-00000000a001'

export const config = {
schedule: [
'30 18 * * *',
'0 21 * * *',
'0 2 * * *',
'0 9 * * *',
],
}


// ---- Supabase helpers ----
const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=representation',
}

async function sbUpsert(table, rows, onConflict) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`
  const res = await fetch(url, { method: 'POST', headers: sbHeaders, body: JSON.stringify(rows) })
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function sbInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: sbHeaders, body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

// ---- helpers ----
const pad = (n) => String(n).padStart(2, '0')
const mpsToSecPerKm = (mps) => (mps > 0 ? Math.round(1000 / mps) : 0)
const secToPace = (sec) => `${Math.floor(sec / 60)}:${pad(sec % 60)}`
const todayISO = () =>
new Intl.DateTimeFormat('en-CA', {
timeZone: 'Australia/Melbourne',
year: 'numeric',
month: '2-digit',
day: '2-digit',
}).format(new Date())

const kmStr = (m) => (m / 1000).toFixed(2)

// ---- main handler ----
export default async function handler() {
  if (!SUPABASE_KEY) {
    console.error('SUPABASE_SERVICE_KEY not set')
    return new Response('missing service key', { status: 500 })
  }

  const today = todayISO()
  console.log(`[garmin-sync] starting sync for ${today}`)

  let activitiesWritten = 0

  try {
    // 1. Connect to Garmin
    const gc = new GarminConnect({ username: process.env.GARMIN_EMAIL, password: process.env.GARMIN_PASSWORD })
    await gc.login()
    console.log('GARMIN METHODS:', Object.getOwnPropertyNames(Object.getPrototypeOf(gc)))
    console.log('[garmin-sync] logged in to Garmin')

    // 2. Pull all data in parallel
 const [
activities,
sleep,
heartRate,
profile,
] = await Promise.allSettled([
gc.getActivities(0, 15),
gc.getSleepData(today),
gc.getHeartRate(today),
gc.getUserProfile(),
])

const acts = activities.status === 'fulfilled' ? activities.value : []
const sleepData = sleep.status === 'fulfilled' ? sleep.value : {}
const hrData = heartRate.status === 'fulfilled' ? heartRate.value : {}
const profileData = profile.status === 'fulfilled' ? profile.value : {}


    const s = stats.status === 'fulfilled' ? stats.value : {}
    const h = hrv.status === 'fulfilled' ? hrv.value : {}
    const t = trainingStatus.status === 'fulfilled' ? trainingStatus.value : {}
    const acts = activities.status === 'fulfilled' ? activities.value : []

    // 3. Write fitness snapshot
    const snapshot = {
      readiness: null,
recovery_hrs: null,
rhr: null,
rhr_7day: null,
hrv: null,
hrv_status: null,
sleep: sleepData?.dailySleepDTO?.sleepScore ?? null,
body_battery: null,
stress: null,
spo2: null,
vo2: profileData?.vo2Max ?? null,
      lt_hr: 173, // static — only changes after a LT test
      training_status: t.trainingStatusFeedback ?? null,
      acute_load: t.acuteLoad ?? null,
      chronic_load: t.chronicLoad ?? null,
      acwr: t.loadRatio ?? null,
      chronic_band_lo: t.optimalChronicLoadMin ?? 257,
      chronic_band_hi: t.optimalChronicLoadMax ?? 482,
      balance: t.trainingBalanceFeedback ?? null,
    }
    await sbInsert('fitness_snapshot', snapshot)
    console.log('[garmin-sync] snapshot written')

    // 4. Write today's HRV into trend
   

    // 5. Write recent runs (upsert on garmin_activity_id to avoid dupes)
    const runs = (Array.isArray(acts) ? acts : acts?.activityList ?? [])
      .filter((a) => a.activityType?.typeKey?.includes('running') && a.distance > 500)
      .slice(0, 10)

    if (runs.length) {
      const runRows = runs.map((a) => {
        const distKm = a.distance / 1000
        const paceSecRaw = a.movingDuration > 0 ? a.movingDuration / distKm : 0
        return {
          athlete_id: ATHLETE_ID,
          garmin_activity_id: a.activityId,
          run_date: a.startTimeLocal?.slice(0, 10) ?? today,
          title: a.activityName ?? 'Run',
          distance_km: parseFloat(distKm.toFixed(2)),
          pace: paceSecRaw > 0 ? secToPace(Math.round(paceSecRaw)) : null,
          relative_effort: a.trainingEffect ?? null,
          avg_hr: a.averageHR ?? null,
        }
      })
      await sbUpsert('recent_runs', runRows, 'garmin_activity_id')
      activitiesWritten = runRows.length
      console.log(`[garmin-sync] ${activitiesWritten} runs written`)
    }

    // 6. Write sync log
    await sbInsert('daily_sync_log', {
      sync_date: today,
      synced_at: new Date().toISOString(),
      status: 'ok',
      activities_written: activitiesWritten,
    })

    console.log('[garmin-sync] done')
    return new Response(JSON.stringify({ ok: true, date: today, activitiesWritten }), {
      headers: { 'content-type': 'application/json' },
    })

  } catch (err) {
    console.error('[garmin-sync] error:', err.message)

    // log the failure to Supabase so you can see it in Table Editor
    try {
      await sbInsert('daily_sync_log', {
        sync_date: today,
        synced_at: new Date().toISOString(),
        status: 'error',
        error_msg: err.message,
      })
    } catch { /* don't throw from error handler */ }

    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
