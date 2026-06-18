// netlify/functions/garmin-sync.js
//
// Scheduled function: runs every morning at 5am AEST (7pm UTC previous day).
// Pulls today's Garmin data and writes it to Supabase.
//
// SETUP (one time):
//   1. npm install garmin-connect --save (in your project root)
//   2. In Netlify → Site configuration → Environment variables, add:
//        GARMIN_EMAIL      your Garmin Connect email
//        GARMIN_PASSWORD   your Garmin Connect password
//        SUPABASE_URL      https://pvmthpqjaqqnfpzwiade.supabase.co
//        SUPABASE_SERVICE_KEY  your Supabase service_role key (NOT the anon key)
//   3. Run waypoint_sync_tables.sql in Supabase SQL editor
//   4. Push this file to GitHub — Netlify picks it up automatically
//
// NOTE: Use the SERVICE KEY here (not anon key) — this runs server-side only
// and needs to bypass RLS to write data. The service key never goes to the browser.

import { GarminConnect } from 'garmin-connect'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvmthpqjaqqnfpzwiade.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const ATHLETE_ID   = '0a1d0000-0000-4000-8000-00000000a001'

// Netlify scheduled function config — 7pm UTC = 5am AEST (UTC+10)
export const config = { schedule: '0 19 * * *' }

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
const todayISO = () => new Date().toISOString().slice(0, 10)
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
    console.log('[garmin-sync] logged in to Garmin')

    // 2. Pull all data in parallel
    const [
      stats,
      hrv,
      trainingStatus,
      activities,
    ] = await Promise.allSettled([
      gc.getStats(today),
      gc.getHrvData(today),
      gc.getTrainingStatus(today),
      gc.getActivities(0, 15),
    ])

    const s = stats.status === 'fulfilled' ? stats.value : {}
    const h = hrv.status === 'fulfilled' ? hrv.value : {}
    const t = trainingStatus.status === 'fulfilled' ? trainingStatus.value : {}
    const acts = activities.status === 'fulfilled' ? activities.value : []

    // 3. Write fitness snapshot
    const snapshot = {
      athlete_id: ATHLETE_ID,
      synced_at: new Date().toISOString(),
      readiness: t.readiness_score ?? null,
      recovery_hrs: t.recovery_time ? `${t.recovery_time} hr` : null,
      rhr: s.restingHeartRate ?? null,
      rhr_7day: s.lastSevenDaysAvgRestingHeartRate ?? null,
      hrv: h.lastNight5MinHighHrvMs ?? h.lastNightAvgHrv ?? null,
      hrv_status: h.status ?? null,
      sleep: s.sleepScore ?? null,
      body_battery: s.bodyBatteryHighestValue ?? null,
      stress: s.averageStressLevel ?? null,
      spo2: s.averageSpo2 ?? null,
      vo2: t.vo2Max ?? null,
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
    if (h.lastNightAvgHrv) {
      await sbUpsert('hrv_trend',
        [{ athlete_id: ATHLETE_ID, day: today, hrv: Math.round(h.lastNightAvgHrv) }],
        'athlete_id,day')
      console.log('[garmin-sync] HRV trend updated')
    }

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
