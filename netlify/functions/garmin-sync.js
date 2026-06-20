// netlify/functions/garmin-sync.js
// Schedule: every 30 minutes
//
// Strategy: garmin-connect@1.6.2 is used ONLY for login + getActivities.
// Health data (HRV, body battery, sleep, RHR, stress) is pulled via
// authenticated fetch using the session that gc establishes internally.

import pkg from 'garmin-connect'
const { GarminConnect } = pkg

const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const ATHLETE_ID           = process.env.ATHLETE_ID

export const config = { schedule: '*/30 * * * *' }

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

// ---- Garmin authenticated fetch ----
// After gc.login(), the library stores OAuth tokens internally.
// We extract the Authorization header from its internal client to make
// direct REST calls to Garmin Connect's API.
async function garminFetch(gc, path) {
  try {
    // The gc client stores its oauth2 client internally — access it to get the token
    const client = gc.client || gc._client || gc.GarminConnect || gc
    
    // Try to get the oauth token from the internal client
    let authHeader = null
    
    // Method 1: gc has an internal oauth client with getHeaders()
    if (client?.oauth2Client?.getHeaders) {
      const headers = await client.oauth2Client.getHeaders()
      authHeader = headers.Authorization
    }
    // Method 2: direct token access
    if (!authHeader && client?.token?.access_token) {
      authHeader = `Bearer ${client.token.access_token}`
    }
    // Method 3: try gc itself
    if (!authHeader && gc?.oauth2Client?.getHeaders) {
      const headers = await gc.oauth2Client.getHeaders()
      authHeader = headers?.Authorization
    }
    // Method 4: internal _oauth2Client
    if (!authHeader && gc?._oauth2Client) {
      const h = await gc._oauth2Client.getHeaders?.()
      if (h?.Authorization) authHeader = h.Authorization
    }

    if (!authHeader) {
      console.log('[garmin-sync] Could not extract auth header, trying gc.get() with relative path')
      // Last resort: try gc.get() with just the path
      return await gc.get(path)
    }

    const url = `https://connect.garmin.com${path}`
    console.log(`[garmin-sync] fetching ${url} with auth header`)
    const res = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'NK': 'NT',
        'DI-Backend': 'connectapi.garmin.com',
      },
    })
    if (!res.ok) {
      console.log(`[garmin-sync] ${path} → ${res.status}`)
      return null
    }
    return res.json()
  } catch (e) {
    console.log(`[garmin-sync] garminFetch(${path}) failed:`, e.message)
    return null
  }
}

