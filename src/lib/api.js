// src/lib/api.js  (v2 — with auto-sync awareness and optimistic updates)

import { sbGet, sbUpsert, sbPatch } from './supabase.js'

const pad = (n) => String(n).padStart(2, '0')
const fmtDM = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
const secToPace = (sec) => `${Math.floor(sec / 60)}:${pad(Math.round(sec % 60))}`
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)

// ---------------- ZONES ----------------
export async function getZones() {
  const [pace, hr] = await Promise.all([
    sbGet('pace_zones', 'select=*&order=ordinal'),
    sbGet('hr_zones', 'select=*&order=ordinal'),
  ])
  if (!pace.length) throw new Error('no pace zones')
  return {
    pace: pace.map((z) => ({ id: z.id, key: z.key, name: z.name, lo: z.lo, hi: z.hi, color: z.color, use: z.use })),
    hr: hr.map((z) => ({ z: z.z, name: z.name, lo: z.lo, hi: z.hi, color: z.color })),
    meta: { source: pace[0].source || 'Garmin Connect', updated: pace[0].updated || '' },
  }
}

export async function saveZones(pace) {
  const updated = new Date().toISOString().slice(0, 10)
  await Promise.all(
    pace
      .filter((z) => z.id != null)
      .map((z) => sbPatch('pace_zones', `id=eq.${z.id}`, { lo: z.lo, hi: z.hi, source: 'Manual edit', updated })),
  )
  return updated
}

// ---------------- FITNESS SNAPSHOT ----------------
export async function getSnapshot() {
  const rows = await sbGet('fitness_snapshot', 'select=*&order=synced_at.desc&limit=1')
  const s = rows[0]
  if (!s) throw new Error('no snapshot')

  const [athletes, preds, hrv, runs, stream, syncLog] = await Promise.all([
    sbGet('athlete', 'select=*&limit=1'),
    sbGet('race_predictions', `snapshot_id=eq.${s.id}&select=*`),
    sbGet('hrv_trend', 'select=*&order=day'),
    sbGet('recent_runs', 'select=*&order=run_date.desc&limit=10'),
    sbGet('activity_streams', 'select=*&order=sample_idx'),
    sbGet('daily_sync_log', 'select=*&order=sync_date.desc&limit=1').catch(() => []),
  ])

  const a = athletes[0] || {}
  const dist = stream.map((x) => +x.distance_km)
  const hrArr = stream.map((x) => x.hr)
  const paceArr = stream.map((x) => x.pace_sec)
  const altArr = stream.map((x) => +x.altitude_m)
  let climb = 0
  for (let i = 1; i < altArr.length; i++) climb += Math.max(0, altArr[i] - altArr[i - 1])

  const lastSync = syncLog[0]
  const syncedAt = new Date(s.synced_at).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).replace(',', ' ·')

  return {
    syncedAt,
    lastAutoSync: lastSync ? { date: lastSync.sync_date, status: lastSync.status, error: lastSync.error_msg } : null,
    athlete: { name: a.name, loc: a.location, weight: a.weight_kg },
    readiness: s.readiness, recoveryHrs: s.recovery_hrs, rhr: s.rhr, rhr7: s.rhr_7day,
    hrv: s.hrv, hrvStatus: s.hrv_status, sleep: s.sleep, battery: s.body_battery,
    stress: s.stress, spo2: s.spo2,
    vo2: s.vo2, ltHr: s.lt_hr, status: s.training_status,
    acute: s.acute_load, chronic: s.chronic_load, acwr: s.acwr,
    chronicBand: [s.chronic_band_lo, s.chronic_band_hi], balance: s.balance,
    preds: Object.fromEntries(preds.map((p) => [p.distance, p.predicted_time])),
    hrvTrend: hrv.map((h) => h.hrv),
    vo2Trend: [42, 42, 42, 42],
    recent: runs.map((r) => ({
      d: fmtDM(r.run_date), t: r.title, km: +r.distance_km,
      pace: r.pace, re: r.relative_effort, hr: r.avg_hr,
    })),
    stream: {
      dist, hr: hrArr, pace: paceArr, alt: altArr,
      avgHr: Math.round(mean(hrArr)), maxHr: Math.max(...hrArr),
      avgPace: secToPace(mean(paceArr)), climb: Math.round(climb),
    },
  }
}

// ---------------- PLAN ----------------
export async function getPlan() {
  const [weeks, sessions, steps, logs] = await Promise.all([
    sbGet('plan_weeks', 'select=*&order=week_no'),
    sbGet('plan_sessions', 'select=*&order=session_date'),
    sbGet('session_steps', 'select=*&order=ordinal'),
    sbGet('session_log', 'select=*'),
  ])
  if (!weeks.length || !sessions.length) throw new Error('no plan')

  const stepsBy = {}
  steps.forEach((st) => (stepsBy[st.session_id] ||= []).push([st.label, st.detail, st.pace]))
  const logBy = {}
  logs.forEach((l) => (logBy[l.session_id] = l))

  const dateToSession = {}
  const overrides = {}
  const log = {}

  const planWeeks = weeks.map((w) => {
    const days = sessions
      .filter((s) => s.week_id === w.id)
      .sort((a, b) => a.session_date.localeCompare(b.session_date))
      .map((s) => {
        dateToSession[s.session_date] = s.id
        const lg = logBy[s.id]
        if (lg) {
          const ov = {}
          if (lg.override_kind) ov.kind = lg.override_kind
          if (lg.override_km != null) ov.km = +lg.override_km
          if (lg.override_title) ov.title = lg.override_title
          if (Object.keys(ov).length) overrides[s.session_date] = ov
          if (lg.done || lg.notes) log[s.session_date] = { done: !!lg.done, notes: lg.notes || '' }
        }
        return {
          sessionId: s.id,
          date: s.session_date, dow: s.dow, kind: s.kind, zone: s.zone,
          title: s.title, km: s.distance_km == null ? null : +s.distance_km,
          elev: s.elevation_m || 0, fuel: s.fuel, cadence: s.cadence, purpose: s.purpose,
          rows: stepsBy[s.id] || [],
        }
      })
    return { n: w.week_no, phase: w.phase, pill: w.pill, label: w.label, note: w.note, days }
  })

  return { weeks: planWeeks, dateToSession, overrides, log }
}

// ---------------- WRITES ----------------
export function saveLog(sessionId, patch) {
  const row = { session_id: sessionId }
  if ('done' in patch) row.done = patch.done
  if ('notes' in patch) row.notes = patch.notes
  if ('kind' in patch) row.override_kind = patch.kind
  if ('km' in patch) row.override_km = patch.km
  if ('title' in patch) row.override_title = patch.title
  return sbUpsert('session_log', row, 'session_id')
}

export function clearLogOverride(sessionId) {
  return sbUpsert(
    'session_log',
    { session_id: sessionId, override_kind: null, override_km: null, override_title: null },
    'session_id',
  )
}

export function saveRunFeedback(sessionId, feedback) {
  return sbUpsert('session_log', { session_id: sessionId, notes: feedback }, 'session_id')
}

export async function loadAll() {
  const [zones, snap, plan] = await Promise.allSettled([getZones(), getSnapshot(), getPlan()])
  if (plan.status !== 'fulfilled') throw new Error('plan load failed: ' + plan.reason)
  return {
    plan: plan.value,
    zones: zones.status === 'fulfilled' ? zones.value : null,
    snap: snap.status === 'fulfilled' ? snap.value : null,
  }
}
