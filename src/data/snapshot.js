// src/data/snapshot.js
// Snapshot pulled from Garmin Connect on 18 Jun 2026.
// This file is the fallback when Supabase is unreachable.
// The live dashboard reads from Supabase which is updated nightly by the sync function.

export const SNAP = {
  syncedAt: '18 Jun 2026 · 5:00am',
  athlete: { name: 'Mol Willmott', loc: 'Torquay · Surf Coast VIC', weight: 68.4 },

  // recovery (18 Jun — real values)
  readiness: 78,
  recoveryHrs: '1 hr',
  rhr: 54, rhr7: 59,
  hrv: 49, hrvStatus: 'Balanced',
  sleep: 80, battery: 94, stress: 26, spo2: 97,

  // fitness markers
  vo2: 42,
  ltHr: 173,
  status: 'Recovery',
  acute: 168, chronic: 321, acwr: 0.5,
  chronicBand: [257, 482],
  balance: 'Aerobic-high shortage',

  preds: { '5K': '26:39', '10K': '58:46', Half: '2:17:34', Marathon: '5:11:07' },

  // HRV trend 22 days (28 May → 18 Jun)
  hrvTrend: [44, 45, 45, 47, 49, 48, 48, 47, 46, 44, 41, 41, 41, 42, 42, 42, 42, 41, 41, 40, 40, 49],
  vo2Trend: [42, 42, 42, 42],

  // recent runs (from Garmin activities)
  recent: [
    { d: '12 Jun', t: 'Mount Duneed Running', km: 7.02, pace: '6:49', re: 65, hr: 161 },
    { d: '11 Jun', t: 'Mount Duneed — NCAA Float', km: 7.46, pace: '7:03', re: 66, hr: 161 },
    { d: '09 Jun', t: 'Mount Duneed Running', km: 5.02, pace: '6:58', re: 35, hr: 155 },
    { d: '07 Jun', t: 'Mount Duneed Running', km: 5.43, pace: '7:54', re: 32, hr: 153 },
    { d: '06 Jun', t: 'Torquay — Long Run',   km: 8.40, pace: '7:23', re: 78, hr: 160 },
    { d: '05 Jun', t: 'Mount Duneed Running', km: 6.46, pace: '8:12', re: 35, hr: 149 },
    { d: '04 Jun', t: 'Treadmill Running',    km: 4.86, pace: '7:41', re: 28, hr: 158 },
  ],

  stream: {
    dist: [0, 0.8, 1.6, 2.4, 3.2, 4.0, 4.8, 5.6, 6.4, 7.2, 8.0, 8.4],
    hr:   [131, 156, 160, 164, 162, 159, 167, 168, 165, 168, 162, 156],
    pace: [440, 432, 430, 425, 452, 460, 418, 402, 408, 410, 420, 415],
    alt:  [10, 16, 8, 11, 7, 3, 12, 14, 11, 15, 13, 16],
    avgHr: 160, maxHr: 178, avgPace: '7:23', climb: 56,
  },
}

export const RACE = { name: '50K Ultra', date: '2026-09-12', distanceKm: 50 }
export const TODAY_ISO = '2026-06-18'
