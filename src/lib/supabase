// src/lib/supabase.js
// Tiny PostgREST client — no SDK needed, just fetch.
// URL + key come from Vite env vars with the project values baked in as fallback.

const RAW_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  'https://pvmthpqjaqqnfpzwiade.supabase.co'
const KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  'sb_publishable_UJC73igY2OHInZr5GNRprg_E8qEaccC'

export const PROJECT_URL = RAW_URL.replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
const BASE = `${PROJECT_URL}/rest/v1`

export const sbConfigured = !!(PROJECT_URL && KEY)

const headers = (extra = {}) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  ...extra,
})

export async function sbGet(table, query = '') {
  const res = await fetch(`${BASE}/${table}?${query}`, { headers: headers() })
  if (!res.ok) throw new Error(`GET ${table} → ${res.status}`)
  return res.json()
}

export async function sbUpsert(table, rows, onConflict) {
  const url = `${BASE}/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`
  const res = await fetch(url, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  })
  if (!res.ok) throw new Error(`UPSERT ${table} → ${res.status} ${await res.text()}`)
  return res.json()
}

export async function sbPatch(table, query, patch) {
  const res = await fetch(`${BASE}/${table}?${query}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`PATCH ${table} → ${res.status}`)
  return res.json()
}
