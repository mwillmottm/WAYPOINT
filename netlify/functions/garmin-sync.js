// netlify/functions/garmin-sync.js
// Runs 4x daily at 4:30am, 8am, midday, 7pm AEST
// Syncs health data,// netlify/functions/garmin-sync.js
// Runs 4x daily: 4:30am, 8am, midday, 7pm AEST
//
// REQUIRED ENV VARS in Netlify → Site configuration → Environment variables:
//   GARMIN_EMAIL          your Garmin Connect login email
//   GARMIN_PASSWORD       your Garmin Connect password
//   SUPABASE_URL          https://pvmthpqjaqqnfpzwiade.supabase.co
//   SUPABASE_SERVICE_KEY  service_role key from Supabase → Project Settings → API
//   ATHLETE_ID            0a1d0000-0000-4000-8000-00000000a001

import pkg from 'garmin-connect'
const { GarminConnect } = pkg

const SUPABASE_URL        = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const ATHLETE_ID          = process.env.ATHLETE_ID

// 4:30am AEST=18:30UTC | 8am AEST=22:00UTC | 12pm AEST=02:00UTC | 7pm AEST=09:00UTC
export const config = {
  schedule: ['30 18 * * *', '0 22 * * *', '0 2 * * *', '0 9 * * *'],
}

// ---- helpers ----
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

// Composite readiness 0-100 from available Garmin signals
function calcReadiness({ hrv, hrvBaseLo, hrvBaseHi, rhr, rhr7, sleep, stress, bodyBattery }) {
  let score = 50
  if (hrv && hrvBaseLo && hrvBaseHi) {
    const mid = (hrvBaseLo + hrvBaseHi) / 2
    const range = Math.max((hrvBaseHi - hrvBaseLo) / 2, 3)
    score += Math.max(-20, Math.min(20, ((hrv - mid) / range) * 15))
  }
  if (rhr && rhr7) score += Math.max(-15, Math.min(15, (rhr7 - rhr) * 3))
  if (sleep)        score += (sleep - 60) * 0.5
  if (stress != null) score += (50 - stress) * 0.2
  if (bodyBattery != null) score += (bodyBattery - 50) * 0.15
  return Math.round(Math.max(0, Math.min(100, score)))
}

// ---- Supabase helpers ----
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

