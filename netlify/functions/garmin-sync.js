// netlify/functions/garmin-sync.js
// Schedule: every 30 minutes

import pkg from 'garmin-connect'
const { GarminConnect } = pkg

const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const ATHLETE_ID           = process.env.ATHLETE_ID

export const config = { schedule: '*/30 * * * *' }

function todayAEST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Brisbane',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function calculatePace(distM, durSec) {
  if (!distM || !durSec || distM < 100) return null
  const secPerKm = durSec / (distM / 1000)
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}`
}

function calcReadiness({ hrv, hrvBaseLo = 40, hrvBaseHi = 49, rhr, rhr7, sleep, stress, bodyBattery }) {
  let score = 50
  if (hrv && hrvBaseLo && hrvBaseHi) {
    const mid = (hrvBaseLo + hrvBaseHi) / 2
    const range = Math.max((hrvBaseHi - hrvBaseLo) / 2, 3)
    score += Math.max(-20, Math.min(20, ((hrv - mid) / range) * 15))
  }
  if (rhr && rhr7)          score += Math.max(-15, Math.min(15, (rhr7 - rhr) * 3))
  if (sleep)                score += (sleep - 60) * 0.5
  if (stress != null)       score += (50 - stress) * 0.2
  if (bodyBattery != null)  score += (bodyBattery - 50) * 0.15
  return Math.round(Math.max(0, Math.min(100, score)))
}

// ---- Supabase helpers ----
const SB_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function sbUpsert(table, row, onConflict) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`,
    {
      method: 'POST',
      headers: { ...SB_HEADERS, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(row),
    }
  )
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  return res.json().catch(() => [])
}

async function sbInsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SB_HEADERS, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  })
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  return res.json().catch(() => [])
}

async function sbGet(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  })
  if (!res.ok) throw new Error(`GET ${table}: ${res.status}`)
  return res.json()
}

