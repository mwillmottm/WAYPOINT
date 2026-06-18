import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { buildPlan } from '../data/plan.js'
import { PACE_ZONES, HR_ZONES, ZONES_META } from '../data/zones.js'
import { SNAP as SNAP_FALLBACK } from '../data/snapshot.js'
import * as api from '../lib/api.js'
import * as store from '../lib/storage.js'

const K = { state: 'waypoint:state:v3', zones: 'waypoint:zones:v3' }

export function useWaypoint() {
  const fallbackPlan = useMemo(() => buildPlan(), [])

  const [tab, setTab] = useState('today')
  const [status, setStatus] = useState('connecting')
  const [basePlan, setBasePlan] = useState(fallbackPlan)
  const [snap, setSnap] = useState(SNAP_FALLBACK)
  const dateToSession = useRef({})

  const cached = store.load(K.state, { overrides: {}, log: {} })
  const [overrides, setOverrides] = useState(cached.overrides || {})
  const [log, setLogMap] = useState(cached.log || {})
  const [zones, setZones] = useState(() => store.load(K.zones, { pace: PACE_ZONES, hr: HR_ZONES, meta: ZONES_META }))
  const [toast, setToastState] = useState(null)

  useEffect(() => store.save(K.state, { overrides, log }), [overrides, log])
  useEffect(() => store.save(K.zones, zones), [zones])

  const setToast = useCallback((msg) => {
    setToastState(msg)
    window.clearTimeout(window.__wpToast)
    window.__wpToast = window.setTimeout(() => setToastState(null), 2400)
  }, [])

  const reload = useCallback(async () => {
    setStatus('connecting')
    try {
      const { plan, zones: z, snap: s } = await api.loadAll()
      dateToSession.current = plan.dateToSession
      setBasePlan(plan.weeks)
      setOverrides(plan.overrides)
      setLogMap(plan.log)
      if (z) setZones(z)
      if (s) setSnap(s)
      setStatus('live')
    } catch (e) {
      setStatus('offline')
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  // push always reads the ref directly so it never captures a stale session map
  const push = useCallback((date, patch) => {
    const id = dateToSession.current[date]
    if (id) api.saveLog(id, patch).catch(() => {})
  }, [])

  const plan = useMemo(
    () => basePlan.map((w) => ({
      ...w,
      days: w.days.map((d) => (overrides[d.date] ? { ...d, ...overrides[d.date] } : d)),
    })),
    [basePlan, overrides],
  )

  const setOverride = useCallback((date, patch) => {
    setOverrides((o) => ({ ...o, [date]: { ...(o[date] || {}), ...patch } }))
    push(date, patch)
  }, [push])

  const clearOverride = useCallback((date) => {
    setOverrides((o) => { const n = { ...o }; delete n[date]; return n })
    const id = dateToSession.current[date]
    if (id) api.clearLogOverride(id).catch(() => {})
  }, [])

  const isDone = useCallback((date) => !!log[date]?.done, [log])

  const setLog = useCallback((date, patch) => {
    setLogMap((l) => ({ ...l, [date]: { ...(l[date] || {}), ...patch } }))
    push(date, patch)
  }, [push])

  const toggleDone = useCallback((date) => {
    // read current done state then flip it — push reads the ref so no stale closure
    setLogMap((l) => {
      const next = !l[date]?.done
      push(date, { done: next })
      return { ...l, [date]: { ...(l[date] || {}), done: next } }
    })
  }, [push])

  const saveZones = useCallback((next) => {
    setZones(next)
    api.saveZones(next.pace).catch(() => {})
  }, [])

  return {
    tab, setTab,
    plan, basePlan, snap,
    status, reload,
    overrides, log,
    setOverride, clearOverride, isDone, setLog, toggleDone,
    zones, setZones, saveZones,
    toast, setToast,
  }
}
