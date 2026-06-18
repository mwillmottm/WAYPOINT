// ============================================================================
// WAYPOINT — 12-week 50K block
// Threshold/tempo-led build (Cunningham / Canova / NCAA / ET flavour) on a high
// aerobic base, with weekend back-to-backs for ultra durability. Every session
// carries its full structure, paces (by Mol's zones), goal elevation and purpose.
// ============================================================================

import { TODAY_ISO, RACE } from './snapshot.js'

// pace strings straight from her zones
const P = {
  sj: 'Recover/SJ 7:50–8:20',
  e:  'Easy 7:15–7:50',
  a:  'Aerobic 6:35–6:55',
  t:  'Threshold 5:45–5:55',
  k5: '5K 5:10–5:20',
  i:  'Interval 5:00–5:10',
  r:  'Rep 4:45–4:55',
  goal: '50K goal ~7:30–7:55',
}

export const KIND = {
  easy:      { label: 'Easy',          color: '#9E8B5E' },
  recovery:  { label: 'Recovery',      color: '#9CA98C' },
  aerobic:   { label: 'Aerobic',       color: '#C9954F' },
  threshold: { label: 'Threshold',     color: '#C2703F' },
  tempo:     { label: 'Tempo',         color: '#C2703F' },
  reps:      { label: '5K / reps',     color: '#B05A3C' },
  vo2:       { label: 'VO₂',           color: '#9F4730' },
  hills:     { label: 'Hill tempo',    color: '#B5603E' },
  long:      { label: 'Long run',      color: '#7C4A36' },
  b2b:       { label: 'Back-to-back',  color: '#A07C53' },
  rest:      { label: 'Rest',          color: '#A89B88' },
  race:      { label: 'RACE',          color: '#BC6B47' },
}

const QUALITY_KINDS = ['threshold', 'tempo', 'reps', 'vo2', 'hills']

// ---------- builders for the "filler" aerobic days ----------
const easy = (km, elev, opts = {}) => ({
  kind: 'easy', zone: 'e', km, elev,
  title: 'Easy aerobic' + (opts.strides ? ' + strides' : ''),
  rows: [
    ['Run', `${km} km`, P.e],
    ...(opts.strides ? [['Strides', '4–6 × 20 s', 'Relaxed fast — ~' + P.r.split(' ')[1]]] : []),
  ],
  purpose: opts.purpose ||
    'Relaxed aerobic volume — the quiet bulk that builds the engine and carries the hard days. Stay conversational; if in doubt, slower.',
})

const recov = (km) => ({
  kind: 'recovery', zone: 'sj', km, elev: 15,
  title: 'Recovery shuffle',
  rows: [['Run', `${km} km`, P.sj]],
  purpose:
    'The easiest day of the week and the one most people rush. Keep it genuinely slow — this is where the adaptation banks. Swap to full rest if recovery flags red.',
})

const aerobic = (km, elev) => ({
  kind: 'aerobic', zone: 'a', km, elev,
  title: 'Aerobic medium-long',
  rows: [
    ['Warm-up', '2 km', P.e],
    ['Steady block', `${km - 2} km`, P.a],
  ],
  purpose:
    'Sustained aerobic-pace running — Canova-style support that raises the floor beneath your threshold. Strong, rhythmic, never straining.',
})

const long = (km, elev, finish) => {
  const rows = [['Build-in', km > 22 ? 'first 4 km' : 'first 2 km', P.e]]
  let purpose =
    'Time on feet — the keystone of the 50K. Fuel from 40 min, hike the steep pitches on purpose, and rehearse exactly what you’ll wear and carry on race day.'
  if (!finish || finish === 'easy') {
    rows.push(['Body', `${km} km steady`, 'Easy → low Aerobic 6:55–7:30'])
  } else if (finish.a) {
    rows.push(['Body', `${km - finish.a} km`, P.e], ['Aerobic finish', `last ${finish.a} km`, P.a])
    purpose = 'Long run with a pressed aerobic close — trains you to lift the effort when already tired, like the back half of the race.'
  } else if (finish.t) {
    const n = finish.t.length
    rows.push(
      ['Easy body', 'to halfway', P.e],
      ['Threshold blocks', `${n} × ${finish.t[0]} km @ T (3 min float between)`, P.t],
      ['Easy finish', 'remainder', P.e],
    )
    purpose = 'Threshold buried deep inside a long run — the most race-specific strength session in the block. Hold form on the last block; that’s the point.'
  } else if (finish.goal) {
    rows.push(['Easy body', `${km - finish.goal} km`, P.e], ['Goal-pace finish', `last ${finish.goal} km`, P.goal])
    purpose = 'Goal-pace rehearsal on loaded legs — lock in race rhythm, fuelling cadence and the mental pattern of pressing late.'
  }
  return {
    kind: 'long', zone: 'e', km, elev,
    title: `Long run — ${km} km`,
    fuel: '50–70 g carbs/hr from 40 min · ~500 ml fluid/hr',
    cadence: 'hold ~175 spm',
    rows, purpose,
  }
}

