// Client for the optional Garmin zones feed.
//
// Resolution order:
//   1. VITE_ZONES_FEED_URL (set in your Netlify env)   — your own endpoint
//   2. /.netlify/functions/garmin-zones                — bundled serverless stub
//   3. /zones.json                                     — static snapshot in /public
//
// Returns { ok, pace, hr, meta } on success, or { ok:false, message } so the UI
// can fall back to saved zones and explain what happened. Never throws.

const ENV_URL = import.meta.env?.VITE_ZONES_FEED_URL
const CANDIDATES = [ENV_URL, '/.netlify/functions/garmin-zones', '/zones.json'].filter(Boolean)

export async function syncZonesFromGarmin() {
  for (const url of CANDIDATES) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } })
      if (!res.ok) continue
      const data = await res.json()
      if (!Array.isArray(data.pace)) continue
      return {
        ok: true,
        pace: data.pace,
        hr: data.hr,
        meta: {
          source: data.meta?.source || 'Garmin Connect',
          updated: data.meta?.updated || new Date().toISOString().slice(0, 10),
          note: data.meta?.note,
        },
      }
    } catch {
      /* try next candidate */
    }
  }
  return {
    ok: false,
    message:
      'No live feed responded, so your saved zones are unchanged. To make the sync button pull from Garmin automatically, deploy the included Netlify function (netlify/functions/garmin-zones.js) or point VITE_ZONES_FEED_URL at your own zones endpoint — the README has the steps. You can always edit zones by hand here in the meantime.',
  }
}