// Authenticated fetch using the oauth2 token from gc.client
// gc.client.url.GC_API = 'https://connectapi.garmin.com'
async function garminFetch(gc, path) {
  try {
    const token   = gc.client?.oauth2Token?.access_token
    const baseUrl = gc.client?.url?.GC_API || 'https://connectapi.garmin.com'
    if (!token) { console.log(`[garmin-sync] no token for ${path}`); return null }
    const url = `${baseUrl}${path}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'DI-Backend': 'connectapi.garmin.com',
        NK: 'NT',
      },
    })
    if (!res.ok) { console.log(`[garmin-sync] ${path} → ${res.status}`); return null }
    return res.json()
  } catch (e) {
    console.log(`[garmin-sync] garminFetch(${path}) error:`, e.message)
    return null
  }
}

export default async function handler() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ATHLETE_ID) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing env vars' }), { status: 500 })
  }

  const today = todayAEST()
  console.log(`[garmin-sync] starting for ${today}`)
  const errors = []
  let activitiesWritten = 0

  try {
    const gc = new GarminConnect({
      username: process.env.GARMIN_EMAIL,
      password: process.env.GARMIN_PASSWORD,
    })
    await gc.login()
    console.log('[garmin-sync] logged in')

    const dateObj = new Date(today + 'T12:00:00')

    // Pull confirmed-working endpoints in parallel
    const [sleepRes, heartRes, activitiesRes] = await Promise.allSettled([
      gc.getSleepData(dateObj),
      gc.getHeartRate(dateObj),
      gc.getActivities(0, 20),
    ])

    const sleepRaw = sleepRes.status === 'fulfilled' ? sleepRes.value : null
    const heartRaw = heartRes.status === 'fulfilled' ? heartRes.value : null
    const rawActs  = activitiesRes.status === 'fulfilled'
      ? (Array.isArray(activitiesRes.value) ? activitiesRes.value
         : activitiesRes.value?.activityList || activitiesRes.value?.activities || [])
      : []

    if (sleepRes.status === 'rejected') errors.push('sleep: ' + sleepRes.reason?.message)
    if (heartRes.status === 'rejected') errors.push('heart: ' + heartRes.reason?.message)

    // CONFIRMED FIELD LOCATIONS from live data inspection:
    // - sleepRaw.dailySleepDTO  → sleepScores, avgSleepStress, averageSpO2Value
    // - sleepRaw (TOP LEVEL)    → avgOvernightHrv, hrvStatus, sleepBodyBattery[]
    const dto = sleepRaw?.dailySleepDTO || {}

    // Extract sleep fields from DTO
    const sleepScore = dto.sleepScores?.overall?.value ?? dto.sleepScore ?? null
    const stress     = dto.avgSleepStress ?? null
    const spo2       = dto.averageSpO2Value ?? null

    // HRV — CONFIRMED at sleepRaw top level, NOT inside dailySleepDTO
    const finalHrv  = sleepRaw?.avgOvernightHrv ?? null
    const hrvStatus = sleepRaw?.hrvStatus
      ? (sleepRaw.hrvStatus.charAt(0) + sleepRaw.hrvStatus.slice(1).toLowerCase())
      : (finalHrv != null ? (finalHrv >= 40 && finalHrv <= 49 ? 'Balanced' : finalHrv > 49 ? 'High' : 'Low') : null)
    const hrvBaseLo = 40
    const hrvBaseHi = 49

    // Body battery — CONFIRMED at sleepRaw.sleepBodyBattery[] top level
    // Array of {value, startGMT} — take the max value (peak charge after sleep)
    let bodyBattery = null
    const bbArr = sleepRaw?.sleepBodyBattery
    if (Array.isArray(bbArr) && bbArr.length) {
      bodyBattery = Math.max(...bbArr.map(b => b.value ?? 0))
    }

    console.log('[garmin-sync] HRV source check — sleepRaw.avgOvernightHrv:', sleepRaw?.avgOvernightHrv, '| hrvStatus:', sleepRaw?.hrvStatus)
    console.log('[garmin-sync] Battery source check — sleepBodyBattery length:', bbArr?.length, '| max:', bodyBattery)

    // RHR from heart rate response
    const rhr  = heartRaw?.restingHeartRate               ?? null
    const rhr7 = heartRaw?.lastSevenDaysAvgRestingHeartRate ?? null

    console.log(`[garmin-sync] extracted — HRV:${finalHrv} sleep:${sleepScore} RHR:${rhr} rhr7:${rhr7} stress:${stress} battery:${bodyBattery} spo2:${spo2}`)

    const readiness = calcReadiness({
      hrv: finalHrv, hrvBaseLo, hrvBaseHi,
      rhr, rhr7, sleep: sleepScore, stress, bodyBattery,
    })
    const recoveryHrs = readiness >= 70 ? '1 hr' : readiness >= 50 ? '4 hr' : '24 hr'

    console.log(`[garmin-sync] readiness: ${readiness}`)

    // Write snapshot — upsert on athlete_id (unique constraint added via SQL)
    try {
      await sbUpsert('fitness_snapshot', {
        athlete_id: ATHLETE_ID,
        synced_at:  new Date().toISOString(),
        readiness, recovery_hrs: recoveryHrs,
        rhr, rhr_7day: rhr7,
        hrv: finalHrv != null ? Math.round(finalHrv) : null,
        hrv_status: hrvStatus,
        sleep: sleepScore,
        body_battery: bodyBattery != null ? Math.round(bodyBattery) : null,
        stress: stress != null ? Math.round(stress) : null,
        spo2, vo2: null, lt_hr: 173,
        training_status: null, acute_load: null, chronic_load: null,
        acwr: null, chronic_band_lo: 257, chronic_band_hi: 482, balance: null,
      }, 'athlete_id')
      console.log('[garmin-sync] snapshot upserted')
    } catch (e) {
      errors.push('snapshot: ' + e.message)
      console.error('[garmin-sync] snapshot error:', e.message)
    }

    // HRV trend
    if (finalHrv != null) {
      await sbInsert('hrv_trend',
        [{ athlete_id: ATHLETE_ID, day: today, hrv: Math.round(finalHrv) }])
        .catch(e => errors.push('hrv_trend: ' + e.message))
    }

    // Activities
    const runs = rawActs.filter(a => {
      const type = a.activityType?.typeKey || a.type || ''
      const dist = a.distance || a.distanceMeters || a.distance_meters || 0
      return type.includes('running') && dist > 500
    })

    for (const run of runs.slice(0, 15)) {
      const actId  = run.activityId || run.id
      const distM  = run.distance || run.distanceMeters || run.distance_meters || 0
      const distKm = parseFloat((distM / 1000).toFixed(2))
      const movSec = run.movingDuration || run.moving_duration_seconds || 0
      const durSec = run.duration || run.duration_seconds || 0
      const dateStr = (run.startTimeLocal || run.start_time || today).slice(0, 10)

      try {
        await sbInsert('recent_runs', {
          athlete_id: ATHLETE_ID, garmin_activity_id: actId,
          run_date: dateStr, title: run.activityName || run.name || 'Run',
          distance_km: distKm, pace: calculatePace(distM, movSec || durSec),
          avg_hr: run.averageHR || null, relative_effort: run.trainingEffect ?? null,
        })

        const existing = await sbGet('activity_details',
          `garmin_activity_id=eq.${actId}&select=id&limit=1`).catch(() => [])
        if (existing.length > 0) { activitiesWritten++; continue }

        const [detailRes, splitsRes] = await Promise.allSettled([
          gc.getActivity({ activityId: actId }),
          gc.getActivitySplits({ activityId: actId }),
        ])
        const d  = detailRes.status === 'fulfilled' ? detailRes.value : null
        const sp = splitsRes.status === 'fulfilled' ? splitsRes.value : null

        const detailRows = await sbInsert('activity_details', {
          athlete_id: ATHLETE_ID, garmin_activity_id: actId,
          activity_date: dateStr, start_time_local: run.startTimeLocal || null,
          name: run.activityName || run.name || 'Run', type: 'running',
          distance_km: distKm, duration_seconds: Math.round(durSec),
          moving_duration_seconds: Math.round(movSec),
          pace_avg: calculatePace(distM, movSec || durSec),
          avg_hr: d?.avgHrBpm || run.averageHR || null,
          max_hr: d?.maxHrBpm || run.maxHR || null,
          avg_cadence: d?.avgCadence ? Math.round(d.avgCadence) : null,
          calories: d?.calories || run.calories || null,
          elevation_gain_m: d?.elevationGain || run.elevationGain || null,
          training_load: d?.trainingLoad ?? null,
          aerobic_effect: d?.trainingEffect ?? null,
          training_effect_label: d?.trainingEffectLabel ?? null,
          workout_feel: d?.workoutFeel || null, workout_rpe: d?.workoutRpe || null,
        })

        const detailId = Array.isArray(detailRows) ? detailRows[0]?.id : detailRows?.id
        if (detailId && sp) {
          const laps = (sp?.lapDTOs || sp?.laps || []).filter(l => (l.distance || 0) > 100)
          if (laps.length) {
            await sbInsert('activity_laps', laps.map((l, i) => {
              const ld = l.distance || 0, lm = l.movingDuration || l.duration || 0
              return {
                activity_id: detailId, lap_number: l.lapIndex ?? i,
                distance_m: parseFloat(ld.toFixed(2)),
                duration_seconds: parseFloat((l.duration || 0).toFixed(3)),
                avg_pace: ld > 100 && lm > 0 ? calculatePace(ld, lm) : null,
                avg_hr: l.averageHR || null, max_hr: l.maxHR || null,
                avg_cadence: l.averageCadence ? Math.round(l.averageCadence) : null,
                elevation_gain_m: l.elevationGain || null, intensity_type: l.intensityType || null,
              }
            })).catch(e => errors.push('laps: ' + e.message))
          }
        }

        activitiesWritten++
      } catch (e) {
        errors.push(`activity ${actId}: ${e.message}`)
      }
    }

    await sbUpsert('daily_sync_log', {
      sync_date: today, synced_at: new Date().toISOString(),
      status: errors.length ? 'partial' : 'ok',
      error_msg: errors.length ? errors.slice(0, 3).join('; ') : null,
      activities_written: activitiesWritten,
    }, 'sync_date')

    console.log(`[garmin-sync] done — readiness:${readiness} hrv:${finalHrv} battery:${bodyBattery} activities:${activitiesWritten} errors:${errors.length}`)

    return new Response(JSON.stringify({
      ok: true, today, readiness, hrv: finalHrv, bodyBattery, rhr, sleepScore, activitiesWritten, errors,
    }), { headers: { 'content-type': 'application/json' } })

  } catch (err) {
    console.error('[garmin-sync] fatal:', err.message)
    try {
      await sbUpsert('daily_sync_log', {
        sync_date: todayAEST(), synced_at: new Date().toISOString(),
        status: 'error', error_msg: err.message, activities_written: 0,
      }, 'sync_date')
    } catch { /* swallow */ }
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
