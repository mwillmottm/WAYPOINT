import { useState } from 'react'
import { SNAP as SNAP_FALLBACK } from '../../data/snapshot.js'
import { KIND } from '../../data/plan.js'
import { TODAY_ISO } from '../../data/snapshot.js'
import { findDay, currentWeek } from '../../lib/utils.js'
import { SessionDetail } from '../ui.jsx'
import { IconCheck, IconCoach } from '../icons.jsx'

// Derive a strain score (0–21, Whoop-style) from available signals.
// Acute load, stress, and session intensity are the main drivers.
function calcStrain(snap, day) {
  const kindWeight = {
    rest: 0, recovery: 2, easy: 5, aerobic: 7, b2b: 8,
    long: 10, threshold: 13, tempo: 13, hills: 14,
    reps: 15, vo2: 16, race: 21,
  }
  const sessionBase = kindWeight[day?.kind] ?? 6
  // scale by acute load position (0 = depleted, 1 = optimal)
  const loadFactor = Math.min(snap.acute / 300, 1.2)
  const stressFactor = 1 + (snap.stress - 20) / 200
  return Math.min(21, Math.max(0, Math.round(sessionBase * loadFactor * stressFactor)))
}

function strainColor(score) {
  if (score <= 7) return '#9CA98C'   // sage — light
  if (score <= 13) return '#C99A4B'  // ochre — moderate
  if (score <= 17) return '#BC6B47'  // clay — strenuous
  return '#A14A35'                   // rust — all out
}

function strainLabel(score) {
  if (score <= 7) return 'Light'
  if (score <= 13) return 'Moderate'
  if (score <= 17) return 'Strenuous'
  return 'All out'
}

