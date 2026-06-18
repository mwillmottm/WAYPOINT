// Zones feed: now backed by Supabase. "Sync from Garmin" re-pulls pace_zones
// from the database (where a Garmin worker would write the latest), falling back
// to the optional Netlify function / static JSON, then to saved zones.

import { getZones } from './api.js'

export async function syncZonesFromGarmin() {
  // 1) Supabase (the live source of truth)
  try {
    const z = await getZones()
    return { ok: true, pace: z.pace, hr: z.hr, meta: { ...z.meta, source: z.meta.source || 'Garmin Connect' } }
  } catch {
    /* fall through */
  }

  // 2) optional static endpoints if Supabase is unreachable
  const candidates = [import.meta.env?.VITE_ZONES_FEED_URL, '/.netlify/functions/garmin-zones', '/zones.json'].filter(Boolean)
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } })
      if (!res.ok) continue
      const data = await res.json()
      if (Array.isArray(data.pace)) {
        return { ok: true, pace: data.pace, hr: data.hr, meta: data.meta || { source: 'Garmin Connect' } }
      }
    } catch {
      /* try next */
    }
  }

  return {
    ok: false,
    message:
      'Could not reach the zones feed just now, so your saved zones are unchanged. The dashboard normally reads zones from Supabase; check your connection or the project URL/key. You can always edit zones by hand here.',
  }
}