const b2b = (km, elev) => ({
  kind: 'b2b', zone: 'e', km, elev,
  title: `Back-to-back — ${km} km`,
  fuel: 'top up carbs early — you start pre-fatigued',
  rows: [['Run', `${km} km`, 'Easy → SJ 7:30–8:10']],
  purpose:
    'Run on deliberately tired legs the morning after the long run. This single session builds 50K fatigue resistance better than any amount of fresh mileage.',
})

// ---------- the threshold/tempo library (the heart of the block) ----------
const Q = {
  tc4: { kind: 'threshold', zone: 't', km: 9, elev: 35, title: 'Threshold cruise · 4 × 1 km',
    rows: [['Warm-up', '3 km + 4 strides', P.e], ['Main', '4 × 1 km', P.t], ['Float', '75 s jog', P.sj], ['Cool-down', '2 km', P.e]],
    purpose: 'Daniels cruise intervals. Accumulate time at threshold without the cost of a time-trial. Every rep the same — even is strong.' },
  tc5: { kind: 'threshold', zone: 't', km: 11, elev: 40, title: 'Threshold cruise · 5 × 1 km',
    rows: [['Warm-up', '3 km + 4 strides', P.e], ['Main', '5 × 1 km', P.t], ['Float', '75 s jog', P.sj], ['Cool-down', '2 km', P.e]],
    purpose: 'Your bread-and-butter. Lock 5:45–5:55 and repeat it; the skill is running the exact same pace fresh and fatigued.' },
  tc6: { kind: 'threshold', zone: 't', km: 13, elev: 45, title: 'Threshold cruise · 6 × 1 km',
    rows: [['Warm-up', '3 km + 4 strides', P.e], ['Main', '6 × 1 km', P.t], ['Float', '70 s jog', P.sj], ['Cool-down', '2 km', P.e]],
    purpose: 'More threshold volume, recoveries trimmed slightly. By the last two reps you’re holding form under accumulating fatigue — exactly the 50K skill.' },
  float6: { kind: 'threshold', zone: 't', km: 12, elev: 40, title: 'Float threshold · 6 × (4 min T / 1 min A)',
    rows: [['Warm-up', '3 km', P.e], ['Main', '6 × 4 min @ T', P.t], ['Float', '1 min @ Aerobic (no full rest)', P.a], ['Cool-down', '2 km', P.e]],
    purpose: 'Continuous-feel threshold with aerobic “floats” instead of jog recovery — a big block of quality time with the heart rate never dropping out of work.' },
  t3x2: { kind: 'threshold', zone: 't', km: 13, elev: 50, title: 'Threshold · 3 × 2 km',
    rows: [['Warm-up', '3 km', P.e], ['Main', '3 × 2 km @ T', P.t], ['Recovery', '90 s jog', P.sj], ['Cool-down', '2 km', P.e]],
    purpose: 'Longer threshold reps build the patience to hold the pace. Resist surging early — settle in by 600 m and grind it even.' },
  tBig: { kind: 'threshold', zone: 't', km: 15, elev: 55, title: 'Threshold stack · 2 × 15 min + 2 × 10 min',
    rows: [['Warm-up', '3 km', P.e], ['Block 1', '2 × 15 min @ T', P.t], ['Recovery', '3 min jog', P.sj], ['Block 2', '2 × 10 min @ T', P.t], ['Cool-down', '2 km', P.e]],
    purpose: 'A signature peak-phase threshold session — ~50 min of work split smart. This is the engine that lets you run the 50K just under threshold and not blow up.' },
  tempo20: { kind: 'tempo', zone: 't', km: 9, elev: 35, title: 'Tempo · 20 min continuous',
    rows: [['Warm-up', '3 km', P.e], ['Tempo', '20 min continuous', 'Threshold→Aerobic 5:55–6:10'], ['Cool-down', '2 km', P.e]],
    purpose: 'Sustained comfortably-hard running. Smooth, rhythmic, relaxed shoulders. Build a touch over weeks rather than running it harder.' },
  tempo25: { kind: 'tempo', zone: 't', km: 10, elev: 35, title: 'Tempo · 25 min continuous',
    rows: [['Warm-up', '3 km', P.e], ['Tempo', '25 min continuous', 'Threshold→Aerobic 5:55–6:10'], ['Cool-down', '2 km', P.e]],
    purpose: 'Extend the tempo. Same controlled effort, more time — durability through duration, not intensity.' },
  tempo2x15: { kind: 'tempo', zone: 't', km: 13, elev: 45, title: 'Tempo · 2 × 15 min',
    rows: [['Warm-up', '3 km', P.e], ['Main', '2 × 15 min @ T', P.t], ['Float', '3 min easy', P.e], ['Cool-down', '2 km', P.e]],
    purpose: 'Two strong tempo blocks with a short float — a forgiving way to bank 30 min of threshold while staying mechanically crisp.' },
  tempo3x12: { kind: 'tempo', zone: 't', km: 13, elev: 45, title: 'Tempo · 3 × 12 min',
    rows: [['Warm-up', '3 km', P.e], ['Main', '3 × 12 min @ T', P.t], ['Float', '2.5 min easy', P.e], ['Cool-down', '2 km', P.e]],
    purpose: 'Peak-phase tempo volume. By block three you’re tired — hold the pace and the posture. This is where race toughness is forged.' },
  tempoProg: { kind: 'tempo', zone: 't', km: 12, elev: 50, title: 'Progression · 8 km E→A→T',
    rows: [['Warm-up', '2 km', P.e], ['Progression', '8 km, ramp each 2 km', 'Easy → Aerobic → Threshold (last 2 km @ T)'], ['Cool-down', '2 km', P.e]],
    purpose: 'Negative-split discipline. Start honest-easy and roll down through the gears so the final 2 km lands right at threshold off tired legs.' },
  reps5k: { kind: 'reps', zone: '5k', km: 12, elev: 40, title: '5K-pace reps · 5 × 1 km',
    rows: [['Warm-up', '3 km + strides', P.e], ['Main', '5 × 1 km @ 5K', P.k5], ['Recovery', '90 s jog', P.sj], ['Cool-down', '2 km', P.e]],
    purpose: 'A touch quicker than threshold to keep the top of your aerobic range sharp and your mechanics honest. Controlled, not a race.' },
  vo2_800: { kind: 'vo2', zone: 'i', km: 11, elev: 45, title: 'VO₂ · 6 × 800 m',
    rows: [['Warm-up', '3 km + strides', P.e], ['Main', '6 × 800 m @ Interval', P.i], ['Recovery', '2 min jog', P.sj], ['Cool-down', '2 km', P.e]],
    purpose: 'Sparingly used VO₂ work to lift the ceiling so threshold feels easier. Strong and smooth — never thrash the last rep.' },
  reps200: { kind: 'reps', zone: 'r', km: 9, elev: 25, title: 'Reps · 8 × 200 m',
    rows: [['Warm-up', '3 km + strides', P.e], ['Main', '8 × 200 m @ Rep', P.r], ['Recovery', 'walk/jog 200 m (full)', P.sj], ['Cool-down', '2 km', P.e]],
    purpose: 'Pure mechanics and economy. Fast but relaxed, full recovery — you should feel springy, never wrecked. Keeps leg speed alive in a long block.' },
  hillyTempo: { kind: 'hills', zone: 't', km: 12, elev: 250, title: 'Hilly tempo · rolling 6 km',
    rows: [['Warm-up', '3 km', P.e], ['Tempo', '6 km rolling, by effort', 'Threshold effort (let pace drift on climbs)'], ['Cool-down', '3 km', P.e]],
    purpose: 'Threshold effort over rolling terrain — chase effort, not pace, and power-hike nothing here. Specific prep for a hilly 50K course.' },
  thHills: { kind: 'hills', zone: '5k', km: 11, elev: 200, title: 'Threshold hills · 8 × 60 s',
    rows: [['Warm-up', '3 km', P.e], ['Main', '8 × 60 s strong uphill', '5K effort uphill'], ['Recovery', 'jog down', P.sj], ['Cool-down', '2 km', P.e]],
    purpose: 'Strength and power without the pounding. Tall posture, drive the arms, quick feet. Builds the climbing muscles the race will tax.' },
  sharpen: { kind: 'tempo', zone: 't', km: 7, elev: 25, title: 'Race sharpener · 3 × 3 min',
    rows: [['Warm-up', '2 km', P.e], ['Main', '3 × 3 min @ T', P.t], ['Recovery', '2 min jog', P.sj], ['Cool-down', '1.5 km', P.e]],
    purpose: 'Taper-week primer. Just enough quality to keep the legs sharp and the system awake — you finish feeling fast, not fatigued.' },
}

