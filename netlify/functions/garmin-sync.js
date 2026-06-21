// netlify/functions/garmin-sync.js
// Schedule: every 30 minutes
//
// CONFIRMED WORKING (from logs):
// - gc.getSleepData(dateObj) → dailySleepDTO with sleep score, HRV, stress
// - gc.getHeartRate(dateObj) → restingHeartRate, lastSevenDaysAvgRestingHeartRate
// - gc.getActivities(0,20)  → run activities
//
// gc.client has: url, client, oauth2Token, get, post, put
// gc.client.client is the inner HTTP client — use it with full URLs + oauth2Token for body battery

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

// ---- Supabase ----
const SB_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=representation',
}

async function sbPost(table, rows, onConflict) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`
  const res = await fetch(url, {
    method: 'POST', headers: SB_HEADERS,
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

// Authenticated fetch using oauth2Token from gc.client
async function garminApiFetch(gc, path) {
  try {
    const token = gc.client?.oauth2Token?.access_token
    if (!token) {
      console.log(`[garmin-sync] no oauth2Token for ${path}`)
      return null
    }
    const baseUrl = gc.client?.url || 'https://connectapi.garmin.com'
    const url = `${baseUrl}${path}`
    console.log(`[garmin-sync] fetching ${url}`)
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'DI-Backend': 'connectapi.garmin.com',
        'NK': 'NT',
      },
    })
    if (!res.ok) {
      console.log(`[garmin-sync] ${path} → ${res.status}`)
      return null
    }
    return res.json()
  } catch (e) {
    console.log(`[garmin-sync] garminApiFetch(${path}) error:`, e.message)
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

    // Log oauth2Token presence
    const token = gc.client?.oauth2Token
    console.log('[garmin-sync] oauth2Token present:', !!token, '| keys:', token ? Object.keys(token).join(', ') : 'none')
    console.log('[garmin-sync] gc.client.url:', gc.client?.url)

    const dateObj = new Date(today + 'T12:00:00')

    // Confirmed working calls
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

    // Extract sleep fields — dailySleepDTO confirmed in logs
    const dto        = sleepRaw?.dailySleepDTO || sleepRaw || {}
    const sleepScore = dto.sleepScores?.overall?.value ?? dto.sleepScore ?? null

    // HRV is inside dailySleepDTO
    const hrv = dto.avgOvernightHrv
      ?? dto.averageOvernightHrv
      ?? dto.avgHrv
      ?? null
    const hrvBaseLo = dto.baselineBalancedLow    ?? 40
    const hrvBaseHi = dto.baselineBalancedUpper  ?? 49
    const stress    = dto.avgSleepStress          ?? null
    const spo2      = dto.averageSpO2Value        ?? null

    // Extract heart rate fields — confirmed in logs
    const rhr  = heartRaw?.restingHeartRate              ?? null
    const rhr7 = heartRaw?.lastSevenDaysAvgRestingHeartRate ?? null

    // Body battery via authenticated fetch (trying connectapi.garmin.com base)
    const bodyBatRaw = await garminApiFetch(gc,
      `/wellness-service/wellness/bodyBattery/bulletPoint?startDate=${today}&endDate=${today}`)
    let bodyBattery = null
    if (Array.isArray(bodyBatRaw) && bodyBatRaw.length) {
      bodyBattery = bodyBatRaw[bodyBatRaw.length - 1]?.bodyBatteryLevel ?? null
    }
    console.log('[garmin-sync] bodyBat result:', bodyBattery)

    // HRV dedicated endpoint
    const hrvRaw = await garminApiFetch(gc, `/hrv-service/hrv/${today}`)
    const hrvFromEndpoint = hrvRaw?.lastNight?.avgHrv ?? hrvRaw?.avgHrv ?? null
    const finalHrv = hrv ?? hrvFromEndpoint  // prefer sleep DTO, fall back to endpoint

    console.log(`[garmin-sync] extracted — HRV:${finalHrv} sleep:${sleepScore} RHR:${rhr} rhr7:${rhr7} stress:${stress} battery:${bodyBattery} spo2:${spo2}`)

    const readiness = calcReadiness({
      hrv: finalHrv, hrvBaseLo, hrvBaseHi,
      rhr, rhr7, sleep: sleepScore, stress, bodyBattery,
    })
    const recoveryHrs = readiness >= 70 ? '1 hr' : readiness >= 50 ? '4 hr' : '24 hr'
    const hrvStatus = finalHrv != null
      ? (finalHrv >= hrvBaseLo && finalHrv <= hrvBaseHi ? 'Balanced' : finalHrv > hrvBaseHi ? 'High' : 'Low')
      : null

    console.log(`[garmin-sync] readiness: ${readiness}`)

    try {
      await sbPost('fitness_snapshot', {
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
      })
      console.log('[garmin-sync] snapshot written')
    } catch (e) {
      errors.push('snapshot: ' + e.message)
      console.error('[garmin-sync] snapshot error:', e.message)
    }

    if (finalHrv != null) {
      await sbPost('hrv_trend',
        [{ athlete_id: ATHLETE_ID, day: today, hrv: Math.round(finalHrv) }],
        'athlete_id,day',
      ).catch(e => errors.push('hrv_trend: ' + e.message))
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
        await sbPost('recent_runs', {
          athlete_id: ATHLETE_ID, garmin_activity_id: actId,
          run_date: dateStr, title: run.activityName || run.name || 'Run',
          distance_km: distKm, pace: calculatePace(distM, movSec || durSec),
          avg_hr: run.averageHR || null, relative_effort: run.trainingEffect ?? null,
        }, 'garmin_activity_id')

        const existing = await sbGet('activity_details',
          `garmin_activity_id=eq.${actId}&select=id&limit=1`).catch(() => [])
        if (existing.length > 0) { activitiesWritten++; continue }

        const [detailRes, splitsRes] = await Promise.allSettled([
          gc.getActivity({ activityId: actId }),
          gc.getActivitySplits({ activityId: actId }),
        ])
        const d  = detailRes.status === 'fulfilled' ? detailRes.value : null
        const sp = splitsRes.status === 'fulfilled' ? splitsRes.value : null

        const detailRows = await sbPost('activity_details', {
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
        }, 'garmin_activity_id')

        const detailId = Array.isArray(detailRows) ? detailRows[0]?.id : detailRows?.id
        if (detailId && sp) {
          const laps = (sp?.lapDTOs || sp?.laps || []).filter(l => (l.distance || 0) > 100)
          if (laps.length) {
            await sbPost('activity_laps', laps.map((l, i) => {
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
            }), 'activity_id,lap_number').catch(e => errors.push('laps: ' + e.message))
          }
        }

        activitiesWritten++
      } catch (e) {
        errors.push(`activity ${actId}: ${e.message}`)
      }
    }

    await sbPost('daily_sync_log', {
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
      await sbPost('daily_sync_log', {
        sync_date: todayAEST(), synced_at: new Date().toISOString(),
        status: 'error', error_msg: err.message, activities_written: 0,
      }, 'sync_date')
    } catch { /* swallow */ }
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
