// netlify/functions/garmin-sync.js
// DEBUG VERSION — logs the raw shape of every health response
// Deploy this, trigger one run, check Netlify function logs, then share what you see
// Replace with the production version once we know the exact field paths

import pkg from 'garmin-connect'
const { GarminConnect } = pkg

const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const ATHLETE_ID           = process.env.ATHLETE_ID

export const config = {
  schedule: '* * * * *',
}

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

// Deep-search an object for a key, return first match found
function deepFind(obj, key, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return undefined
  if (key in obj) return obj[key]
  for (const v of Object.values(obj)) {
    const found = deepFind(v, key, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

// Find all keys in an object that contain a substring (case-insensitive)
function findKeys(obj, substr, path = '', results = []) {
  if (!obj || typeof obj !== 'object') return results
  for (const [k, v] of Object.entries(obj)) {
    const fullPath = path ? `${path}.${k}` : k
    if (k.toLowerCase().includes(substr.toLowerCase())) {
      results.push({ path: fullPath, value: v })
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      findKeys(v, substr, fullPath, results)
    }
  }
  return results
}

export default async function handler() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ATHLETE_ID) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing env vars' }), { status: 500 })
  }

  const today = todayAEST()
  console.log(`[garmin-sync-debug] date: ${today}`)
  const errors = []
  let activitiesWritten = 0

  try {
    const gc = new GarminConnect({
      username: process.env.GARMIN_EMAIL,
      password: process.env.GARMIN_PASSWORD,
    })
    await gc.login()
    console.log('[garmin-sync-debug] logged in successfully')

    // ---- Pull all available methods ----
    const [statsRes, sleepRes, profileRes, activitiesRes] = await Promise.allSettled([
      gc.getStats(today),
      gc.getSleepData(today),
      gc.getUserProfile(),
      gc.getActivities(0, 20),
    ])

    // ---- LOG RAW STATS ----
    if (statsRes.status === 'fulfilled') {
      const stats = statsRes.value
      console.log('=== STATS KEYS ===', Object.keys(stats))
      // Find anything battery-related
      const battKeys = findKeys(stats, 'battery')
      console.log('BATTERY FIELDS:', JSON.stringify(battKeys))
      // Find anything stress-related
      const stressKeys = findKeys(stats, 'stress')
      console.log('STRESS FIELDS:', JSON.stringify(stressKeys))
      // Find anything heart-related
      const hrKeys = findKeys(stats, 'heart')
      console.log('HEART FIELDS:', JSON.stringify(hrKeys))
      // Log full stats (truncated)
      console.log('STATS FULL:', JSON.stringify(stats).slice(0, 2000))
    } else {
      console.log('STATS ERROR:', statsRes.reason)
    }

    // ---- LOG RAW SLEEP ----
    if (sleepRes.status === 'fulfilled') {
      const sleep = sleepRes.value
      console.log('=== SLEEP KEYS ===', Object.keys(sleep))
      // Find anything hrv-related
      const hrvKeys = findKeys(sleep, 'hrv')
      console.log('HRV FIELDS IN SLEEP:', JSON.stringify(hrvKeys))
      // Find anything score-related
      const scoreKeys = findKeys(sleep, 'score')
      console.log('SCORE FIELDS IN SLEEP:', JSON.stringify(scoreKeys))
      // Log full sleep (truncated to avoid log overflow)
      const sleepStr = JSON.stringify(sleep)
      console.log('SLEEP FULL (first 3000 chars):', sleepStr.slice(0, 3000))
    } else {
      console.log('SLEEP ERROR:', sleepRes.reason)
    }

    // ---- LOG PROFILE ----
    if (profileRes.status === 'fulfilled') {
      const profile = profileRes.value
      console.log('=== PROFILE KEYS ===', Object.keys(profile))
      const vo2Keys = findKeys(profile, 'vo2')
      console.log('VO2 FIELDS:', JSON.stringify(vo2Keys))
    } else {
      console.log('PROFILE ERROR:', profileRes.reason)
    }

    // ---- Try additional methods that might exist ----
    const methodsToTry = [
      'getHeartRate',
      'getHrvData',
      'getBodyBattery',
      'getBodyBatteryEvents',
      'getStressData',
      'getTrainingStatus',
      'getTrainingReadiness',
    ]

    for (const method of methodsToTry) {
      if (typeof gc[method] === 'function') {
        console.log(`[garmin-sync-debug] method ${method} EXISTS`)
        try {
          const result = await gc[method](today)
          // Find HRV in result
          const hrvKeys = findKeys(result, 'hrv')
          const battKeys = findKeys(result, 'battery')
          if (hrvKeys.length || battKeys.length) {
            console.log(`${method} HRV FIELDS:`, JSON.stringify(hrvKeys))
            console.log(`${method} BATTERY FIELDS:`, JSON.stringify(battKeys))
            console.log(`${method} RESULT (first 1000):`, JSON.stringify(result).slice(0, 1000))
          }
        } catch (e) {
          console.log(`${method} call failed:`, e.message)
        }
      } else {
        console.log(`[garmin-sync-debug] method ${method} NOT FOUND`)
      }
    }

    // ---- Now extract what we can and write snapshot ----
    const stats   = statsRes.status  === 'fulfilled' ? statsRes.value  : {}
    const sleep   = sleepRes.status  === 'fulfilled' ? sleepRes.value  : {}
    const profile = profileRes.status === 'fulfilled' ? profileRes.value : {}
    const rawActs = activitiesRes.status === 'fulfilled'
      ? (Array.isArray(activitiesRes.value)
          ? activitiesRes.value
          : activitiesRes.value?.activityList || activitiesRes.value?.activities || [])
      : []

    // Extract using deepFind to catch any nesting
    const rhr    = deepFind(stats, 'restingHeartRate') ?? deepFind(stats, 'resting_heart_rate_bpm') ?? null
    const rhr7   = deepFind(stats, 'lastSevenDaysAvgRestingHeartRate') ?? deepFind(stats, 'last_7_days_avg_resting_hr') ?? null
    const stress = deepFind(stats, 'averageStressLevel') ?? deepFind(stats, 'avg_stress_level') ?? null

    // Body battery — try every known field name
    const bodyBattery = deepFind(stats, 'bodyBatteryCurrent')
      ?? deepFind(stats, 'body_battery_current')
      ?? deepFind(stats, 'bodyBatteryHighestValue')
      ?? deepFind(stats, 'body_battery_highest')
      ?? null

    const spo2   = deepFind(stats, 'averageSpo2') ?? deepFind(stats, 'avg_spo2_percent') ?? null

    // HRV — try every known field name across the sleep response
    const hrv    = deepFind(sleep, 'avgOvernightHrv')
      ?? deepFind(sleep, 'avg_overnight_hrv')
      ?? deepFind(sleep, 'avgOvernightHrvMs')
      ?? deepFind(sleep, 'lastNightAvgHrv')
      ?? deepFind(sleep, 'averageHrv')
      ?? null

    const sleepScore = deepFind(sleep, 'value')  // inside sleepScores.overall.value
      ?? deepFind(sleep, 'sleepScore')
      ?? deepFind(sleep, 'sleep_score')
      ?? null

    const vo2    = deepFind(profile, 'vo2MaxRunning') ?? null

    console.log(`=== EXTRACTED VALUES ===`)
    console.log(`RHR: ${rhr}, RHR7: ${rhr7}, Stress: ${stress}`)
    console.log(`Body battery: ${bodyBattery}, SpO2: ${spo2}`)
    console.log(`HRV: ${hrv}, Sleep score: ${sleepScore}`)
    console.log(`VO2: ${vo2}`)

    const readiness = calcReadiness({
      hrv, hrvBaseLo: 40, hrvBaseHi: 49,
      rhr, rhr7, sleep: sleepScore, stress, bodyBattery,
    })
    console.log(`Readiness: ${readiness}`)

    // Write snapshot with whatever we have
    try {
      await sbPost('fitness_snapshot', {
        athlete_id:      ATHLETE_ID,
        synced_at:       new Date().toISOString(),
        readiness,
        recovery_hrs:    readiness < 50 ? '24 hr' : '1 hr',
        rhr,
        rhr_7day:        rhr7,
        hrv:             hrv != null ? Math.round(hrv) : null,
        hrv_status:      hrv != null ? (hrv >= 40 && hrv <= 49 ? 'Balanced' : hrv > 49 ? 'High' : 'Low') : null,
        sleep:           sleepScore,
        body_battery:    bodyBattery,
        stress,
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
      console.log('[garmin-sync-debug] snapshot written')
    } catch (e) {
      console.error('[garmin-sync-debug] snapshot error:', e.message)
      errors.push('snapshot: ' + e.message)
    }

    // Update HRV trend
    if (hrv != null) {
      await sbPost('hrv_trend',
        [{ athlete_id: ATHLETE_ID, day: today, hrv: Math.round(hrv) }],
        'athlete_id,day',
      ).catch((e) => errors.push('hrv_trend: ' + e.message))
    }

    // Write recent runs
    const runs = rawActs.filter((a) => {
      const type = a.activityType?.typeKey || a.type || ''
      const dist = a.distance || a.distanceMeters || a.distance_meters || 0
      return type.includes('running') && dist > 500
    })

    for (const run of runs.slice(0, 10)) {
      const actId  = run.activityId || run.id
      const distM  = run.distance || run.distanceMeters || run.distance_meters || 0
      const distKm = parseFloat((distM / 1000).toFixed(2))
      const movSec = run.movingDuration || run.moving_duration_seconds || 0
      const durSec = run.duration || run.duration_seconds || 0
      const dateStr = (run.startTimeLocal || run.start_time || today).slice(0, 10)
      const pace   = calculatePace(distM, movSec || durSec)

      try {
        await sbPost('recent_runs', {
          athlete_id:         ATHLETE_ID,
          garmin_activity_id: actId,
          run_date:           dateStr,
          title:              run.activityName || run.name || 'Run',
          distance_km:        distKm,
          pace,
          avg_hr:             run.averageHR || run.avg_hr_bpm || null,
          relative_effort:    run.trainingEffect ?? null,
        }, 'garmin_activity_id')
        activitiesWritten++
      } catch (e) {
        errors.push(`run ${actId}: ${e.message}`)
      }
    }

    await sbPost('daily_sync_log', {
      sync_date:          today,
      synced_at:          new Date().toISOString(),
      status:             errors.length ? 'partial' : 'ok',
      error_msg:          errors.length ? errors.slice(0, 3).join('; ') : null,
      activities_written: activitiesWritten,
    }, 'sync_date')

    return new Response(JSON.stringify({
      ok: true, today, readiness, hrv, bodyBattery, stress, rhr, sleepScore, errors,
    }), { headers: { 'content-type': 'application/json' } })

  } catch (err) {
    console.error('[garmin-sync-debug] fatal:', err.message, err.stack?.slice(0, 500))
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
