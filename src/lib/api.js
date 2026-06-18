import { buildPlan } from '../data/plan.js'

const BASE = import.meta.env.VITE_SUPABASE_URL
const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY

function hdr() {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

async function rest(path, init = {}) {
  if (!BASE || !KEY) throw new Error('no supabase config')
  const r = await fetch(`${BASE}/rest/v1${path}`, { headers: hdr(), ...init })
  if (!r.ok) throw new Error(`supabase ${r.status}`)
  const text = await r.text()
  return text ? JSON.parse(text) : []
}

export async function loadAll() {
  const [sessions, zonesRows] = await Promise.all([
    rest('/sessions?select=id,date,overrides,log&order=date'),
    rest('/zones?select=pace,hr,meta&limit=1'),
  ])

  const dateToSession = {}
  const overrides = {}
  const log = {}

  for (const s of sessions) {
    dateToSession[s.date] = s.id
    if (s.overrides && Object.keys(s.overrides).length) overrides[s.date] = s.overrides
    if (s.log && Object.keys(s.log).length) log[s.date] = s.log
  }

  return {
    plan: { weeks: buildPlan(), dateToSession, overrides, log },
    zones: zonesRows[0] ?? null,
    snap: null,
  }
}

export async function saveLog(id, patch) {
  const [row] = await rest(`/sessions?id=eq.${id}&select=log`)
  const merged = { ...(row?.log ?? {}), ...patch }
  await rest(`/sessions?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ log: merged }),
  })
}

export async function clearLogOverride(id) {
  await rest(`/sessions?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ overrides: {} }),
  })
}

export async function saveZones(paceZones) {
  await rest('/zones?limit=1', {
    method: 'PATCH',
    body: JSON.stringify({ pace: paceZones }),
  })
}
