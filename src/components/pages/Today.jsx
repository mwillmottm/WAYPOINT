import { useState, useEffect } from 'react'
import { SNAP as SNAP_FALLBACK } from '../../data/snapshot.js'
import { KIND } from '../../data/plan.js'
import { findDay, currentWeek, isToday, flatDays } from '../../lib/utils.js'
import { SessionDetail } from '../ui.jsx'
import { IconCheck, IconCoach } from '../icons.jsx'
import { getRecentActivityDetails } from '../../lib/api.js'

// Get today's ISO dynamically — never from the static fallback constant
function getTodayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
}

/* ---- Readiness wheel ---- */
function ReadinessWheel({ v = 0 }) {
  const r = 34, circ = 2 * Math.PI * r
  const color = v >= 70 ? '#7E8C6A' : v >= 50 ? '#C99A4B' : '#A14A35'
  const label = v >= 70 ? 'Ready' : v >= 50 ? 'Moderate' : 'Low'
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} stroke="#E6DCCB" strokeWidth="6" fill="none" />
        <circle cx="40" cy="40" r={r} stroke={color} strokeWidth="6" fill="none"
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={circ - circ * v / 100} transform="rotate(-90 40 40)" />
        <text x="40" y="37" textAnchor="middle" fontFamily="JetBrains Mono" fill="#352E27" fontSize="17" fontWeight="700">{v}</text>
        <text x="40" y="51" textAnchor="middle" fill="#8C8173" fontSize="9">/100</text>
      </svg>
      <span className="text-[11px] font-semibold" style={{ color }}>{label}</span>
      <span className="text-[10px] text-muted">Readiness</span>
    </div>
  )
}

/* ---- Strain wheel ---- */
function StrainWheel({ score = 0 }) {
  const r = 34, circ = 2 * Math.PI * r
  const color = score <= 7 ? '#9CA98C' : score <= 13 ? '#C99A4B' : score <= 17 ? '#BC6B47' : '#A14A35'
  const label = score <= 7 ? 'Light' : score <= 13 ? 'Moderate' : score <= 17 ? 'Strenuous' : 'All out'
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} stroke="#E6DCCB" strokeWidth="6" fill="none" />
        <circle cx="40" cy="40" r={r} stroke={color} strokeWidth="6" fill="none"
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={circ - circ * score / 21} transform="rotate(-90 40 40)" />
        <text x="40" y="37" textAnchor="middle" fontFamily="JetBrains Mono" fill="#352E27" fontSize="17" fontWeight="700">{score}</text>
        <text x="40" y="51" textAnchor="middle" fill="#8C8173" fontSize="9">/21</text>
      </svg>
      <span className="text-[11px] font-semibold" style={{ color }}>{label}</span>
      <span className="text-[10px] text-muted">Strain</span>
    </div>
  )
}

/* ---- Metric chip ---- */
function Chip({ k, v, u, tone = 'neutral' }) {
  const colors = {
    good: 'bg-sage/15 text-sage-deep',
    warn: 'bg-ochre/20 text-[#9c7a2e]',
    low: 'bg-sky/15 text-sky',
    neutral: 'bg-bone text-slate border border-line-soft'
  }
  return (
    <div className={`rounded-lg px-3 py-2 ${colors[tone]}`}>
      <div className="text-[9.5px] uppercase tracking-[.08em] font-semibold opacity-70">{k}</div>
      <div className="font-mono font-bold text-[15px] leading-tight">
        {v ?? '—'}<span className="text-[10px] font-normal opacity-60"> {u}</span>
      </div>
    </div>
  )
}

/* ---- Session card with missed indicator ---- */
function SessionCard({ day, k, done, onDone, onAdjust, onReroute, snap }) {
  if (!day || !k) return null
  const todayISO = getTodayISO()
  const isPast = day.date < todayISO && !isToday(day.date)
  const isMissed = isPast && !done

  return (
    <div className={`card p-4 relative overflow-hidden ${isMissed ? 'border-red-300' : ''}`}>
      {/* colour accent */}
      <span className="absolute inset-y-0 left-0 w-1 rounded-l" style={{ background: isMissed ? '#A14A35' : k.color }} />

      {/* missed banner */}
      {isMissed && (
        <div className="absolute top-0 right-0 bg-red-400/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-bl-lg rounded-tr-xl tracking-wide">
          MISSED
        </div>
      )}

      <div className="flex items-start justify-between gap-2 pl-1">
        <div>
          <span className="pill text-[10px]"
            style={{ background: (isMissed ? '#A14A35' : k.color) + '22', color: isMissed ? '#A14A35' : k.color, border: `1px solid ${(isMissed ? '#A14A35' : k.color)}44` }}>
            {isMissed ? 'Missed · ' : ''}{k.label}
          </span>
          <div className="font-display text-[20px] text-ink mt-1.5 leading-tight">{day.title}</div>
          {day.purpose && <div className="text-[12px] text-muted mt-0.5">{day.purpose}</div>}
        </div>
        <div className="font-mono font-bold text-[28px] leading-none text-ink shrink-0">
          {day.km ?? '—'}<span className="text-[12px] text-muted">{day.km != null ? ' km' : ''}</span>
        </div>
      </div>

      <div className="mt-3 pl-1"><SessionDetail day={day} /></div>

      <div className="flex flex-wrap gap-2 mt-4 pl-1">
        {done ? (
          <span className="inline-flex items-center gap-1.5 text-sage-deep font-semibold text-[13px]">
            <IconCheck className="w-4 h-4" />Logged
          </span>
        ) : isMissed ? (
          <>
            <button className="btn btn-ghost btn-sm text-red-500 border-red-200"
              onClick={onDone}>Mark as done anyway</button>
            <button className="btn btn-ghost btn-sm" onClick={onReroute}>Re-route week</button>
          </>
        ) : (
          <>
            <button className="btn btn-primary btn-sm" onClick={onDone}>
              <IconCheck className="w-3.5 h-3.5" />Mark done
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onAdjust}>Adjust</button>
            <button className="btn btn-ghost btn-sm" onClick={onReroute}>Not feeling it?</button>
          </>
        )}
      </div>
    </div>
  )
}