// ---- main ----
export default async function handler() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ATHLETE_ID) {
    const missing = [
      !SUPABASE_URL && 'SUPABASE_URL',
      !SUPABASE_SERVICE_KEY && 'SUPABASE_SERVICE_KEY',
      !ATHLETE_ID && 'ATHLETE_ID',
    ].filter(Boolean).join(', ')
    return new Response(JSON.stringify({ ok: false, error: `Missing env vars: ${missing}` }), { status: 500 })
  }

  const today = todayAEST()
  console.log(`[garmin-sync] starting for ${today}`)
  let activitiesWritten = 0
  const errors = []

  try {
    // ---- 1. Login ----
    const gc = new GarminConnect({
      username: process.env.GARMIN_EMAIL,
      password: process.env.GARMIN_PASSWORD,
    })
    await gc.login()
    console.log('[garmin-sync] logged in')

    // ---- 2. Pull health data in parallel using methods confirmed to work ----
    // Based on garmin-connect@1.6.2 API:
    //   getStats(date)       → steps, RHR, stress, body battery, SpO2
    //   getSleepData(date)   → sleep score, HRV (avg_overnight_hrv), sleep stages
    //   getUserProfile()     → VO2 max
    //   getActivities(0,20)  → recent activities
    // getHrvData and getTrainingStatus may not exist in 1.6.2 — we try them but don't depend on them
    const [
      statsRes,
      sleepRes,
      profileRes,
      trainingRes,
      activitiesRes,
    ] = await Promise.allSettled([
      gc.getStats(today),
      gc.getSleepData(today),
      gc.getUserProfile(),
      // try training status — may not exist in this library version
      typeof gc.getTrainingStatus === 'function'
        ? gc.getTrainingStatus(today)
        : Promise.reject('no method'),
      gc.getActivities(0, 20),
    ])

    const stats    = statsRes.status    === 'fulfilled' ? statsRes.value    : {}
    const sleep    = sleepRes.status    === 'fulfilled' ? sleepRes.value    : {}
    const profile  = profileRes.status  === 'fulfilled' ? profileRes.value  : {}
    const training = trainingRes.status === 'fulfilled' ? trainingRes.value : {}
    const rawActs  = activitiesRes.status === 'fulfilled'
      ? (Array.isArray(activitiesRes.value)
          ? activitiesRes.value
          : activitiesRes.value?.activityList || activitiesRes.value?.activities || [])
      : []

    console.log('[garmin-sync] stats keys:', Object.keys(stats).slice(0, 6).join(', '))
    console.log('[garmin-sync] sleep keys:', Object.keys(sleep).slice(0, 6).join(', '))
    console.log('[garmin-sync] activities count:', rawActs.length)

    // ---- 3. Extract values — map every known field name variant ----

    // RHR + stress + body battery + SpO2 all come from getStats
    const rhr          = stats.restingHeartRate          ?? stats.resting_heart_rate_bpm ?? null
    const rhr7         = stats.lastSevenDaysAvgRestingHeartRate ?? stats.last_7_days_avg_resting_hr ?? null
    const stress       = stats.averageStressLevel        ?? stats.avg_stress_level        ?? null
    // body battery: try current first, fall back to highest (best proxy for "charged")
    const bodyBatteryCurrent = stats.bodyBatteryCurrent  ?? stats.body_battery_current    ?? null
    const bodyBatteryHigh    = stats.bodyBatteryHighestValue ?? stats.body_battery_highest ?? null
    const spo2         = stats.averageSpo2               ?? stats.avg_spo2_percent        ?? null

    // HRV lives inside getSleepData response — confirmed via MCP pull
    // Path: sleep.dailySleepDTO.avgOvernightHrv  OR  sleep.avg_overnight_hrv
    const sleepDTO     = sleep.dailySleepDTO || sleep
    const hrvVal       = sleepDTO.avgOvernightHrv
                      ?? sleepDTO.avg_overnight_hrv
                      ?? sleep.avgOvernightHrv
                      ?? null
    const sleepScore   = sleepDTO.sleepScores?.overall?.value
                      ?? sleepDTO.sleepScore
                      ?? sleep.sleepScore
                      ?? sleep.sleep_score
                      ?? null

    // Baseline for HRV — use sensible personal defaults if not available
    const hrvBaseLo    = sleepDTO.baselineBalancedLow   ?? 40
    const hrvBaseHi    = sleepDTO.baselineBalancedUpper ?? 49

    // VO2 from profile
    const vo2          = profile.userData?.vo2MaxRunning
                      ?? profile.vo2MaxRunning
                      ?? training.vo2Max
                      ?? training.vo2_max
                      ?? null

    // Training load from training status (may be null if method not available)
    const acuteLoad    = training.acuteLoad   ?? training.acute_load   ?? null
    const chronicLoad  = training.chronicLoad ?? training.chronic_load ?? null
    const acwr         = training.loadRatio   ?? training.load_ratio   ?? null
    const trainingStatus = training.trainingStatusFeedback ?? training.training_status_feedback ?? null
    const chronicLo    = training.optimalChronicLoadMin ?? training.optimal_chronic_load_min ?? 257
    const chronicHi    = training.optimalChronicLoadMax ?? training.optimal_chronic_load_max ?? 482
    const balance      = training.trainingBalanceFeedback ?? training.training_balance_feedback ?? null

    console.log(`[garmin-sync] HRV: ${hrvVal}, sleep: ${sleepScore}, RHR: ${rhr}, bodyBattery: ${bodyBatteryCurrent}`)

    // ---- 4. Calculate composite readiness ----
    const readiness = calcReadiness({
      hrv: hrvVal, hrvBaseLo, hrvBaseHi,
      rhr, rhr7,
      sleep: sleepScore,
      stress,
      bodyBattery: bodyBatteryCurrent ?? bodyBatteryHigh,
    })

    const recoveryHrs = acuteLoad != null
      ? (acuteLoad > 400 ? '48 hr' : acuteLoad > 280 ? '24 hr' : acuteLoad > 180 ? '4 hr' : '1 hr')
      : (readiness < 50 ? '24 hr' : '1 hr')

    console.log(`[garmin-sync] readiness: ${readiness}`)

    // ---- 5. Write fitness snapshot ----
    try {
      await sbPost('fitness_snapshot', {
        athlete_id:      ATHLETE_ID,
        synced_at:       new Date().toISOString(),
        readiness,
        recovery_hrs:    recoveryHrs,
        rhr,
        rhr_7day:        rhr7,
        hrv:             hrvVal != null ? Math.round(hrvVal) : null,
        hrv_status:      hrvVal != null
          ? (hrvVal >= hrvBaseLo && hrvVal <= hrvBaseHi ? 'Balanced'
            : hrvVal > hrvBaseHi ? 'High' : 'Low')
          : null,
        sleep:           sleepScore,
        body_battery:    bodyBatteryHigh ?? bodyBatteryCurrent,
        stress,
        spo2,
        vo2,
        lt_hr:           173,   // static — only changes after a Garmin LT test
        training_status: trainingStatus,
        acute_load:      acuteLoad,
        chronic_load:    chronicLoad,
        acwr,
        chronic_band_lo: chronicLo,
        chronic_band_hi: chronicHi,
        balance,
      })
      console.log('[garmin-sync] snapshot written')
    } catch (e) {
      errors.push('snapshot: ' + e.message)
      console.error('[garmin-sync] snapshot error:', e.message)
    }

    // ---- 6. Update HRV trend ----
    if (hrvVal != null) {
      try {
        await sbPost('hrv_trend',
          [{ athlete_id: ATHLETE_ID, day: today, hrv: Math.round(hrvVal) }],
          'athlete_id,day',
        )
      } catch (e) {
        errors.push('hrv_trend: ' + e.message)
      }
    }

    // ---- 7. Process run activities ----
    const runs = rawActs.filter((a) => {
      const type = a.activityType?.typeKey || a.type || ''
      const dist = a.distance || a.distanceMeters || a.distance_meters || 0
      return type.includes('running') && dist > 500
    })

    console.log(`[garmin-sync] processing ${runs.length} runs`)

    for (const run of runs.slice(0, 15)) {
      const actId  = run.activityId || run.id
      const distM  = run.distance || run.distanceMeters || run.distance_meters || 0
      const distKm = parseFloat((distM / 1000).toFixed(2))
      const movSec = run.movingDuration || run.moving_duration_seconds || 0
      const durSec = run.duration || run.duration_seconds || 0
      const dateStr = (run.startTimeLocal || run.start_time || run.start_time_local || today).slice(0, 10)
      const pace   = calculatePace(distM, movSec || durSec)
      const avgHr  = run.averageHR || run.avg_hr_bpm || null
      const elevGain = run.elevationGain || run.elevation_gain_meters || null
      const cals   = run.calories || null

      try {
        // Upsert into recent_runs (lightweight list)
        await sbPost('recent_runs', {
          athlete_id:          ATHLETE_ID,
          garmin_activity_id:  actId,
          run_date:            dateStr,
          title:               run.activityName || run.name || 'Run',
          distance_km:         distKm,
          pace,
          avg_hr:              avgHr,
          relative_effort:     run.trainingEffect ?? null,
        }, 'garmin_activity_id')

        // Skip full detail if already stored
        const existing = await sbGet('activity_details',
          `garmin_activity_id=eq.${actId}&select=id&limit=1`).catch(() => [])
        if (existing.length > 0) { activitiesWritten++; continue }

        // Pull full detail in parallel
        const [detailRes, splitsRes, hrZonesRes, teRes] = await Promise.allSettled([
          gc.getActivity({ activityId: actId }),
          gc.getActivitySplits({ activityId: actId }),
          typeof gc.getActivityHrInTimezones === 'function'
            ? gc.getActivityHrInTimezones({ activityId: actId })
            : Promise.reject('no method'),
          typeof gc.getTrainingEffect === 'function'
            ? gc.getTrainingEffect({ activityId: actId })
            : Promise.reject('no method'),
        ])

        const d  = detailRes.status  === 'fulfilled' ? detailRes.value  : null
        const sp = splitsRes.status  === 'fulfilled' ? splitsRes.value  : null
        const hz = hrZonesRes.status === 'fulfilled' ? hrZonesRes.value : null
        const te = teRes.status      === 'fulfilled' ? teRes.value      : null

        const detailRows = await sbPost('activity_details', {
          athlete_id:               ATHLETE_ID,
          garmin_activity_id:       actId,
          activity_date:            dateStr,
          start_time_local:         run.startTimeLocal || run.start_time_local || null,
          name:                     run.activityName || run.name || 'Run',
          type:                     'running',
          distance_km:              distKm,
          duration_seconds:         Math.round(durSec),
          moving_duration_seconds:  Math.round(movSec),
          pace_avg:                 pace,
          pace_best:                d?.maxSpeed ? calculatePace(1000, 1000 / d.maxSpeed) : null,
          avg_hr:                   d?.avgHrBpm  || avgHr,
          max_hr:                   d?.maxHrBpm  || run.maxHR || null,
          min_hr:                   d?.minHrBpm  || null,
          avg_cadence:              d?.avgCadence ? Math.round(d.avgCadence) : null,
          avg_power_watts:          d?.avgPowerWatts          ?? null,
          normalized_power_watts:   d?.normalizedPowerWatts   ?? null,
          avg_stride_cm:            d?.avgStrideLength         ?? null,
          avg_ground_contact_ms:    d?.avgGroundContactTime    ?? null,
          avg_vertical_osc_cm:      d?.avgVerticalOscillation  ?? null,
          training_load:            te?.trainingLoad  ?? d?.trainingLoad  ?? null,
          aerobic_effect:           te?.aerobicEffect ?? d?.trainingEffect ?? null,
          anaerobic_effect:         te?.anaerobicEffect ?? d?.anaerobicTrainingEffect ?? null,
          training_effect_label:    te?.trainingEffectLabel ?? d?.trainingEffectLabel ?? null,
          calories:                 d?.calories || cals,
          elevation_gain_m:         d?.elevationGain || elevGain,
          elevation_loss_m:         d?.elevationLoss || null,
          max_elevation_m:          d?.maxElevation  || null,
          min_elevation_m:          d?.minElevation  || null,
          workout_feel:             d?.workoutFeel   || null,
          workout_rpe:              d?.workoutRpe    || null,
          body_battery_impact:      d?.bodyBatteryImpact || null,
          recovery_hr_bpm:          d?.recoveryHrBpm || null,
        }, 'garmin_activity_id')

        const detailId = Array.isArray(detailRows) ? detailRows[0]?.id : detailRows?.id

        if (detailId) {
          // Write laps
          const laps = sp?.lapDTOs || sp?.laps || []
          const meaningfulLaps = laps.filter((l) => (l.distance || l.distanceMeters || 0) > 100)
          if (meaningfulLaps.length) {
            const lapRows = meaningfulLaps.map((l) => {
              const lapDist = l.distance || l.distanceMeters || l.distance_meters || 0
              const lapMov  = l.movingDuration || l.moving_duration_seconds || l.duration || 0
              return {
                activity_id:     detailId,
                lap_number:      l.lapIndex ?? l.lap_number,
                distance_m:      parseFloat(lapDist.toFixed(2)),
                duration_seconds: parseFloat((l.duration || 0).toFixed(3)),
                avg_pace:        lapDist > 100 && lapMov > 0 ? calculatePace(lapDist, lapMov) : null,
                avg_hr:          l.averageHR  || l.avg_hr_bpm || null,
                max_hr:          l.maxHR      || l.max_hr_bpm || null,
                avg_cadence:     (l.averageCadence || l.avg_cadence)
                  ? Math.round(l.averageCadence || l.avg_cadence) : null,
                avg_power_watts: l.avgPower || l.avg_power_watts || null,
                elevation_gain_m: l.elevationGain || l.elevation_gain_meters || null,
                intensity_type:  l.intensityType || l.intensity_type || null,
              }
            })
            await sbPost('activity_laps', lapRows, 'activity_id,lap_number')
              .catch((e) => errors.push('laps: ' + e.message))
          }

          // Write HR zones
          const zones = Array.isArray(hz) ? hz : hz?.timeInHeartRateZones || []
          if (zones.length) {
            await sbPost('activity_hr_zones',
              zones.map((z) => ({
                activity_id:  detailId,
                zone_number:  z.zoneNumber,
                secs_in_zone: z.secsInZone,
                zone_low_bpm: z.zoneLowBoundary,
              })),
              'activity_id,zone_number',
            ).catch((e) => errors.push('hr_zones: ' + e.message))
          }
        }

        activitiesWritten++
        console.log(`[garmin-sync] wrote activity ${actId} (${run.activityName || 'Run'})`)

      } catch (e) {
        errors.push(`activity ${actId}: ${e.message}`)
        console.error(`[garmin-sync] activity error:`, e.message)
      }
    }

    // ---- 8. Write sync log ----
    await sbPost('daily_sync_log', {
      sync_date:          today,
      synced_at:          new Date().toISOString(),
      status:             errors.length ? 'partial' : 'ok',
      error_msg:          errors.length ? errors.slice(0, 3).join('; ') : null,
      activities_written: activitiesWritten,
    }, 'sync_date')

    console.log(`[garmin-sync] done — readiness ${readiness}, ${activitiesWritten} activities, ${errors.length} errors`)

    return new Response(JSON.stringify({
      ok: true, today, readiness, hrv: hrvVal, bodyBattery: bodyBatteryCurrent,
      activitiesWritten, errors,
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
} HRV, readiness, training load + full activity detail

import pkg from 'garmin-connect'
const { GarminConnect } = pkg

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const ATHLETE_ID = process.env.ATHLETE_ID

// 4:30am AEST = 18:30 UTC prev day | 8am = 22:00 UTC prev day | 12pm = 02:00 UTC | 7pm = 09:00 UTC
export const config = {
  schedule: ['30 18 * * *', '0 22 * * *', '0 2 * * *', '0 9 * * *'],
}

const SB_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=representation',
}

function todayAEST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Brisbane',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function calculatePace(distanceMeters, durationSeconds) {
  if (!distanceMeters || !durationSeconds || distanceMeters < 100) return null
  const distKm = distanceMeters / 1000
  const secPerKm = durationSeconds / distKm
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtDuration(sec) {
  if (!sec) return null
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.round(sec % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`
}

// Readiness score: 0-100 composite from HRV, RHR, sleep, stress, body battery
// Mirrors what Garmin's own readiness would show based on available signals
function calcReadiness({ hrv, hrvBaseLo, hrvBaseHi, rhr, rhr7, sleep, stress, bodyBattery }) {
  let score = 50 // baseline

  // HRV vs personal baseline (±20 pts)
  if (hrv && hrvBaseLo && hrvBaseHi) {
    const mid = (hrvBaseLo + hrvBaseHi) / 2
    const range = (hrvBaseHi - hrvBaseLo) / 2 || 4
    const delta = (hrv - mid) / range
    score += Math.max(-20, Math.min(20, delta * 15))
  }

  // RHR vs 7-day average (±15 pts)
  if (rhr && rhr7) {
    const delta = rhr7 - rhr // positive = today lower = better
    score += Math.max(-15, Math.min(15, delta * 3))
  }

  // Sleep score 0-100 (±20 pts)
  if (sleep) {
    score += (sleep - 60) * 0.5
  }

  // Stress 0-100, lower = better (±10 pts)
  if (stress != null) {
    score += (50 - stress) * 0.2
  }

  // Body battery current (±10 pts)
  if (bodyBattery != null) {
    score += (bodyBattery - 50) * 0.15
  }

  return Math.round(Math.max(0, Math.min(100, score)))
}

// Strain score 0-21 (Whoop-style) from training load + session intensity
function calcStrain({ acuteLoad, stress, sessionKind }) {
  const kindWeight = {
    rest: 0, recovery: 2, easy: 5, aerobic: 7, b2b: 8,
    long: 10, threshold: 13, tempo: 13, hills: 14,
    reps: 15, vo2: 16, race: 21,
  }
  const base = kindWeight[sessionKind] ?? 6
  const loadFactor = Math.min((acuteLoad || 200) / 300, 1.2)
  const stressFactor = 1 + ((stress || 25) - 20) / 200
  return Math.min(21, Math.max(0, Math.round(base * loadFactor * stressFactor)))
}

async function sbPost(table, rows, onConflict) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`
  const res = await fetch(url, {
    method: 'POST', headers: SB_HEADERS,
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  })
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  const json = await res.json().catch(() => [])
  return Array.isArray(json) ? json : [json]
}

async function sbGet(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  })
  if (!res.ok) throw new Error(`GET ${table}: ${res.status}`)
  return res.json()
}

export default async function handler() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ATHLETE_ID) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing env vars' }), { status: 500 })
  }

  const today = todayAEST()
  console.log(`[garmin-sync] starting for ${today}`)
  let activitiesWritten = 0
  const errors = []

  try {
    const gc = new GarminConnect({ username: process.env.GARMIN_EMAIL, password: process.env.GARMIN_PASSWORD })
    await gc.login()
    console.log('[garmin-sync] logged in')

    // Pull all health data in parallel
    const [statsRes, sleepRes, hrvRes, trainingRes, activitiesRes] = await Promise.allSettled([
      gc.getStats(today),
      gc.getSleepData(today),
      gc.getHrvData ? gc.getHrvData(today) : Promise.reject('no method'),
      gc.getTrainingStatus ? gc.getTrainingStatus(today) : Promise.reject('no method'),
      gc.getActivities(0, 20),
    ])

    const stats    = statsRes.status    === 'fulfilled' ? statsRes.value    : {}
    const sleep    = sleepRes.status    === 'fulfilled' ? sleepRes.value    : {}
    const hrv      = hrvRes.status      === 'fulfilled' ? hrvRes.value      : {}
    const training = trainingRes.status === 'fulfilled' ? trainingRes.value : {}
    const rawActs  = activitiesRes.status === 'fulfilled'
      ? (Array.isArray(activitiesRes.value) ? activitiesRes.value : activitiesRes.value?.activities || activitiesRes.value?.activityList || [])
      : []

    console.log('[garmin-sync] raw stats keys:', Object.keys(stats).slice(0,8))
    console.log('[garmin-sync] sleep keys:', Object.keys(sleep).slice(0,8))
    console.log('[garmin-sync] hrv:', JSON.stringify(hrv).slice(0,200))
    console.log('[garmin-sync] training keys:', Object.keys(training).slice(0,8))

    // Extract health signals — map all known field name variants
    const rhr         = stats.restingHeartRate  ?? stats.resting_heart_rate_bpm ?? null
    const rhr7        = stats.lastSevenDaysAvgRestingHeartRate ?? stats.last_7_days_avg_resting_hr ?? null
    const bodyBattery = stats.bodyBatteryCurrent ?? stats.body_battery_current ?? stats.bodyBatteryHighestValue ?? null
    const bodyBatteryHi = stats.bodyBatteryHighestValue ?? stats.body_battery_highest ?? null
    const stress      = stats.averageStressLevel ?? stats.avg_stress_level ?? null
    const spo2        = stats.averageSpo2 ?? stats.avg_spo2_percent ?? null

    const sleepScore  = sleep?.dailySleepDTO?.sleepScores?.overall?.value
      ?? sleep?.sleepScore ?? sleep?.sleep_score ?? null
    const sleepHrv    = sleep?.dailySleepDTO?.avgOvernightHrv
      ?? sleep?.avg_overnight_hrv ?? null

    const hrvVal      = hrv?.lastNightAvgHrv ?? hrv?.last_night_avg_hrv_ms ?? sleepHrv ?? null
    const hrvHigh     = hrv?.lastNight5MinHighHrv ?? hrv?.last_night_5min_high_hrv_ms ?? null
    const hrvStatus   = hrv?.status ?? null
    const hrvBaseLo   = hrv?.baselineBalancedLow ?? hrv?.baseline_balanced_low_ms ?? 40
    const hrvBaseHi   = hrv?.baselineBalancedUpper ?? hrv?.baseline_balanced_upper_ms ?? 49

    const acuteLoad   = training?.acuteLoad  ?? training?.acute_load  ?? null
    const chronicLoad = training?.chronicLoad ?? training?.chronic_load ?? null
    const acwr        = training?.loadRatio   ?? training?.load_ratio   ?? null
    const vo2         = training?.vo2Max      ?? training?.vo2_max      ?? null
    const trainingStatus = training?.trainingStatusFeedback ?? training?.training_status_feedback ?? null
    const chronicLo   = training?.optimalChronicLoadMin ?? training?.optimal_chronic_load_min ?? 257
    const chronicHi   = training?.optimalChronicLoadMax ?? training?.optimal_chronic_load_max ?? 482
    const balance     = training?.trainingBalanceFeedback ?? training?.training_balance_feedback ?? null

    // Calculate composite readiness and recovery
    const readinessScore = calcReadiness({
      hrv: hrvVal, hrvBaseLo, hrvBaseHi,
      rhr, rhr7, sleep: sleepScore, stress, bodyBattery,
    })

    // Determine recovery time from training load
    const recoveryHrs = acuteLoad != null
      ? acuteLoad > 400 ? '48 hr' : acuteLoad > 280 ? '24 hr' : acuteLoad > 180 ? '4 hr' : '1 hr'
      : null

    // Write fitness snapshot
    try {
      await sbPost('fitness_snapshot', {
        athlete_id: ATHLETE_ID,
        synced_at: new Date().toISOString(),
        readiness: readinessScore,
        recovery_hrs: recoveryHrs,
        rhr, rhr_7day: rhr7,
        hrv: hrvVal ? Math.round(hrvVal) : null,
        hrv_status: hrvStatus,
        sleep: sleepScore,
        body_battery: bodyBatteryHi ?? bodyBattery,
        stress, spo2,
        vo2, lt_hr: 173,
        training_status: trainingStatus,
        acute_load: acuteLoad,
        chronic_load: chronicLoad,
        acwr,
        chronic_band_lo: chronicLo,
        chronic_band_hi: chronicHi,
        balance,
      })
      console.log('[garmin-sync] snapshot written — readiness:', readinessScore)
    } catch (e) { errors.push('snapshot: ' + e.message) }

    // Update HRV trend
    if (hrvVal) {
      try {
        await sbPost('hrv_trend',
          [{ athlete_id: ATHLETE_ID, day: today, hrv: Math.round(hrvVal) }],
          'athlete_id,day')
      } catch (e) { errors.push('hrv: ' + e.message) }
    }

    // Process activities
    const runs = rawActs.filter((a) => {
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
      const dateStr = (run.startTimeLocal || run.start_time || run.start_time_local || today).slice(0, 10)
      const pace   = calculatePace(distM, movSec || durSec)
      const avgHr  = run.averageHR || run.avg_hr_bpm || null
      const maxHr  = run.maxHR || run.max_hr_bpm || null
      const elevGain = run.elevationGain || run.elevation_gain_meters || null
      const cals   = run.calories || null
      const steps  = run.steps || null
      const cadence = run.averageRunningCadenceInStepsPerMinute
        ? Math.round(run.averageRunningCadenceInStepsPerMinute)
        : null

      try {
        await sbPost('recent_runs', {
          athlete_id: ATHLETE_ID,
          garmin_activity_id: actId,
          run_date: dateStr,
          title: run.activityName || run.name || 'Run',
          distance_km: distKm,
          pace,
          avg_hr: avgHr,
          relative_effort: run.trainingEffect ?? null,
        }, 'garmin_activity_id')

        // Check if we already have full detail for this activity
        const existing = await sbGet('activity_details',
          `garmin_activity_id=eq.${actId}&select=id&limit=1`).catch(() => [])
        if (existing.length > 0) { activitiesWritten++; continue }

        // Pull full detail + splits + HR zones in parallel
        const [detailRes, splitsRes, hrZonesRes, teRes] = await Promise.allSettled([
          gc.getActivity({ activityId: actId }),
          gc.getActivitySplits({ activityId: actId }),
          gc.getActivityHrInTimezones({ activityId: actId }).catch(() => null),
          gc.getTrainingEffect({ activityId: actId }).catch(() => null),
        ])

        const d  = detailRes.status  === 'fulfilled' ? detailRes.value  : null
        const sp = splitsRes.status  === 'fulfilled' ? splitsRes.value  : null
        const hz = hrZonesRes.status === 'fulfilled' ? hrZonesRes.value : null
        const te = teRes.status      === 'fulfilled' ? teRes.value      : null

        // Training strain for this activity
        const actStrain = calcStrain({ acuteLoad, stress, sessionKind: 'easy' })

        const detailRows = await sbPost('activity_details', {
          athlete_id: ATHLETE_ID,
          garmin_activity_id: actId,
          activity_date: dateStr,
          start_time_local: run.startTimeLocal || run.start_time_local || null,
          name: run.activityName || run.name || 'Run',
          type: 'running',
          distance_km: distKm,
          duration_seconds: Math.round(durSec),
          moving_duration_seconds: Math.round(movSec),
          pace_avg: pace,
          pace_best: d?.maxSpeed ? calculatePace(1000, 1000 / d.maxSpeed) : null,
          avg_hr: d?.avgHrBpm || avgHr,
          max_hr: d?.maxHrBpm || maxHr,
          min_hr: d?.minHrBpm || null,
          avg_cadence: d?.avgCadence ? Math.round(d.avgCadence) : cadence,
          avg_power_watts: d?.avgPowerWatts || null,
          normalized_power_watts: d?.normalizedPowerWatts || null,
          avg_stride_cm: d?.avgStrideLength || null,
          avg_ground_contact_ms: d?.avgGroundContactTime || null,
          avg_vertical_osc_cm: d?.avgVerticalOscillation || null,
          training_load: te?.trainingLoad || d?.trainingLoad || null,
          aerobic_effect: te?.aerobicEffect || d?.trainingEffect || null,
          anaerobic_effect: te?.anaerobicEffect || d?.anaerobicTrainingEffect || null,
          training_effect_label: te?.trainingEffectLabel || d?.trainingEffectLabel || null,
          calories: d?.calories || cals,
          elevation_gain_m: d?.elevationGain || elevGain,
          elevation_loss_m: d?.elevationLoss || run.elevationLoss || null,
          max_elevation_m: d?.maxElevation || null,
          min_elevation_m: d?.minElevation || null,
          workout_feel: d?.workoutFeel || null,
          workout_rpe: d?.workoutRpe || null,
          body_battery_impact: d?.bodyBatteryImpact || null,
          recovery_hr_bpm: d?.recoveryHrBpm || null,
          strain_score: actStrain,
        }, 'garmin_activity_id')

        const detailId = detailRows[0]?.id
        if (detailId) {
          // Write laps
          const laps = sp?.lapDTOs || sp?.laps || []
          const meaningfulLaps = laps.filter((l) => (l.distance || l.distanceMeters || 0) > 100)
          if (meaningfulLaps.length) {
            const lapRows = meaningfulLaps.map((l) => {
              const lapDist = l.distance || l.distanceMeters || l.distance_meters || 0
              const lapMov  = l.movingDuration || l.moving_duration_seconds || l.duration || 0
              return {
                activity_id: detailId,
                lap_number: l.lapIndex ?? l.lap_number,
                distance_m: parseFloat(lapDist.toFixed(2)),
                duration_seconds: parseFloat((l.duration || 0).toFixed(3)),
                avg_pace: lapDist > 100 && lapMov > 0 ? calculatePace(lapDist, lapMov) : null,
                avg_hr: l.averageHR || l.avg_hr_bpm || null,
                max_hr: l.maxHR || l.max_hr_bpm || null,
                avg_cadence: l.averageCadence || l.avg_cadence ? Math.round(l.averageCadence || l.avg_cadence) : null,
                avg_power_watts: l.avgPower || l.avg_power_watts || null,
                elevation_gain_m: l.elevationGain || l.elevation_gain_meters || null,
                intensity_type: l.intensityType || l.intensity_type || null,
              }
            })
            await sbPost('activity_laps', lapRows, 'activity_id,lap_number').catch((e) => errors.push('laps: ' + e.message))
          }

          // Write HR zones
          const zones = Array.isArray(hz) ? hz : hz?.timeInHeartRateZones || []
          if (zones.length) {
            await sbPost('activity_hr_zones',
              zones.map((z) => ({
                activity_id: detailId,
                zone_number: z.zoneNumber,
                secs_in_zone: z.secsInZone,
                zone_low_bpm: z.zoneLowBoundary,
              })),
              'activity_id,zone_number',
            ).catch((e) => errors.push('hr_zones: ' + e.message))
          }
        }

        activitiesWritten++
        console.log(`[garmin-sync] wrote activity ${actId}`)
      } catch (e) {
        errors.push(`activity ${actId}: ${e.message}`)
      }
    }

    // Sync log
    await sbPost('daily_sync_log', {
      sync_date: today, synced_at: new Date().toISOString(),
      status: errors.length ? 'partial' : 'ok',
      error_msg: errors.length ? errors.join('; ') : null,
      activities_written: activitiesWritten,
    }, 'sync_date')

    console.log(`[garmin-sync] done — ${activitiesWritten} activities, ${errors.length} errors`)
    return new Response(JSON.stringify({ ok: true, readiness: readinessScore, activitiesWritten, errors }), {
      headers: { 'content-type': 'application/json' },
    })

  } catch (err) {
    console.error('[garmin-sync] fatal:', err.message)
    try {
      await sbPost('daily_sync_log', {
        sync_date: today, synced_at: new Date().toISOString(),
        status: 'error', error_msg: err.message, activities_written: 0,
      }, 'sync_date')
    } catch { /* swallow */ }
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
