// netlify/functions/garmin-sync.js
//
// Runs 4x daily: 4:30am, 8am, midday, 7pm AEST (UTC+10 = subtract 10hrs)
//   4:30am AEST = 18:30 UTC (previous day)
//   8:00am AEST = 22:00 UTC (previous day)
//   12:00pm AEST = 02:00 UTC
//   7:00pm AEST  = 09:00 UTC
//
// Captures: fitness snapshot, HRV, recent runs, full activity detail,
//           per-km splits, HR zone distribution, training effect.
//
// REQUIRED ENV VARS (set in Netlify → Site config → Environment variables):
//   GARMIN_EMAIL          your Garmin Connect login email
//   GARMIN_PASSWORD       your Garmin Connect password
//   SUPABASE_URL          https://pvmthpqjaqqnfpzwiade.supabase.co
//   SUPABASE_SERVICE_KEY  your Supabase service_role key (NOT the anon key)

import { GarminConnect } from 'garmin-connect'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvmthpqjaqqnfpzwiade.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const ATHLETE_ID   = '0a1d0000-0000-4000-8000-00000000a001'

// 4 schedules — cron is UTC, AEST = UTC+10
// 4:30am AEST = 18:30 prev day UTC → "30 18 * * *"
// 8:00am AEST = 22:00 prev day UTC → "0 22 * * *"
// 12:00pm AEST = 02:00 UTC         → "0 2 * * *"
// 7:00pm AEST  = 09:00 UTC         → "0 9 * * *"
export const config = {
  schedule: ['30 18 * * *', '0 22 * * *', '0 2 * * *', '0 9 * * *'],
}

// ---- Supabase helpers ----
const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=representation',
}