/* ---- Coach feedback box ---- */
function CoachFeedback({ day, log, setLog, snap, setToast }) {
  const todayISO = getTodayISO()
  const existing = log[day?.date]?.notes || ''
  const [text, setText] = useState(existing)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [error, setError] = useState(null)

  const analyse = async () => {
    if (!text.trim()) { setToast('Add some notes first'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `You are an experienced ultramarathon running coach reviewing a completed session for Mol Willmott, training for a 50K on 12 Sep 2026.

Session planned: ${day?.title || 'Training session'}
Type: ${day?.kind} | Planned: ${day?.km ? day.km + ' km' : 'unspecified'}
Purpose: ${day?.purpose || ''}
Athlete readiness today: ${snap?.readiness ?? 'unknown'}/100 | HRV: ${snap?.hrv ?? 'unknown'} ms | RHR: ${snap?.rhr ?? 'unknown'} bpm

Athlete's feedback: "${text}"

Give a concise coaching response (3-4 sentences). Be direct and specific — reference the session structure, how the effort connects to the 50K goal, and one concrete focus for next time. No bullet points.`
          }]
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'API error')
      setFeedback(data.content?.find(b => b.type === 'text')?.text || 'No response.')
      if (day) setLog(day.date, { notes: text })
    } catch (e) {
      setError(e.message?.includes('401') || e.message?.includes('403')
        ? 'Coach requires an Anthropic API key — add VITE_ANTHROPIC_KEY to Netlify env vars.'
        : 'Could not reach coaching engine. Try again.')
    }
    setLoading(false)
  }

  return (
    <div className="card p-4 mt-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-clay grid place-items-center text-bone shrink-0">
          <IconCoach className="w-4 h-4" />
        </div>
        <div>
          <div className="font-semibold text-[14px] text-ink">How did it go?</div>
          <div className="text-[11px] text-muted">Log notes and get coaching feedback</div>
        </div>
      </div>
      <textarea className="input text-[13px] leading-relaxed" rows="3"
        value={text} onChange={e => setText(e.target.value)}
        placeholder="Paces, how you felt, anything notable…" />
      <div className="flex gap-2 mt-3 flex-wrap">
        <button className="btn btn-ghost btn-sm" onClick={() => { if (day) setLog(day.date, { notes: text }); setToast('Notes saved') }}>
          Save notes
        </button>
        <button className="btn btn-primary btn-sm" onClick={analyse} disabled={loading}>
          {loading ? 'Analysing…' : '✦ Get coaching feedback'}
        </button>
      </div>
      {error && <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-[12px] text-red-700">{error}</div>}
      {feedback && (
        <div className="mt-3 p-3 rounded-xl border-l-2 border-clay bg-bone text-[13px] text-slate leading-relaxed">
          <b className="text-ink block mb-1">Coach</b>{feedback}
        </div>
      )}
    </div>
  )
}

/* ---- Strain calc ---- */
function calcStrain(snap, day) {
  const w = { rest: 0, recovery: 2, easy: 5, aerobic: 7, b2b: 8, long: 10, threshold: 13, tempo: 13, hills: 14, reps: 15, vo2: 16, race: 21 }
  const base = w[day?.kind] ?? 6
  const lf = Math.min((snap?.acute || 200) / 300, 1.2)
  const sf = 1 + ((snap?.stress || 25) - 20) / 200
  return Math.min(21, Math.max(0, Math.round(base * lf * sf)))
}

