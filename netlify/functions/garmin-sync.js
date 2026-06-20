// netlify/functions/garmin-sync.js
// Schedule: every 30 minutes
//
// KEY FINDING from logs:
// - gc.client exists (that's where auth lives)
// - gc.getSleepData, gc.getHeartRate, gc.getSteps all exist as methods!
// - gc.get() fails with relative paths ("Invalid URL")
// - Solution: use gc.getSleepData(date) and gc.getHeartRate(date) directly,
//   then extract auth from gc.client for the endpoints without wrappers

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

// Use gc.client to make authenticated REST calls to Garmin
async function clientGet(gc, path) {
  try {
    const client = gc.client
    if (!client) return null
    // gc.client is the underlying HTTP client — call its get() method
    const res = await client.get(path)
    // If it returns a response object, parse it
    if (res && typeof res === 'object' && 'data' in res) return res.data
    return res
  } catch (e) {
    console.log(`[garmin-sync] clientGet(${path}) failed:`, e.message?.slice(0, 100))
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

    // Log gc.client keys to understand its structure
    if (gc.client) {
      console.log('[garmin-sync] gc.client keys:', Object.keys(gc.client).join(', '))
      const clientProto = Object.getOwnPropertyNames(Object.getPrototypeOf(gc.client))
      console.log('[garmin-sync] gc.client methods:', clientProto.filter(m => m !== 'constructor').join(', '))
    }

    // Use the ACTUAL methods that exist on gc (confirmed from logs):
    // getSleepData, getHeartRate, getSteps, getSleepDuration
    const dateObj = new Date(today + 'T00:00:00')

    const [sleepRes, heartRes, activitiesRes] = await Promise.allSettled([
      gc.getSleepData(dateObj),
      gc.getHeartRate(dateObj),
      gc.getActivities(0, 20),
    ])

    const sleepRaw = sleepRes.status === 'fulfilled' ? sleepRes.value : null
    const heartRaw = heartRes.status === 'fulfilled' ? heartRes.value : null
    const rawActs  = activitiesRes.status === 'fulfilled'
      ? (Array.isArray(activitiesRes.value)
          ? activitiesRes.value
          : activitiesRes.value?.activityList || activitiesRes.value?.activities || [])
      : []

    if (sleepRes.status === 'rejected') console.log('[garmin-sync] getSleepData error:', sleepRes.reason?.message)
    if (heartRes.status === 'rejected') console.log('[garmin-sync] getHeartRate error:', heartRes.reason?.message)

    // Log raw shapes (first 500 chars each)
    console.log('[garmin-sync] sleepRaw:', JSON.stringify(sleepRaw)?.slice(0, 500))
    console.log('[garmin-sync] heartRaw:', JSON.stringify(heartRaw)?.slice(0, 500))

    // Also try clientGet for body battery and HRV
    const [bodyBatRaw, hrvRaw] = await Promise.all([
      clientGet(gc, `/wellness-service/wellness/bodyBattery/bulletPoint?startDate=${today}&endDate=${today}`),
      clientGet(gc, `/hrv-service/hrv/${today}`),
    ])
    console.log('[garmin-sync] bodyBatRaw:', JSON.stringify(bodyBatRaw)?.slice(0, 200))
    console.log('[garmin-sync] hrvRaw:', JSON.stringify(hrvRaw)?.slice(0, 200))

    // Extract from sleep (getSleepData confirmed to exist)
    const sleepDTO   = sleepRaw?.dailySleepDTO || sleepRaw || {}
    const sleepScore = sleepDTO.sleepScores?.overall?.value
      ?? sleepDTO.sleepScore
      ?? sleepDTO.overallSleepScore
      ?? null
    const hrv = sleepDTO.avgOvernightHrv
      ?? sleepDTO.averageOvernightHrv
      ?? sleepDTO.avgHrv
      ?? null
    const hrvBaseLo = sleepDTO.baselineBalancedLow    ?? 40
    const hrvBaseHi = sleepDTO.baselineBalancedUpper  ?? 49
    const stress    = sleepDTO.avgSleepStress          ?? null

    // Extract from heart rate (getHeartRate confirmed to exist)
    const rhr  = heartRaw?.restingHeartRate
      ?? heartRaw?.rhrValue
      ?? heartRaw?.resting_heart_rate_bpm
      ?? null
    const rhr7 = heartRaw?.lastSevenDaysAvgRestingHeartRate
      ?? heartRaw?.last_7_days_avg_resting_hr
      ?? null

    // Body battery from clientGet or heartRaw
    let bodyBattery = null
    if (Array.isArray(bodyBatRaw) && bodyBatRaw.length) {
      bodyBattery = bodyBatRaw[bodyBatRaw.length - 1]?.bodyBatteryLevel ?? null
    }
    bodyBattery = bodyBattery
      ?? heartRaw?.bodyBatteryMostRecentValue
      ?? heartRaw?.bodyBattery
      ?? null

    // VO2 if heartRaw has it
    const vo2 = heartRaw?.vo2MaxPreciseValue ?? heartRaw?.vo2Max ?? null

    const spo2 = sleepDTO.averageSpO2Value ?? null

    console.log(`[garmin-sync] extracted — HRV:${hrv} sleep:${sleepScore} RHR:${rhr} stress:${stress} battery:${bodyBattery}`)

    const readiness = calcReadiness({ hrv, hrvBaseLo, hrvBaseHi, rhr, rhr7, sleep: sleepScore, stress, bodyBattery })
    const recoveryHrs = readiness >= 70 ? '1 hr' : readiness >= 50 ? '4 hr' : '24 hr'
    const hrvStatus = hrv != null
      ? (hrv >= hrvBaseLo && hrv <= hrvBaseHi ? 'Balanced' : hrv > hrvBaseHi ? 'High' : 'Low')
      : null

    console.log(`[garmin-sync] readiness: ${readiness}`)

    try {
      await sbPost('fitness_snapshot', {
        athlete_id: ATHLETE_ID,
        synced_at:  new Date().toISOString(),
        readiness, recovery_hrs: recoveryHrs,
        rhr, rhr_7day: rhr7,
        hrv: hrv != null ? Math.round(hrv) : null,
        hrv_status: hrvStatus,
        sleep: sleepScore,
        body_battery: bodyBattery != null ? Math.round(bodyBattery) : null,
        stress: stress != null ? Math.round(stress) : null,
        spo2, vo2, lt_hr: 173,
        training_status: null, acute_load: null, chronic_load: null,
        acwr: null, chronic_band_lo: 257, chronic_band_hi: 482, balance: null,
      })
      console.log('[garmin-sync] snapshot written')
    } catch (e) {
      errors.push('snapshot: ' + e.message)
      console.error('[garmin-sync] snapshot error:', e.message)
    }

    if (hrv != null) {
      await sbPost('hrv_trend',
        [{ athlete_id: ATHLETE_ID, day: today, hrv: Math.round(hrv) }],
        'athlete_id,day',
      ).catch(e => errors.push('hrv_trend: ' + e.message))
    }

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
        const d  = detailRes.status  === 'fulfilled' ? detailRes.value  : null
        const sp = splitsRes.status  === 'fulfilled' ? splitsRes.value  : null

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
          workout_feel: d?.workoutFeel || null,
          workout_rpe: d?.workoutRpe || null,
        }, 'garmin_activity_id')

        const detailId = Array.isArray(detailRows) ? detailRows[0]?.id : detailRows?.id
        if (detailId && sp) {
          const laps = (sp?.lapDTOs || sp?.laps || []).filter(l => (l.distance || 0) > 100)
          if (laps.length) {
            await sbPost('activity_laps', laps.map((l, i) => {
              const lapDist = l.distance || 0
              const lapMov  = l.movingDuration || l.duration || 0
              return {
                activity_id: detailId, lap_number: l.lapIndex ?? i,
                distance_m: parseFloat(lapDist.toFixed(2)),
                duration_seconds: parseFloat((l.duration || 0).toFixed(3)),
                avg_pace: lapDist > 100 && lapMov > 0 ? calculatePace(lapDist, lapMov) : null,
                avg_hr: l.averageHR || null, max_hr: l.maxHR || null,
                avg_cadence: l.averageCadence ? Math.round(l.averageCadence) : null,
                elevation_gain_m: l.elevationGain || null,
                intensity_type: l.intensityType || null,
              }
            }), 'activity_id,lap_number').catch(e => errors.push('laps: ' + e.message))
          }
        }

        activitiesWritten++
        console.log(`[garmin-sync] wrote activity ${actId}`)
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

    console.log(`[garmin-sync] done — readiness:${readiness} hrv:${hrv} battery:${bodyBattery} activities:${activitiesWritten} errors:${errors.length}`)

    return new Response(JSON.stringify({
      ok: true, today, readiness, hrv, bodyBattery, stress, rhr, sleepScore, activitiesWritten, errors,
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
