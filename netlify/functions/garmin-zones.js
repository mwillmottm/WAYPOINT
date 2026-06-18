// netlify/functions/garmin-zones.js
//
// Serverless endpoint for the "Sync from Garmin" button. Deployed automatically
// by Netlify and reachable at /.netlify/functions/garmin-zones
//
// Out of the box this returns the bundled snapshot so the button works on day one.
// To make it pull LIVE zones from Garmin, replace the body of fetchLiveZones()
// with a call to your Garmin source and set the env vars in Netlify.
//
// Why a function at all? Garmin has no public browser-callable zones API, and
// credentials must never live in front-end code. A serverless function keeps the
// secret server-side and hands the browser only the finished zone numbers.

const SNAPSHOT = {
  meta: { source: 'Garmin Connect', updated: '2026-06-18', note: 'Served by garmin-zones function.' },
  pace: [
    { key: 'sj', name: 'Recover / SJ', lo: '7:50', hi: '8:20', color: '#9CA98C', use: 'Recovery jogs, shake-outs, easy second runs. Pure flush.' },
    { key: 'e',  name: 'Easy',          lo: '7:15', hi: '7:50', color: '#B6A06A', use: 'Daily aerobic mileage, warm-ups and cool-downs. Conversational.' },
    { key: 'a',  name: 'Aerobic',       lo: '6:35', hi: '6:55', color: '#CDA15A', use: 'Steady aerobic / marathon-effort support runs. Strong but controlled.' },
    { key: 't',  name: 'Threshold',     lo: '5:45', hi: '5:55', color: '#C2703F', use: 'Cruise intervals & tempo — your engine room. Comfortably hard.' },
    { key: '5k', name: '5K Pace',       lo: '5:10', hi: '5:20', color: '#B05A3C', use: 'Long reps and control intervals.' },
    { key: 'i',  name: 'Interval',      lo: '5:00', hi: '5:10', color: '#9F4730', use: 'VO2 max work — 3-5 min reps.' },
    { key: 'r',  name: 'Repetition',    lo: '4:45', hi: '4:55', color: '#8A3B2E', use: 'Short reps for economy and leg speed.' },
  ],
  hr: [
    { z: 'Z1', name: 'Recovery',  lo: 0,   hi: 133, color: '#9CA98C' },
    { z: 'Z2', name: 'Aerobic',   lo: 134, hi: 165, color: '#CDA15A' },
    { z: 'Z3', name: 'Tempo',     lo: 166, hi: 182, color: '#C2703F' },
    { z: 'Z4', name: 'Threshold', lo: 183, hi: 198, color: '#B05A3C' },
    { z: 'Z5', name: 'VO2 max',   lo: 199, hi: 205, color: '#8A3B2E' },
  ],
}

// Convert Garmin's run pace zones (metres/second boundaries) to mm:ss per km.
const mpsToPace = (mps) => {
  const sec = 1000 / mps
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

async function fetchLiveZones() {
  // --- WIRE YOUR GARMIN SOURCE HERE -----------------------------------------
  // Example shape once you have a connection (e.g. via a python-garminconnect
  // worker, an exported JSON in object storage, or a third-party API):
  //
  //   const res = await fetch(process.env.GARMIN_ZONES_URL, {
  //     headers: { Authorization: `Bearer ${process.env.GARMIN_TOKEN}` },
  //   })
  //   const z = await res.json()
  //   return {
  //     meta: { source: 'Garmin Connect', updated: new Date().toISOString().slice(0,10) },
  //     pace: z.runZones.map(r => ({ ...mapKey(r), lo: mpsToPace(r.high), hi: mpsToPace(r.low) })),
  //     hr:   z.hrZones.map(...),
  //   }
  //
  // Until that's wired, return null to fall back to the bundled snapshot.
  return null
}

export async function handler() {
  const headers = {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  }
  try {
    const live = await fetchLiveZones()
    return { statusCode: 200, headers, body: JSON.stringify(live || SNAPSHOT) }
  } catch (err) {
    return { statusCode: 200, headers, body: JSON.stringify(SNAPSHOT) }
  }
}