/* ---- Main ---- */
export function Today({ ctx }) {
  const { plan, isDone, setLog, openModal, setTab, setToast, log } = ctx
  const SNAP = ctx.snap || SNAP_FALLBACK

  // Always compute today dynamically
  const todayISO = getTodayISO()
  const day = findDay(plan, todayISO)
  const week = currentWeek(plan)

  const k = day ? KIND[day.kind] : KIND['rest']
  const done = day ? isDone(day.date) : false
  const strain = calcStrain(SNAP, day)

  // Past missed sessions in current week
  const missedDays = (week?.days || []).filter(d =>
    d.date < todayISO && !isToday(d.date) && !isDone(d.date) && d.kind !== 'rest' && d.km
  )

  const [todayRun, setTodayRun] = useState(null)
  useEffect(() => {
    getRecentActivityDetails(5).then(acts => {
      const found = acts.find(a => a.activity_date === todayISO)
      if (found) setTodayRun(found)
    }).catch(() => {})
  }, [todayISO])

  return (
    <div className="animate-rise space-y-4">
      <div>
        <div className="eyebrow">{week?.label || 'Training'}</div>
        <h1 className="pagetitle mt-0.5">Today's <span className="thin">waypoint</span></h1>
      </div>

      {/* Readiness + strain + vitals */}
      <div className="card p-4">
        <div className="flex items-start justify-around">
          <ReadinessWheel v={SNAP.readiness || 0} />
          <StrainWheel score={strain} />
          <div className="flex flex-col gap-2 pt-1">
            <Chip k="HRV" v={SNAP.hrv} u="ms" tone={SNAP.hrv >= 40 ? 'good' : 'warn'} />
            <Chip k="RHR" v={SNAP.rhr} u="bpm" tone={SNAP.rhr && SNAP.rhr7 && SNAP.rhr <= SNAP.rhr7 ? 'good' : 'warn'} />
            <Chip k="Battery" v={SNAP.battery} u="%" tone={SNAP.battery >= 60 ? 'good' : 'warn'} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-line-soft">
          <Chip k="Sleep" v={SNAP.sleep} u="/100" tone={SNAP.sleep >= 70 ? 'good' : 'warn'} />
          <Chip k="Stress" v={SNAP.stress} u="/100" tone={SNAP.stress <= 35 ? 'good' : 'warn'} />
          <Chip k="SpO₂" v={SNAP.spo2} u="%" tone="good" />
        </div>
      </div>

      {/* Missed sessions alert */}
      {missedDays.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <span className="text-red-500 text-[18px] leading-none mt-0.5">⚠</span>
          <div>
            <div className="font-semibold text-red-700 text-[13px]">
              {missedDays.length} missed session{missedDays.length > 1 ? 's' : ''} this week
            </div>
            <div className="text-[12px] text-red-600 mt-0.5">
              {missedDays.map(d => d.title).join(', ')} — visit Re-route to adjust the week.
            </div>
            <button className="text-[12px] font-semibold text-red-700 underline mt-1.5"
              onClick={() => setTab('reroute')}>Re-route week →</button>
          </div>
        </div>
      )}

      {/* Today's session */}
      {day ? (
        <SessionCard
          day={day} k={k} done={done}
          snap={SNAP}
          onDone={() => { setLog(day.date, { done: true }); setToast('Logged — great work 💪') }}
          onAdjust={() => openModal(day.date)}
          onReroute={() => setTab('reroute')}
        />
      ) : (
        <div className="card p-6 text-center text-muted">
          No session found for today ({todayISO}) — check your plan dates.
        </div>
      )}

      {/* Garmin run card if synced */}
      {todayRun && (
        <div className="card p-4">
          <div className="section-label mb-2">Today's run from Garmin</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Distance', todayRun.distance_km + ' km'],
              ['Avg pace', todayRun.pace_avg + '/km'],
              ['Avg HR', todayRun.avg_hr ? todayRun.avg_hr + ' bpm' : '—'],
              ['Elevation', todayRun.elevation_gain_m ? '+' + todayRun.elevation_gain_m + ' m' : '—'],
              ['Calories', todayRun.calories || '—'],
              ['Cadence', todayRun.avg_cadence ? todayRun.avg_cadence + ' spm' : '—'],
            ].map(([k, v]) => (
              <div key={k} className="bg-bone rounded-lg px-3 py-2">
                <div className="text-[9.5px] uppercase tracking-wide text-muted">{k}</div>
                <div className="font-mono font-bold text-[14px] text-ink mt-0.5">{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coach note */}
      <div className="card p-4 flex gap-3" style={{ background: 'linear-gradient(120deg,#FBF6EE,#F7F0E6)' }}>
        <div className="w-8 h-8 rounded-lg bg-clay grid place-items-center text-bone shrink-0">
          <IconCoach className="w-4 h-4" />
        </div>
        <p className="text-[13px] text-slate leading-relaxed">
          {SNAP.readiness >= 70
            ? `Readiness ${SNAP.readiness} — green light. ${k?.label || 'Today'} session with expected strain ${strain}/21. Run honest to the zone and finish wanting more.`
            : `Readiness ${SNAP.readiness} — take care. Consider dialing back today's effort or swapping to recovery. Your numbers are asking for space.`}
        </p>
      </div>

      {/* Feedback */}
      {day && <CoachFeedback day={day} log={log} setLog={setLog} snap={SNAP} setToast={setToast} />}
    </div>
  )
}
