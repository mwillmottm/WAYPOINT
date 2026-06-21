// src/state/useWaypoint.js
import { useState, useEffect, useCallback, useRef } from 'react'
import { loadAll, saveLog, clearLogOverride } from '../lib/api.js'
import { SNAP as FALLBACK_SNAP, TODAY_ISO } from '../data/snapshot.js'
import { buildPlan } from '../data/plan.js'

function applyOverrides(weeks, overrides) {
  return weeks.map(w => ({
    ...w,
    days: w.days.map(d => {
      const ov = overrides[d.date]
      return ov ? { ...d, ...ov } : d
    }),
  }))
}

export function useWaypoint() {
  const [tab, setTab]         = useState('today')
  const [status, setStatus]   = useState('connecting') // 'connecting' | 'live' | 'offline'
  const [toast, setToastMsg]  = useState(null)
  const [snap, setSnap]       = useState(null)   // null = not yet loaded
  const [plan, setPlan]       = useState(() => buildPlan())
  const [log, setLogState]    = useState({})
  const [overrides, setOv]    = useState({})
  const toastTimer            = useRef(null)
  const dateToSession         = useRef({})

  const setToast = useCallback((msg) => {
    setToastMsg(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000)
  }, [])

  const load = useCallback(async () => {
    setStatus('connecting')
    try {
      const data = await loadAll()

      // Always use live Supabase snapshot — never fall back to static if we got data
      if (data.snap) {
        setSnap(data.snap)
        setStatus('live')
      } else {
        // Supabase reachable but no snapshot row yet — use fallback but stay "live"
        setSnap(FALLBACK_SNAP)
        setStatus('live')
      }

      if (data.plan) {
        const applied = applyOverrides(data.plan.weeks, data.plan.overrides)
        setPlan(applied)
        setLogState(data.plan.log || {})
        setOv(data.plan.overrides || {})
        dateToSession.current = data.plan.dateToSession || {}
      }
    } catch (err) {
      console.warn('[useWaypoint] load failed:', err.message)
      setStatus('offline')
      // Only use fallback if we have nothing yet
      setSnap(prev => prev ?? FALLBACK_SNAP)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const isDone = useCallback((date) => !!log[date]?.done, [log])

  const toggleDone = useCallback(async (date) => {
    const sessionId = dateToSession.current[date]
    if (!sessionId) return
    const nowDone = !log[date]?.done
    setLogState(prev => ({ ...prev, [date]: { ...prev[date], done: nowDone } }))
    try { await saveLog(sessionId, { done: nowDone }) } catch { /* offline ok */ }
  }, [log])

  const setLog = useCallback(async (date, patch) => {
    const sessionId = dateToSession.current[date]
    if (!sessionId) return
    setLogState(prev => ({ ...prev, [date]: { ...prev[date], ...patch } }))
    try { await saveLog(sessionId, patch) } catch { /* offline ok */ }
  }, [])

  const setOverride = useCallback(async (date, patch) => {
    const sessionId = dateToSession.current[date]
    if (!sessionId) return
    setOv(prev => ({ ...prev, [date]: { ...prev[date], ...patch } }))
    setPlan(prev => prev.map(w => ({
      ...w,
      days: w.days.map(d => d.date === date ? { ...d, ...patch } : d),
    })))
    try { await saveLog(sessionId, patch) } catch { /* offline ok */ }
  }, [])

  const clearOverride = useCallback(async (date) => {
    const sessionId = dateToSession.current[date]
    if (!sessionId) return
    setOv(prev => { const n = { ...prev }; delete n[date]; return n })
    try { await clearLogOverride(sessionId) } catch { /* offline ok */ }
    await load()
  }, [load])

  return {
    tab, setTab,
    status,
    toast, setToast,
    // Use live snap if available, otherwise fallback — but snap starts null (loading)
    snap: snap ?? FALLBACK_SNAP,
    plan,
    log,
    overrides,
    isDone,
    toggleDone,
    setLog,
    setOverride,
    clearOverride,
    reload: load,
  }
}