function StrainWheel({ score }) {
  const r = 36, circ = 2 * Math.PI * r
  const color = strainColor(score)
  const label = strainLabel(score)
  const fill = circ - circ * (score / 21)
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="font-display text-[16px] text-ink">Training strain</div>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
          style={{ background: color + '22', color }}>
          {label}
        </span>
      </div>
      <div className="flex items-center gap-4 mt-3">
        <svg width="84" height="84" viewBox="0 0 84 84">
          <circle cx="42" cy="42" r={r} stroke="#E6DCCB" strokeWidth="7" fill="none" />
          <circle cx="42" cy="42" r={r} stroke={color} strokeWidth="7" fill="none"
            strokeLinecap="round" strokeDasharray={circ}
            strokeDashoffset={fill} transform="rotate(-90 42 42)" />
          <text x="42" y="40" textAnchor="middle" fontFamily="JetBrains Mono"
            fill="#352E27" fontSize="19" fontWeight="700">{score}</text>
          <text x="42" y="55" textAnchor="middle" fill="#8C8173" fontSize="9">/ 21</text>
        </svg>
        <div className="text-[13px] text-slate leading-relaxed">
          Expected strain for today's session based on your current load and stress levels.
          <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
            {[['#9CA98C','≤7 Light'],['#C99A4B','8–13 Mod'],['#BC6B47','14–17 Hard'],['#A14A35','18+ All out']].map(([c,l])=>(
              <span key={l} className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{background:c}}/>
                <span className="text-muted">{l}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ k, v, u, chip, chipTone }) {
  const tone = {
    good: 'bg-sage/20 text-sage-deep',
    low: 'bg-sky/20 text-[#5a7686]',
    warn: 'bg-ochre/25 text-[#9c7a2e]',
  }[chipTone]
  return (
    <div className="bg-bone border border-line-soft rounded-lg px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-[.08em] text-muted flex items-center gap-1.5">
        {k} <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${tone}`}>{chip}</span>
      </div>
      <div className="font-mono font-bold text-[17px] mt-1 text-ink">
        {v}<span className="text-[11px] text-muted font-normal"> {u}</span>
      </div>
    </div>
  )
}

function ReadinessWheel({ snap }) {
  const r = 36, circ = 2 * Math.PI * r, ring = snap.readiness
  const readyLabel = ring >= 70 ? 'Ready to run' : ring >= 50 ? 'Moderate' : 'Take it easy'
  const readyColor = ring >= 70 ? { bg: 'rgba(126,140,106,.2)', text: '#5F6E4E' }
    : ring >= 50 ? { bg: 'rgba(201,154,75,.2)', text: '#9c7a2e' }
    : { bg: 'rgba(161,74,53,.15)', text: '#A14A35' }
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="font-display text-[16px] text-ink">Readiness</div>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
          style={readyColor}>{readyLabel}</span>
      </div>
      <div className="flex items-center gap-4 my-3">
        <svg width="84" height="84" viewBox="0 0 84 84">
          <circle cx="42" cy="42" r={r} stroke="#E6DCCB" strokeWidth="7" fill="none" />
          <circle cx="42" cy="42" r={r} stroke="#7E8C6A" strokeWidth="7" fill="none"
            strokeLinecap="round" strokeDasharray={circ}
            strokeDashoffset={circ - circ * ring / 100} transform="rotate(-90 42 42)" />
          <text x="42" y="40" textAnchor="middle" fontFamily="JetBrains Mono"
            fill="#352E27" fontSize="19" fontWeight="700">{ring}</text>
          <text x="42" y="55" textAnchor="middle" fill="#8C8173" fontSize="9">/ 100</text>
        </svg>
        <div className="text-[13px] text-slate leading-relaxed">
          Recovery time <b className="text-sage-deep">{snap.recoveryHrs}</b> — fully recovered.<br />
          Overnight signals point to <b className="text-sage-deep">green</b> for an easy effort.
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Metric k="Resting HR" v={snap.rhr} u="bpm" chip={`▼ ${snap.rhr7 - snap.rhr} vs avg`} chipTone="good" />
        <Metric k="HRV" v={snap.hrv} u="ms" chip={snap.hrvStatus} chipTone="good" />
        <Metric k="Sleep" v={snap.sleep} u="/100" chip="Good" chipTone="good" />
        <Metric k="Body batt." v={snap.battery} u="/100" chip="Charged" chipTone="low" />
        <Metric k="Stress" v={snap.stress} u="/100" chip="Low" chipTone="good" />
        <Metric k="SpO₂" v={snap.spo2} u="%" chip="Normal" chipTone="good" />
      </div>
    </div>
  )
}

function RunFeedback({ day, log, setLog, setToast }) {
  const existing = log[day.date]?.notes || ''
  const [text, setText] = useState(existing)
  const [saved, setSaved] = useState(!!existing)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const saveFeedback = () => {
    setLog(day.date, { notes: text })
    setSaved(true)
    setToast('Run notes saved')
  }

  const analyse = async () => {
    if (!text.trim()) { setToast('Add some notes about your run first'); return }
    setLoading(true)
    try {
      const prompt = `You are an experienced running coach. A runner just completed the following planned session:

Session: ${day.title}
Planned distance: ${day.km ? day.km + ' km' : 'not specified'}
Session type: ${day.kind}
Purpose: ${day.purpose || 'not specified'}
Planned structure: ${day.rows?.map(r => r[0] + ': ' + r[1] + ' @ ' + r[2]).join(' | ') || 'not specified'}

The runner's feedback: "${text}"

Give a concise, warm, practical coaching response (3–4 sentences max). Evaluate how the session went, what it means for their training, and one specific thing to focus on next time. Be direct and encouraging. Do not use bullet points.`

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await res.json()
      const reply = data.content?.find(b => b.type === 'text')?.text || 'Could not generate feedback right now.'
      setFeedback(reply)
    } catch {
      setFeedback('Could not reach the coaching engine right now — your notes are saved and you can try again.')
    }
    setLoading(false)
  }

  return (
    <div className="card p-5 mt-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 shrink-0 rounded-lg bg-clay grid place-items-center text-bone">
          <IconCoach className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-display text-[15px] text-ink">How did that go?</h4>
          <p className="text-[12px] text-muted">Log your run and get instant coaching feedback</p>
        </div>
      </div>
      <textarea
        className="input text-[13.5px] leading-relaxed"
        rows="3"
        value={text}
        onChange={e => { setText(e.target.value); setSaved(false) }}
        placeholder="e.g. Hit all 5 threshold reps at 5:48, legs felt heavy on rep 4 but held form. HR peaked at 178..."
      />
      <div className="flex gap-2 mt-3 flex-wrap">
        <button className="btn btn-ghost btn-sm" onClick={saveFeedback}>
          <IconCheck className="w-4 h-4" />{saved ? 'Saved' : 'Save notes'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={analyse} disabled={loading}>
          {loading ? 'Analysing…' : '✦ Get coaching feedback'}
        </button>
      </div>
      {feedback && (
        <div className="mt-4 p-4 rounded-xl border-l-2 border-clay bg-bone text-[13.5px] text-slate leading-relaxed">
          <span className="font-semibold text-ink block mb-1">Coach's response</span>
          {feedback}
        </div>
      )}
    </div>
  )
}

export function Today({ ctx }) {
  const { plan, isDone, setLog, toggleDone, openModal, setTab, setToast, log } = ctx
  const SNAP = ctx.snap || SNAP_FALLBACK
  const day = findDay(plan, TODAY_ISO)
  const k = KIND[day.kind]
  const done = isDone(day.date)
  const week = currentWeek(plan)
  const strain = calcStrain(SNAP, day)

  return (
    <div className="animate-rise">
      <div className="eyebrow">{week.label}</div>
      <h1 className="pagetitle mt-1.5">Today's <span className="thin">waypoint</span></h1>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 mt-5">
        {/* session card */}
        <div className="card p-5 relative overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-1" style={{ background: k.color }} />
          <div className="flex items-start gap-3">
            <div>
              <span className="pill" style={{ background: k.color + '22', color: k.color, border: `1px solid ${k.color}55` }}>
                {k.label}
              </span>
              <div className="font-display text-[22px] text-ink mt-2">{day.title}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="font-mono font-bold text-[30px] leading-none text-ink">
                {day.km ?? '—'}<span className="text-[14px] text-muted">{day.km != null ? ' km' : ''}</span>
              </div>
            </div>
          </div>
          <div className="mt-4"><SessionDetail day={day} /></div>
          <div className="flex flex-wrap gap-2 mt-5">
            {done ? (
              <span className="inline-flex items-center gap-2 text-sage-deep font-semibold text-sm">
                <IconCheck className="w-[18px] h-[18px]" />Logged — nice work
              </span>
            ) : (
              <>
                <button className="btn btn-primary"
                  onClick={() => { setLog(day.date, { done: true }); setToast('Logged — great work') }}>
                  <IconCheck className="w-[17px] h-[17px]" />Mark done
                </button>
                <button className="btn btn-ghost" onClick={() => openModal(day.date)}>Adjust</button>
                <button className="btn btn-ghost" onClick={() => setTab('reroute')}>Not feeling it?</button>
              </>
            )}
          </div>
        </div>

        {/* right column — readiness + strain stacked */}
        <div className="flex flex-col gap-4">
          <ReadinessWheel snap={SNAP} />
          <StrainWheel score={strain} />
        </div>
      </div>

      {/* coach note */}
      <div className="card p-5 mt-4 flex gap-4" style={{ background: 'linear-gradient(120deg,#FBF6EE,#F7F0E6)' }}>
        <div className="w-9 h-9 shrink-0 rounded-lg bg-clay grid place-items-center text-bone">
          <IconCoach className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-display text-[15px] text-ink mb-1">Coach's read on today</h4>
          <p className="text-[13.5px] text-slate leading-relaxed">
            Your overnight numbers are green — HRV has rebalanced and resting HR sits below your 7-day average.
            Today's session is {k.label.toLowerCase()} — expected strain of {strain}/21.
            Keep effort honest to the zone and finish wanting more. The 50K is won by the runs you recover from.
          </p>
        </div>
      </div>

      {/* run feedback */}
      <RunFeedback day={day} log={log} setLog={setLog} setToast={setToast} />
    </div>
  )
}