// ---------- weekly blueprints (Mon→Sun) ----------
// each day is a session object; volume + quality counts are computed below.
const WB = [
  // vol/long tuned for a clean ramp: base < build < peak, with real deload dips.
  { phase: 'Base', pill: 'base', note: 'Re-open the threshold engine gently and re-establish rhythm after the illness.', // ~57 km
    days: [easy(8, 30, { strides: true }), Q.tc5, aerobic(8, 55), Q.tempo20, recov(5), long(13, 200, 'easy'), b2b(6, 45)] },
  { phase: 'Base', pill: 'base', note: 'First proper long run back; introduce float threshold and an aerobic long-run finish.', // ~67 km
    days: [easy(7, 35, { strides: true }), Q.float6, aerobic(9, 75), Q.tc5, recov(6), long(16, 260, { a: 4 }), b2b(6, 55)] },
  { phase: 'Base', pill: 'base', note: 'Threshold volume steps up and the long run gets its first embedded T blocks.', // ~74 km
    days: [easy(8, 40, { strides: true }), Q.tempo2x15, aerobic(9, 90), Q.t3x2, recov(6), long(19, 300, { t: [2, 2, 2] }), b2b(6, 70)] },
  { phase: 'Recovery', pill: 'deload', note: 'Deload. Let the first block consolidate — you’ll feel springy coming out of it.', // ~57 km
    days: [easy(7, 30), Q.tc4, aerobic(7, 45), Q.tempo20, recov(5), long(14, 200, 'easy'), b2b(6, 40)] },
  { phase: 'Build', pill: 'build', note: 'Build phase — longer threshold reps and a progression long run with an aerobic close.', // ~80 km
    days: [easy(8, 40, { strides: true }), Q.t3x2, aerobic(10, 110), Q.tempoProg, recov(6), long(23, 340, { a: 8 }), b2b(8, 80)] },
  { phase: 'Build', pill: 'build', note: 'Biggest base-build week; first goal-pace finish on the long run plus a 5K-pace touch.', // ~87 km
    days: [easy(8, 45, { strides: true }), Q.tempo2x15, aerobic(11, 120), Q.reps5k, recov(7), long(27, 400, { goal: 10 }), b2b(9, 90)] },
  { phase: 'Recovery', pill: 'deload', note: 'Deload before the peak block. Quality stays, volume drops, sleep is the session.', // ~67 km
    days: [easy(7, 35), Q.tc5, aerobic(8, 70), Q.tempo25, recov(6), long(18, 250, 'easy'), b2b(7, 70)] },
  { phase: 'Peak', pill: 'peak', note: 'Peak block opens — the big threshold stack and threshold buried in a 30 km long run.', // ~92 km
    days: [easy(8, 40, { strides: true }), Q.tBig, aerobic(10, 100), Q.hillyTempo, recov(6), long(30, 380, { t: [3, 3] }), b2b(11, 90)] },
  { phase: 'Peak', pill: 'peak', note: 'Peak week — your dress rehearsal. 32 km Sat + 13 km Sun is the 50K durability test.', // ~97 km true peak
    days: [easy(8, 40, { strides: true }), Q.tempo3x12, aerobic(11, 90), Q.tc6, recov(7), long(32, 460, { a: 10 }), b2b(13, 120)] },
  { phase: 'Sharpen', pill: 'build', note: 'Volume eases, intensity stays crisp. Resist the urge to add — the work is banked.', // ~80 km
    days: [easy(8, 40), Q.tempo2x15, aerobic(9, 70), Q.tc5, recov(6), long(24, 340, { a: 8 }), b2b(9, 80)] },
  { phase: 'Taper', pill: 'taper', note: 'Legs come back to life: short, sharp, well-rested. Cut volume, keep the snap.', // ~56 km
    days: [easy(6, 25), Q.tc4, aerobic(6, 40), Q.tempo20, recov(5), long(15, 200, 'easy'), b2b(6, 40)] },
]