// ---- main ----
export default async function handler() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ATHLETE_ID) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing env vars' }), { status: 500 })
  }

  const today = todayAEST()
  console.log(`[garmin-sync] starting for ${today}`)
  const errors = []
  let activitiesWritten = 0

  try {
    // 1. Login
    const gc = new GarminConnect({
      username: process.env.GARMIN_EMAIL,
      password: process.env.GARMIN_PASSWORD,
    })
    await gc.login()
    console.log('[garmin-sync] logged in')

    // Log what properties gc has so we can find the auth token
    const gcKeys = Object.keys(gc).filter(k => !k.startsWith('_') || k.includes('auth') || k.includes('oauth') || k.includes('token') || k.includes('client'))
    console.log('[garmin-sync] gc public keys:', gcKeys.join(', '))
    
    // Also check prototype methods
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(gc))
    console.log('[garmin-sync] gc methods:', proto.filter(m => m !== 'constructor').join(', '))

    // 2. Get activities (this works)
    const activitiesRes = await gc.getActivities(0, 20).catch(e => { errors.push('activities: ' + e.message); return [] })
    const rawActs = Array.isArray(activitiesRes)
      ? activitiesRes
      : activitiesRes?.activityList || activitiesRes?.activities || []

    // 3. Try to get health data via garminFetch
    const [daily, sleepData, hrvData, bodyBatData] = await Promise.all([
      garminFetch(gc, `/wellness-service/wellness/dailySummary/${today}`),
      garminFetch(gc, `/wellness-service/wellness/dailySleepData/${today}`),
      garminFetch(gc, `/hrv-service/hrv/${today}`),
      garminFetch(gc, `/wellness-service/wellness/bodyBattery/bulletPoint?startDate=${today}&endDate=${today}`),
    ])

    console.log('[garmin-sync] daily:', daily ? 'got data' : 'null')
    console.log('[garmin-sync] sleep:', sleepData ? 'got data' : 'null')
    console.log('[garmin-sync] hrv:', hrvData ? 'got data' : 'null')
    console.log('[garmin-sync] bodyBat:', bodyBatData ? 'got data' : 'null')
    console.log('[garmin-sync] activities:', rawActs.length)

    // 4. Extract health signals
    const rhr    = daily?.restingHeartRate      ?? null
    const rhr7   = daily?.lastSevenDaysAvgRhr   ?? null
    const stress = daily?.averageStressLevel    ?? null
    const spo2   = daily?.averageSpo2Value      ?? null

    let bodyBattery = null
    if (Array.isArray(bodyBatData) && bodyBatData.length) {
      bodyBattery = bodyBatData[bodyBatData.length - 1]?.bodyBatteryLevel ?? null
    }
    if (bodyBattery == null) {
      bodyBattery = daily?.bodyBatteryHighestValue ?? daily?.bodyBatteryMostRecentValue ?? null
    }

    const sleepDTO   = sleepData?.dailySleepDTO || sleepData || {}
    const sleepScore = sleepDTO.sleepScores?.overall?.value ?? sleepDTO.sleepScore ?? null
    
    // HRV — try dedicated endpoint first, fall back to sleep DTO
    let hrvVal    = hrvData?.lastNight?.avgHrv ?? hrvData?.avgHrv ?? null
    let hrvBaseLo = hrvData?.baseline?.lowUpper ?? 40
    let hrvBaseHi = hrvData?.baseline?.balancedUpper ?? 49
    if (hrvVal == null) {
      hrvVal    = sleepDTO.avgOvernightHrv ?? sleepDTO.averageOvernightHrv ?? null
      hrvBaseLo = sleepDTO.baselineBalancedLow    ?? 40
      hrvBaseHi = sleepDTO.baselineBalancedUpper  ?? 49
    }

    const vo2 = null // getUserProfile also seems limited — skip for now

    console.log(`[garmin-sync] extracted — RHR:${rhr} stress:${stress} battery:${bodyBattery} HRV:${hrvVal} sleep:${sleepScore}`)

    // 5. Calculate readiness
    const readiness = calcReadiness({ hrv: hrvVal, hrvBaseLo, hrvBaseHi, rhr, rhr7, sleep: sleepScore, stress, bodyBattery })
    const recoveryHrs = readiness >= 70 ? '1 hr' : readiness >= 50 ? '4 hr' : '24 hr'
    const hrvStatus = hrvVal != null
      ? (hrvVal >= hrvBaseLo && hrvVal <= hrvBaseHi ? 'Balanced' : hrvVal > hrvBaseHi ? 'High' : 'Low')
      : null

    console.log(`[garmin-sync] readiness: ${readiness}`)

    // 6. Write snapshot
    try {
      await sbPost('fitness_snapshot', {
        athlete_id: ATHLETE_ID,
        synced_at:  new Date().toISOString(),
        readiness, recovery_hrs: recoveryHrs,
        rhr, rhr_7day: rhr7,
        hrv: hrvVal != null ? Math.round(hrvVal) : null,
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

    // 7. HRV trend
    if (hrvVal != null) {
      await sbPost('hrv_trend',
        [{ athlete_id: ATHLETE_ID, day: today, hrv: Math.round(hrvVal) }],
        'athlete_id,day',
      ).catch(e => errors.push('hrv_trend: ' + e.message))
    }

    // 8. Activities
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
          training_load:            d?.trainingLoad         ?? null,
          aerobic_effect:           d?.trainingEffect       ?? null,
          anaerobic_effect:         d?.anaerobicTrainingEffect ?? null,
          training_effect_label:    d?.trainingEffectLabel  ?? null,
          calories:                 d?.calories || run.calories || null,
          elevation_gain_m:         d?.elevationGain || run.elevationGain || null,
          elevation_loss_m:         d?.elevationLoss || null,
          workout_feel:             d?.workoutFeel   || null,
          workout_rpe:              d?.workoutRpe    || null,
          body_battery_impact:      d?.bodyBatteryImpact || null,
          recovery_hr_bpm:          d?.recoveryHrBpm    || null,
        }, 'garmin_activity_id')

        const detailId = Array.isArray(detailRows) ? detailRows[0]?.id : detailRows?.id
        if (detailId && sp) {
          const laps = sp?.lapDTOs || sp?.laps || []
          const meaningful = laps.filter(l => (l.distance || l.distanceMeters || 0) > 100)
          if (meaningful.length) {
            await sbPost('activity_laps',
              meaningful.map((l, i) => {
                const lapDist = l.distance || l.distanceMeters || 0
                const lapMov  = l.movingDuration || l.duration || 0
                return {
                  activity_id:      detailId,
                  lap_number:       l.lapIndex ?? i,
                  distance_m:       parseFloat(lapDist.toFixed(2)),
                  duration_seconds: parseFloat((l.duration || 0).toFixed(3)),
                  avg_pace:         lapDist > 100 && lapMov > 0 ? calculatePace(lapDist, lapMov) : null,
                  avg_hr:           l.averageHR || null,
                  max_hr:           l.maxHR || null,
                  avg_cadence:      l.averageCadence ? Math.round(l.averageCadence) : null,
                  elevation_gain_m: l.elevationGain || null,
                  intensity_type:   l.intensityType || null,
                }
              }),
              'activity_id,lap_number',
            ).catch(e => errors.push('laps: ' + e.message))
          }
        }

        activitiesWritten++
        console.log(`[garmin-sync] wrote activity ${actId}`)
      } catch (e) {
        errors.push(`activity ${actId}: ${e.message}`)
      }
    }

    // 9. Sync log
    await sbPost('daily_sync_log', {
      sync_date: today, synced_at: new Date().toISOString(),
      status: errors.length ? 'partial' : 'ok',
      error_msg: errors.length ? errors.slice(0, 3).join('; ') : null,
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
