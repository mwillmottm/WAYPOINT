// Mol's training zones.
// Pace zones are her own ET/Daniels 7-zone set (from Garmin Connect, 18 Jun 2026).
// These are the single source of truth every session in the plan is built from.

export const PACE_ZONES = [
  { key: 'sj', name: 'Recover / SJ',   lo: '7:50', hi: '8:20', color: '#9CA98C',
    use: 'Recovery jogs, shake-outs, easy second runs. Pure flush.' },
  { key: 'e',  name: 'Easy',           lo: '7:15', hi: '7:50', color: '#B6A06A',
    use: 'Daily aerobic mileage, warm-ups and cool-downs. Conversational.' },
  { key: 'a',  name: 'Aerobic',        lo: '6:35', hi: '6:55', color: '#CDA15A',
    use: 'Steady aerobic / marathon-effort support runs. Strong but controlled.' },
  { key: 't',  name: 'Threshold',      lo: '5:45', hi: '5:55', color: '#C2703F',
    use: 'Cruise intervals & tempo — your engine room. Comfortably hard.' },
  { key: '5k', name: '5K Pace',        lo: '5:10', hi: '5:20', color: '#B05A3C',
    use: 'Long reps and control intervals. Sharpening the top of the aerobic range.' },
  { key: 'i',  name: 'Interval',       lo: '5:00', hi: '5:10', color: '#9F4730',
    use: 'VO₂ max work — 3–5 min reps. Used sparingly to lift the ceiling.' },
  { key: 'r',  name: 'Repetition',     lo: '4:45', hi: '4:55', color: '#8A3B2E',
    use: 'Short reps for economy, mechanics and leg speed. Full recovery.' },
]

export const HR_ZONES = [
  { z: 'Z1', name: 'Recovery',  lo: 0,   hi: 133, color: '#9CA98C' },
  { z: 'Z2', name: 'Aerobic',   lo: 134, hi: 165, color: '#CDA15A' },
  { z: 'Z3', name: 'Tempo',     lo: 166, hi: 182, color: '#C2703F' },
  { z: 'Z4', name: 'Threshold', lo: 183, hi: 198, color: '#B05A3C' },
  { z: 'Z5', name: 'VO₂ max',   lo: 199, hi: 205, color: '#8A3B2E' },
]

export const LTHR = 173          // lactate threshold heart rate (Garmin)
export const MAX_HR = 205

export const ZONES_META = {
  source: 'Garmin Connect',
  updated: '2026-06-18',
  note: 'Pace zones synced from your Garmin run-pace settings.',
}

// quick lookup: zone key -> "lo–hi"
export const paceOf = (key) => {
  const z = PACE_ZONES.find((p) => p.key === key)
  return z ? `${z.lo}–${z.hi}` : '—'
}
export const colorOf = (key) => PACE_ZONES.find((p) => p.key === key)?.color || '#8C8173'
