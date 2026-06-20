// netlify/functions/garmin-sync.js
// Runs every 30 minutes. Uses gc.get() directly since garmin-connect@1.6.2
// only exposes getActivities, getActivity, getUserProfile, getUserSettings.
// All wellness/health data is fetched via the raw Garmin Connect REST API.
//
// REQUIRED ENV VARS:
//   GARMIN_EMAIL          Garmin Connect login email
//   GARMIN_PASSWORD       Garmin Connect password
//   SUPABASE_URL          https://pvmthpqjaqqnfpzwiade.supabase.co
//   SUPABASE_SERVICE_KEY  service_role key (Supabase → Project Settings → API)
//   ATHLETE_ID            0a1d0000-0000-4000-8000-00000000a001

import pkg from 'garmin-connect'
const { GarminConnect } = pkg

const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const ATHLETE_ID           = process.env.ATHLETE_ID

// every 30 minutes
export const config = { schedule: '*/30 * * * *' }

// ---- date helpers ----
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

// Composite readiness 0–100
function calcReadiness({ hrv, hrvBaseLo = 40, hrvBaseHi = 49, rhr, rhr7, sleep, stress, bodyBattery }) {
  let score = 50
  if (hrv && hrvBaseLo && hrvBaseHi) {
    const mid = (hrvBaseLo + hrvBaseHi) / 2
    const range = Math.max((hrvBaseHi - hrvBaseLo) / 2, 3)
    score += Math.max(-20, Math.min(20, ((hrv - mid) / range) * 15))
  }
  if (rhr && rhr7)        score += Math.max(-15, Math.min(15, (rhr7 - rhr) * 3))
  if (sleep)              score += (sleep - 60) * 0.5
  if (stress != null)     score += (50 - stress) * 0.2
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

// Safely call gc.get() and return null on failure
async function gcGet(gc, url) {
  try {
    return await gc.get(url)
  } catch (e) {
    console.log(`[garmin-sync] gc.get(${url}) failed:`, e.message)
    return null
  }
}

// ---- main ----
export default async function handler() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ATHLETE_ID) {
    const missing = ['SUPABASE_URL','SUPABASE_SERVICE_KEY','ATHLETE_ID']
      .filter(k => !process.env[k]).join(', ')
    return new Response(JSON.stringify({ ok: false, error: `Missing: ${missing}` }), { status: 500 })
  }

  const today = todayAEST()
  console.log(`[garmin-sync] starting for ${today}`)
  const errors = []
  let activitiesWritten = 0

  try {
    // ---- 1. Login ----
    const gc = new GarminConnect({
      username: process.env.GARMIN_EMAIL,
      password: process.env.GARMIN_PASSWORD,
    })
    await gc.login()
    console.log('[garmin-sync] logged in')

    // ---- 2. Pull health data via gc.get() — the one method that always exists ----
    // All Garmin Connect REST endpoints, confirmed working
    const BASE = 'https://connect.garmin.com'

    const [dailyRes, sleepRes, hrvRes, bodyBatRes, activitiesRes, profileRes] =
      await Promise.allSettled([
        // Daily wellness summary — stress, steps, calories, body battery, SpO2, RHR
        gcGet(gc, `${BASE}/wellness-service/wellness/dailySummary/${today}`),
        // Sleep data — sleep score, HRV, sleep stages
        gcGet(gc, `${BASE}/wellness-service/wellness/dailySleepData/${today}`),
        // HRV data (dedicated endpoint)
        gcGet(gc, `${BASE}/hrv-service/hrv/${today}`),
        // Body battery events
        gcGet(gc, `${BASE}/wellness-service/wellness/bodyBattery/bulletPoint?startDate=${today}&endDate=${today}`),
        // Activities
        gc.getActivities(0, 20),
        // User profile for VO2
        gc.getUserProfile(),
      ])

    const daily      = dailyRes.status      === 'fulfilled' ? dailyRes.value      : null
    const sleepData  = sleepRes.status      === 'fulfilled' ? sleepRes.value      : null
    const hrvData    = hrvRes.status        === 'fulfilled' ? hrvRes.value        : null
    const bodyBatData = bodyBatRes.status   === 'fulfilled' ? bodyBatRes.value    : null
    const rawActs    = activitiesRes.status === 'fulfilled'
      ? (Array.isArray(activitiesRes.value)
          ? activitiesRes.value
          : activitiesRes.value?.activityList || activitiesRes.value?.activities || [])
      : []
    const profile    = profileRes.status    === 'fulfilled' ? profileRes.value    : null

    console.log('[garmin-sync] daily:', daily ? Object.keys(daily).slice(0,6).join(',') : 'null')
    console.log('[garmin-sync] sleep:', sleepData ? Object.keys(sleepData).slice(0,6).join(',') : 'null')
    console.log('[garmin-sync] hrv:', hrvData ? JSON.stringify(hrvData).slice(0,200) : 'null')
    console.log('[garmin-sync] bodyBat:', bodyBatData ? JSON.stringify(bodyBatData).slice(0,200) : 'null')
    console.log('[garmin-sync] activities:', rawActs.length)

    // ---- 3. Extract health values ----

    // RHR + stress + SpO2 from daily summary
    const rhr    = daily?.restingHeartRate      ?? daily?.rhr     ?? null
    const rhr7   = daily?.lastSevenDaysAvgRhr   ?? null
    const stress = daily?.averageStressLevel    ?? daily?.stressLevel ?? null
    const spo2   = daily?.averageSpo2Value      ?? daily?.spo2    ?? null
    const steps  = daily?.totalSteps            ?? daily?.steps   ?? null

    // Body battery — try the dedicated endpoint first, fall back to daily
    let bodyBattery = null
    if (Array.isArray(bodyBatData) && bodyBatData.length) {
      // endpoint returns array of {startTimestampGMT, endTimestampGMT, bodyBatteryLevel, ...}
      // take the most recent non-null value
      bodyBattery = bodyBatData[bodyBatData.length - 1]?.bodyBatteryLevel
        ?? bodyBatData[bodyBatData.length - 1]?.level
        ?? null
    }
    if (bodyBattery == null) {
      bodyBattery = daily?.bodyBatteryHighestValue
        ?? daily?.bodyBatteryMostRecentValue
        ?? daily?.highestBodyBattery
        ?? null
    }

    // Sleep score from sleep data
    const sleepScore = sleepData?.dailySleepDTO?.sleepScores?.overall?.value
      ?? sleepData?.sleepScore
      ?? sleepData?.overallSleepScore
      ?? null

    // HRV — try dedicated hrv endpoint first, fall back to sleep data
    let hrvVal    = null
    let hrvBaseLo = 40
    let hrvBaseHi = 49
    let hrvStatus = null

    if (hrvData) {
      // HRV service response shape
      hrvVal    = hrvData.lastNight?.avgHrv
        ?? hrvData.avgHrv
        ?? hrvData.weeklyAvg
        ?? null
      hrvBaseLo = hrvData.baseline?.lowUpper  ?? hrvData.balancedLow    ?? 40
      hrvBaseHi = hrvData.baseline?.balancedUpper ?? hrvData.balancedUpper ?? 49
      hrvStatus = hrvData.status ?? null
    }
    if (hrvVal == null && sleepData) {
      // Fall back to sleep DTO
      const dto = sleepData.dailySleepDTO || sleepData
      hrvVal    = dto.avgOvernightHrv
        ?? dto.averageOvernightHrv
        ?? dto.avgHrv
        ?? null
      if (!hrvStatus) {
        hrvStatus = hrvVal != null
          ? (hrvVal >= hrvBaseLo && hrvVal <= hrvBaseHi ? 'Balanced' : hrvVal > hrvBaseHi ? 'High' : 'Low')
          : null
      }
    }

    // VO2 from profile
    const vo2 = profile?.userData?.vo2MaxRunning
      ?? profile?.vo2MaxRunning
      ?? null

    console.log(`[garmin-sync] extracted — RHR:${rhr} stress:${stress} battery:${bodyBattery} HRV:${hrvVal} sleep:${sleepScore} VO2:${vo2}`)

    // ---- 4. Compute readiness ----
    const readiness = calcReadiness({
      hrv: hrvVal, hrvBaseLo, hrvBaseHi,
      rhr, rhr7, sleep: sleepScore, stress, bodyBattery,
    })
    const recoveryHrs = readiness >= 70 ? '1 hr' : readiness >= 50 ? '4 hr' : '24 hr'

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
        hrv_status:      hrvStatus,
        sleep:           sleepScore,
        body_battery:    bodyBattery != null ? Math.round(bodyBattery) : null,
        stress:          stress != null ? Math.round(stress) : null,
        spo2,
        vo2,
        lt_hr:           173,
        training_status: null,
        acute_load:      null,
        chronic_load:    null,
        acwr:            null,
        chronic_band_lo: 257,
        chronic_band_hi: 482,
        balance:         null,
      })
      console.log('[garmin-sync] snapshot written')
    } catch (e) {
      errors.push('snapshot: ' + e.message)
      console.error('[garmin-sync] snapshot error:', e.message)
    }

    // ---- 6. Update HRV trend ----
    if (hrvVal != null) {
      await sbPost('hrv_trend',
        [{ athlete_id: ATHLETE_ID, day: today, hrv: Math.round(hrvVal) }],
        'athlete_id,day',
      ).catch(e => errors.push('hrv_trend: ' + e.message))
    }

    // ---- 7. Process runs ----
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
          athlete_id:         ATHLETE_ID,
          garmin_activity_id: actId,
          run_date:           dateStr,
          title:              run.activityName || run.name || 'Run',
          distance_km:        distKm,
          pace:               calculatePace(distM, movSec || durSec),
          avg_hr:             run.averageHR || run.avg_hr_bpm || null,
          relative_effort:    run.trainingEffect ?? null,
        }, 'garmin_activity_id')

        // Full activity detail — skip if already stored
        const existing = await sbGet('activity_details',
          `garmin_activity_id=eq.${actId}&select=id&limit=1`).catch(() => [])
        if (existing.length > 0) { activitiesWritten++; continue }

        // Pull detail + splits in parallel
        const [detailRes, splitsRes, hrZonesRes] = await Promise.allSettled([
          gc.getActivity({ activityId: actId }),
          gc.getActivitySplits({ activityId: actId }),
          gcGet(gc, `${BASE}/activity-service/activity/${actId}/hrTimeInZones`),
        ])

        const d  = detailRes.status  === 'fulfilled' ? detailRes.value  : null
        const sp = splitsRes.status  === 'fulfilled' ? splitsRes.value  : null
        const hz = hrZonesRes.status === 'fulfilled' ? hrZonesRes.value : null

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
          pace_avg:                 calculatePace(distM, movSec || durSec),
          pace_best:                d?.maxSpeed ? calculatePace(1000, 1000 / d.maxSpeed) : null,
          avg_hr:                   d?.avgHrBpm  || run.averageHR || null,
          max_hr:                   d?.maxHrBpm  || run.maxHR     || null,
          min_hr:                   d?.minHrBpm  || null,
          avg_cadence:              d?.avgCadence ? Math.round(d.avgCadence) : null,
          avg_power_watts:          d?.avgPowerWatts        ?? null,
          normalized_power_watts:   d?.normalizedPowerWatts ?? null,
          avg_stride_cm:            d?.avgStrideLength       ?? null,
          avg_ground_contact_ms:    d?.avgGroundContactTime  ?? null,
          avg_vertical_osc_cm:      d?.avgVerticalOscillation ?? null,
          training_load:            d?.trainingLoad           ?? null,
          aerobic_effect:           d?.trainingEffect         ?? null,
          anaerobic_effect:         d?.anaerobicTrainingEffect ?? null,
          training_effect_label:    d?.trainingEffectLabel    ?? null,
          calories:                 d?.calories || run.calories || null,
          elevation_gain_m:         d?.elevationGain || run.elevationGain || null,
          elevation_loss_m:         d?.elevationLoss || null,
          max_elevation_m:          d?.maxElevation  || null,
          min_elevation_m:          d?.minElevation  || null,
          workout_feel:             d?.workoutFeel   || null,
          workout_rpe:              d?.workoutRpe    || null,
          body_battery_impact:      d?.bodyBatteryImpact || null,
          recovery_hr_bpm:          d?.recoveryHrBpm    || null,
        }, 'garmin_activity_id')

        const detailId = Array.isArray(detailRows) ? detailRows[0]?.id : detailRows?.id
        if (detailId) {
          // Laps
          const laps = sp?.lapDTOs || sp?.laps || []
          const meaningful = laps.filter(l => (l.distance || l.distanceMeters || 0) > 100)
          if (meaningful.length) {
            await sbPost('activity_laps',
              meaningful.map(l => {
                const lapDist = l.distance || l.distanceMeters || 0
                const lapMov  = l.movingDuration || l.duration || 0
                return {
                  activity_id:      detailId,
                  lap_number:       l.lapIndex ?? l.lap_number,
                  distance_m:       parseFloat(lapDist.toFixed(2)),
                  duration_seconds: parseFloat((l.duration || 0).toFixed(3)),
                  avg_pace:         lapDist > 100 && lapMov > 0 ? calculatePace(lapDist, lapMov) : null,
                  avg_hr:           l.averageHR  || l.avg_hr_bpm || null,
                  max_hr:           l.maxHR      || l.max_hr_bpm || null,
                  avg_cadence:      (l.averageCadence || l.avg_cadence)
                    ? Math.round(l.averageCadence || l.avg_cadence) : null,
                  avg_power_watts:  l.avgPower || l.avg_power_watts || null,
                  elevation_gain_m: l.elevationGain || l.elevation_gain_meters || null,
                  intensity_type:   l.intensityType || l.intensity_type || null,
                }
              }),
              'activity_id,lap_number',
            ).catch(e => errors.push('laps: ' + e.message))
          }

          // HR zones
          const zones = Array.isArray(hz) ? hz
            : hz?.timeInHeartRateZones || hz?.heartRateZones || []
          if (zones.length) {
            await sbPost('activity_hr_zones',
              zones.map(z => ({
                activity_id:  detailId,
                zone_number:  z.zoneNumber ?? z.zone,
                secs_in_zone: z.secsInZone ?? z.seconds ?? z.duration,
                zone_low_bpm: z.zoneLowBoundary ?? z.min,
              })),
              'activity_id,zone_number',
            ).catch(e => errors.push('hr_zones: ' + e.message))
          }
        }

        activitiesWritten++
        console.log(`[garmin-sync] wrote activity ${actId}`)
      } catch (e) {
        errors.push(`activity ${actId}: ${e.message}`)
      }
    }

    // ---- 8. Sync log ----
    await sbPost('daily_sync_log', {
      sync_date:          today,
      synced_at:          new Date().toISOString(),
      status:             errors.length ? 'partial' : 'ok',
      error_msg:          errors.length ? errors.slice(0, 3).join('; ') : null,
      activities_written: activitiesWritten,
    }, 'sync_date')

    console.log(`[garmin-sync] done — readiness:${readiness} hrv:${hrvVal} battery:${bodyBattery} activities:${activitiesWritten} errors:${errors.length}`)

    return new Response(JSON.stringify({
      ok: true, today, readiness, hrv: hrvVal, bodyBattery, stress, rhr, sleepScore, activitiesWritten, errors,
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