async function sbPost(table, rows, onConflict) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`
  const res = await fetch(url, { method: 'POST', headers: sbHeaders, body: JSON.stringify(rows) })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`${table}: ${res.status} ${txt}`)
  }
  const json = await res.json().catch(() => [])
  return Array.isArray(json) ? json : [json]
}

async function sbGet(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!res.ok) throw new Error(`GET ${table}: ${res.status}`)
  return res.json()
}

// ---- pace helpers ----
const pad = (n) => String(Math.floor(n)).padStart(2, '0') + ':' + String(Math.round((n % 1) * 60)).padStart(2, '0')
const mpsToMinKm = (mps) => { if (!mps || mps <= 0) return null; const secPerKm = 1000 / mps; return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}` }
const secToMinKm = (sec) => { if (!sec || sec <= 0) return null; return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` }
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0
const todayAEST = () => { const d = new Date(Date.now() + 10 * 3600000); return d.toISOString().slice(0, 10) }

// ---- main handler ----
export default async function handler() {
  if (!SUPABASE_KEY) {
    console.error('[garmin-sync] SUPABASE_SERVICE_KEY not set')
    return new Response('missing service key', { status: 500 })
  }

  const today = todayAEST()
  const syncStart = Date.now()
  console.log(`[garmin-sync] starting sync for ${today}`)

  let activitiesWritten = 0
  let errors = []

  try {
    // ---- 1. Connect to Garmin ----
    const gc = new GarminConnect({
      username: process.env.GARMIN_EMAIL,
      password: process.env.GARMIN_PASSWORD,
    })
    await gc.login()
    console.log('[garmin-sync] logged in')

    // ---- 2. Pull overview data in parallel ----
    const [statsRes, hrvRes, trainingRes, activitiesRes] = await Promise.allSettled([
      gc.getStats(today),
      gc.getHrvData(today),
      gc.getTrainingStatus(today),
      gc.getActivities(0, 20),
    ])

    const s  = statsRes.status    === 'fulfilled' ? statsRes.value    : {}
    const h  = hrvRes.status      === 'fulfilled' ? hrvRes.value      : {}
    const t  = trainingRes.status === 'fulfilled' ? trainingRes.value : {}
    const rawActs = activitiesRes.status === 'fulfilled'
      ? (Array.isArray(activitiesRes.value) ? activitiesRes.value : activitiesRes.value?.activityList ?? [])
      : []

    // ---- 3. Write fitness snapshot ----
    try {
      await sbPost('fitness_snapshot', {
        athlete_id:       ATHLETE_ID,
        synced_at:        new Date().toISOString(),
        readiness:        t.readiness_score ?? null,
        recovery_hrs:     t.recovery_time != null ? `${t.recovery_time} hr` : null,
        rhr:              s.restingHeartRate ?? null,
        rhr_7day:         s.lastSevenDaysAvgRestingHeartRate ?? null,
        hrv:              h.lastNightAvgHrv ?? null,
        hrv_status:       h.status ?? null,
        sleep:            s.sleepScore ?? null,
        body_battery:     s.bodyBatteryHighestValue ?? null,
        stress:           s.averageStressLevel ?? null,
        spo2:             s.averageSpo2 ?? null,
        vo2:              t.vo2Max ?? null,
        lt_hr:            173,
        training_status:  t.trainingStatusFeedback ?? null,
        acute_load:       t.acuteLoad ?? null,
        chronic_load:     t.chronicLoad ?? null,
        acwr:             t.loadRatio ?? null,
        chronic_band_lo:  t.optimalChronicLoadMin ?? 257,
        chronic_band_hi:  t.optimalChronicLoadMax ?? 482,
        balance:          t.trainingBalanceFeedback ?? null,
      })
      console.log('[garmin-sync] snapshot written')
    } catch (e) { errors.push('snapshot: ' + e.message) }

    // ---- 4. Update HRV trend ----
    if (h.lastNightAvgHrv) {
      try {
        await sbPost('hrv_trend',
          [{ athlete_id: ATHLETE_ID, day: today, hrv: Math.round(h.lastNightAvgHrv) }],
          'athlete_id,day',
        )
      } catch (e) { errors.push('hrv: ' + e.message) }
    }

    // ---- 5. Process each run activity ----
    const runs = rawActs.filter((a) => {
      const type = a.activityType?.typeKey || a.type || ''
      return type.includes('running') && (a.distance || a.distance_meters || 0) > 500
    })

    for (const run of runs.slice(0, 15)) {
      const actId = run.activityId || run.id
      const distM = run.distance || run.distance_meters || 0
      const distKm = distM / 1000
      const movSec = run.movingDuration || run.moving_duration_seconds || 0
      const durSec = run.duration || run.duration_seconds || 0
      const paceAvg = movSec > 0 ? secToMinKm(movSec / distKm) : mpsToMinKm(run.averageSpeed || run.avg_speed_mps)
      const paceMax = mpsToMinKm(run.maxSpeed || run.max_speed_mps)
      const dateStr = (run.startTimeLocal || run.start_time_local || '').slice(0, 10) || today

      try {
        // Write / update recent_runs (lightweight list)
        await sbPost('recent_runs', {
          athlete_id: ATHLETE_ID,
          garmin_activity_id: actId,
          run_date: dateStr,
          title: run.activityName || run.name || 'Run',
          distance_km: parseFloat(distKm.toFixed(2)),
          pace: paceAvg,
          relative_effort: run.trainingEffect ?? null,
          avg_hr: run.averageHR || run.avg_hr_bpm || null,
        }, 'garmin_activity_id')

        // Skip full detail pull if already stored today
        const existing = await sbGet('activity_details',
          `garmin_activity_id=eq.${actId}&select=id,created_at&limit=1`)
        const alreadyToday = existing.length > 0 &&
          existing[0].created_at?.slice(0, 10) === today
        if (alreadyToday) { activitiesWritten++; continue }

        // Pull detailed activity data in parallel
        const [detailRes, splitsRes, hrZonesRes, teRes] = await Promise.allSettled([
          gc.getActivity({ activityId: actId }),
          gc.getActivitySplits({ activityId: actId }),
          gc.getActivityHrInTimezones({ activityId: actId }),
          gc.getTrainingEffect({ activityId: actId }),
        ])

        const d  = detailRes.status  === 'fulfilled' ? detailRes.value  : null
        const sp = splitsRes.status  === 'fulfilled' ? splitsRes.value  : null
        const hz = hrZonesRes.status === 'fulfilled' ? hrZonesRes.value : null
        const te = teRes.status      === 'fulfilled' ? teRes.value      : null

        // Write activity_details
        const detailRows = await sbPost('activity_details', {
          athlete_id:               ATHLETE_ID,
          garmin_activity_id:       actId,
          activity_date:            dateStr,
          start_time_local:         run.startTimeLocal || run.start_time_local || null,
          name:                     run.activityName || run.name || 'Run',
          type:                     'running',
          distance_km:              parseFloat(distKm.toFixed(2)),
          duration_seconds:         Math.round(durSec),
          moving_duration_seconds:  Math.round(movSec),
          pace_avg:                 paceAvg,
          pace_best:                paceMax,
          avg_hr:                   d?.avgHrBpm  || run.averageHR || null,
          max_hr:                   d?.maxHrBpm  || run.maxHR || null,
          min_hr:                   d?.minHrBpm  || null,
          avg_cadence:              d?.avgCadence ? Math.round(d.avgCadence) : null,
          avg_power_watts:          d?.avgPowerWatts   ?? null,
          normalized_power_watts:   d?.normalizedPowerWatts ?? null,
          avg_stride_cm:            d?.avgStrideLength ?? null,
          avg_ground_contact_ms:    d?.avgGroundContactTime ?? null,
          avg_vertical_osc_cm:      d?.avgVerticalOscillation ?? null,
          training_load:            te?.trainingLoad  ?? d?.trainingLoad ?? null,
          aerobic_effect:           te?.aerobicEffect ?? d?.trainingEffect ?? null,
          anaerobic_effect:         te?.anaerobicEffect ?? d?.anaerobicTrainingEffect ?? null,
          training_effect_label:    te?.trainingEffectLabel ?? d?.trainingEffectLabel ?? null,
          calories:                 d?.calories || run.calories || null,
          elevation_gain_m:         d?.elevationGain || run.elevationGain || null,
          elevation_loss_m:         d?.elevationLoss || run.elevationLoss || null,
          max_elevation_m:          d?.maxElevation ?? null,
          min_elevation_m:          d?.minElevation ?? null,
          workout_feel:             d?.workoutFeel ?? null,
          workout_rpe:              d?.workoutRpe  ?? null,
          body_battery_impact:      d?.bodyBatteryImpact ?? null,
          recovery_hr_bpm:          d?.recoveryHrBpm ?? null,
        }, 'garmin_activity_id')

        const detailId = detailRows[0]?.id
        if (!detailId) { activitiesWritten++; continue }

        // Write laps
        const laps = sp?.lapDTOs || sp?.laps || []
        if (laps.length) {
          const lapRows = laps
            .filter((l) => l.distance > 50) // skip micro-laps from workout transitions
            .map((l) => {
              const lapDistKm = (l.distance || l.distanceMeters || 0) / 1000
              const lapMovSec = l.movingDuration || l.moving_duration_seconds || l.duration || 0
              return {
                activity_id:     detailId,
                lap_number:      l.lapIndex || l.lap_number,
                distance_m:      parseFloat((l.distance || l.distanceMeters || 0).toFixed(2)),
                duration_seconds: parseFloat((l.duration || l.duration_seconds || 0).toFixed(3)),
                avg_pace:        lapDistKm > 0 && lapMovSec > 0 ? secToMinKm(lapMovSec / lapDistKm) : null,
                avg_hr:          l.averageHR  || l.avg_hr_bpm  || null,
                max_hr:          l.maxHR      || l.max_hr_bpm  || null,
                avg_cadence:     l.averageCadence || l.avg_cadence ? Math.round(l.averageCadence || l.avg_cadence) : null,
                avg_power_watts: l.avgPower   || l.avg_power_watts || null,
                elevation_gain_m: l.elevationGain || l.elevation_gain_meters || null,
                intensity_type:  l.intensityType || l.intensity_type || null,
              }
            })
          if (lapRows.length) {
            await sbPost('activity_laps', lapRows, 'activity_id,lap_number')
          }
        }

        // Write HR zones
        const zones = Array.isArray(hz) ? hz : hz?.timeInHeartRateZones || []
        if (zones.length) {
          const zoneRows = zones.map((z) => ({
            activity_id:   detailId,
            zone_number:   z.zoneNumber,
            secs_in_zone:  z.secsInZone,
            zone_low_bpm:  z.zoneLowBoundary,
          }))
          await sbPost('activity_hr_zones', zoneRows, 'activity_id,zone_number')
        }

        activitiesWritten++
        console.log(`[garmin-sync] wrote activity ${actId} (${run.activityName || 'Run'})`)

      } catch (e) {
        errors.push(`activity ${actId}: ${e.message}`)
        console.error(`[garmin-sync] activity ${actId} error:`, e.message)
      }
    }

    // ---- 6. Write sync log ----
    await sbPost('daily_sync_log', {
      sync_date:           today,
      synced_at:           new Date().toISOString(),
      status:              errors.length ? 'partial' : 'ok',
      error_msg:           errors.length ? errors.join('; ') : null,
      activities_written:  activitiesWritten,
    }, 'sync_date')

    const elapsed = ((Date.now() - syncStart) / 1000).toFixed(1)
    console.log(`[garmin-sync] done in ${elapsed}s — ${activitiesWritten} activities, ${errors.length} errors`)

    return new Response(JSON.stringify({ ok: true, today, activitiesWritten, errors, elapsed }), {
      headers: { 'content-type': 'application/json' },
    })

  } catch (err) {
    console.error('[garmin-sync] fatal:', err.message)
    try {
      await sbPost('daily_sync_log', {
        sync_date: todayAEST(),
        synced_at: new Date().toISOString(),
        status: 'error',
        error_msg: err.message,
      }, 'sync_date')
    } catch { /* swallow */ }

    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
