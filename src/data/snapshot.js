// src/data/snapshot.js
// Static fallback — used ONLY if Supabase is unreachable.
// The live snapshot from Supabase always takes precedence via useWaypoint.js.
// Update these values periodically as a sensible fallback baseline.

export const TODAY_ISO = new Date().toLocaleDateString('en-CA', {
  timeZone: 'Australia/Brisbane'
})

export const SNAP = {
  // identity
  syncedAt: 'Cached data',
  athlete: { name: 'Mol Willmott', loc: 'Torquay VIC', weight: 68.4 },

  // readiness
  readiness: 75,
  recoveryHrs: '1 hr',

  // heart
  rhr: 54,
  rhr7: 57,

  // HRV
  hrv: 49,
  hrvStatus: 'Balanced',

  // sleep
  sleep: 80,

  // wellness
  battery: 85,
  stress: 25,
  spo2: 97,

  // training
  vo2: 42,
  ltHr: 173,
  status: 'RECOVERY_2',
  acute: 168,
  chronic: 321,
  acwr: 0.5,
  chronicBand: [257, 482],
  balance: 'AEROBIC_HIGH_SHORTAGE',

  // race predictions
  preds: {
    '5K': '26:39',
    '10K': '58:46',
    'Half Marathon': '2:17:34',
    Marathon: '5:11:07',
  },

  // HRV trend (last 7 days fallback)
  hrvTrend: [44, 47, 49, 43, 51, 49, 53],
  vo2Trend: [42, 42, 42, 42],

  // recent runs fallback
  recent: [],
  stream: { dist: [], hr: [], pace: [], alt: [], avgHr: 0, maxHr: 0, avgPace: '0:00', climb: 0 },
  lastAutoSync: null,
}