// ---------- date helpers ----------
const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function stamp(day, dateObj) {
  return { ...day, date: iso(dateObj), dow: DOW[dateObj.getDay()] }
}

export function buildPlan() {
  const weeks = []
  const today = new Date(TODAY_ISO + 'T05:00:00')

  // --- Return week (Thu 18 → Sun 21 Jun): clearing illness ---
  const ret = [
    { ...easy(4, 20), title: 'Re-entry jog/walk', kind: 'easy', zone: 'sj',
      rows: [['Run/walk', '20–25 min, walk freely', P.sj]],
      purpose: 'First run back. Nasal-breathing easy, walk whenever you like, stop if the chest tightens. Reopening the door — not pushing through it.' },
    recov(4),
    easy(8, 40),
    { ...easy(6, 30, { strides: true }), purpose: 'Finish the return week fresher than you started it. Easy 6 km, then 4 light strides to wake the legs.' },
  ]
  weeks.push({
    n: 0, phase: 'Return', pill: 'deload', label: 'Return from illness',
    note: 'Clearing illness. Genuinely easy — frequency over intensity rebuilds you fastest, and your recovery numbers are already green.',
    days: ret.map((d, i) => stamp(d, addDays(today, i))),
  })

  // --- 11 build weeks from Mon 22 Jun ---
  let mon = new Date('2026-06-22T05:00:00')
  WB.forEach((w, i) => {
    weeks.push({
      n: i + 1, phase: w.phase, pill: w.pill, label: w.phase, note: w.note,
      days: w.days.map((d, k) => stamp(d, addDays(mon, k))),
    })
    mon = addDays(mon, 7)
  })

  // --- Race week (Mon 7 → Sun 13 Sep) ---
  const rmon = new Date('2026-09-07T05:00:00')
  const raceDays = [
    easy(6, 25, { strides: true }),
    Q.sharpen,
    easy(5, 20),
    { ...recov(4), title: 'Recovery + strides', rows: [['Run', '4 km', P.sj], ['Strides', '3 × 20 s', P.r]], purpose: 'Legs ready, not tired. Short and easy with a few strides to stay sharp.' },
    { kind: 'rest', zone: 'sj', km: 0, elev: 0, title: 'Rest / travel', rows: [['Rest', 'full day off', '—']], purpose: 'Full rest. Lay out kit, check drop bags, hydrate well, eat normally. Nothing to gain today but freshness.' },
    { kind: 'race', zone: 'goal', km: 50, elev: 900, title: '50K — RACE DAY', fuel: '50–70 g carbs/hr from the gun · sip electrolytes every aid station', cadence: 'relax — let it self-select',
      rows: [['Climbs', 'from the first one', 'Power-hike — protect the quads'], ['Settle', 'first 25 km', '50K goal ~7:30–7:55, 10–15 s/km slower than feels right'], ['Race', 'final 10 km', 'On what you banked — run the bits you can']],
      purpose: 'Race day. Start patient, hike the climbs early, fuel before you’re hungry, and break it aid station to aid station. The last 10 km is run on the discipline of the first 40.' },
    { kind: 'rest', zone: 'sj', km: 0, elev: 0, title: 'Celebrate / gentle walk', rows: [['Walk', 'if you can move', '—']], purpose: 'You did the thing. Easy walk if the legs allow, then rest properly.' },
  ]
  weeks.push({
    n: 12, phase: 'Race', pill: 'race', label: 'Race week',
    note: 'Taper to a point: less volume, a whisper of intensity, then 50 km. Trust the bank.',
    days: raceDays.map((d, i) => stamp(d, addDays(rmon, i))),
  })

  return weeks
}

// ---------- derived helpers ----------
export const weekVolume = (w) => Math.round(w.days.reduce((s, d) => s + (d.km || 0), 0))
export const weekElev = (w) => w.days.reduce((s, d) => s + (d.elev || 0), 0)
export const weekQuality = (w) => w.days.filter((d) => QUALITY_KINDS.includes(d.kind)).length
export const weekLongest = (w) => Math.max(...w.days.map((d) => d.km || 0))
export const isQuality = (kind) => QUALITY_KINDS.includes(kind)
export { P }
