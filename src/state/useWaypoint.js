import { useState, useMemo, useCallback, useEffect } from 'react'
import { buildPlan } from '../data/plan.js'
import { PACE_ZONES, HR_ZONES, ZONES_META } from '../data/zones.js'
import * as store from '../lib/storage.js'

const K = { state: 'waypoint:state:v2', zones: 'waypoint:zones:v2' }

export function useWaypoint() {
  const basePlan = useMemo(() => buildPlan(), [])

  const [tab, setTab] = useState('today')
  const [persist, setPersist] = useState(() =>
    store.load(K.state, { overrides: {}, log: {} }),
  )
  const [zones, setZones] = useState(() =>
    store.load(K.zones, { pace: PACE_ZONES, hr: HR_ZONES, meta: ZONES_META }),
  )
  const [toast, setToastState] = useState(null)

  useEffect(() => store.save(K.state, persist), [persist])
  useEffect(() => store.save(K.zones, zones), [zones])

  const setToast = useCallback((msg) => {
    setToastState(msg)
    window.clearTimeout(window.__wpToast)
    window.__wpToast = window.setTimeout(() => setToastState(null), 2200)
  }, [])

  // effective plan = base plan with per-date overrides applied
  const plan = useMemo(() => {
    const ov = persist.overrides
    return basePlan.map((w) => ({
      ...w,
      days: w.days.map((d) => (ov[d.date] ? { ...d, ...ov[d.date] } : d)),
    }))
  }, [basePlan, persist.overrides])

  const setOverride = useCallback((date, patch) => {
    setPersist((p) => ({ ...p, overrides: { ...p.overrides, [date]: { ...(p.overrides[date] || {}), ...patch } } }))
  }, [])

  const clearOverride = useCallback((date) => {
    setPersist((p) => {
      const o = { ...p.overrides }; delete o[date]
      return { ...p, overrides: o }
    })
  }, [])

  const isDone = useCallback((date) => !!persist.log[date]?.done, [persist.log])

  const setLog = useCallback((date, patch) => {
    setPersist((p) => ({ ...p, log: { ...p.log, [date]: { ...(p.log[date] || {}), ...patch } } }))
  }, [])

  const toggleDone = useCallback((date) => {
    setPersist((p) => {
      const cur = p.log[date]?.done
      return { ...p, log: { ...p.log, [date]: { ...(p.log[date] || {}), done: !cur } } }
    })
  }, [])

  return {
    tab, setTab,
    plan, basePlan,
    overrides: persist.overrides, log: persist.log,
    setOverride, clearOverride, isDone, setLog, toggleDone,
    zones, setZones,
    toast, setToast,
  }
}
