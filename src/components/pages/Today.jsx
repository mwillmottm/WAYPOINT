import { useState } from 'react'
import { SNAP as SNAP_FALLBACK } from '../../data/snapshot.js'
import { KIND } from '../../data/plan.js'
import { TODAY_ISO } from '../../data/snapshot.js'
import { findDay, currentWeek } from '../../lib/utils.js'
import { SessionDetail } from '../ui.jsx'
import { IconCheck, IconCoach, IconMountain, IconClock } from '../icons.jsx'
import { getRecentActivityDetails } from '../../lib/api.js'
import { useEffect } from 'react'

/* ---- Readiness wheel ---- */
function ReadinessWheel({ snap }) {
  const r = 34, circ = 2 * Math.PI * r, v = snap.readiness || 0
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
function StrainWheel({ score }) {
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
  const colors = { good: 'bg-sage/15 text-sage-deep', warn: 'bg-ochre/20 text-[#9c7a2e]', low: 'bg-sky/15 text-sky', neutral: 'bg-bone text-slate border border-line-soft' }
  return (
    <div className={`rounded-lg px-3 py-2 ${colors[tone]}`}>
      <div className="text-[9.5px] uppercase tracking-[.08em] font-semibold opacity-70">{k}</div>
      <div className="font-mono font-bold text-[15px] leading-tight">{v ?? '—'}<span className="text-[10px] font-normal opacity-60"> {u}</span></div>
    </div>
  )
}

/* ---- Logged run card ---- */
const HR_ZONE_COLORS = ['#9CA98C', '#B6A06A', '#C2703F', '#B05A3C', '#A14A35']
const HR_ZONE_NAMES = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']
const INTENSITY_COLOR = { WARMUP: '#9CA98C', COOLDOWN: '#9CA98C', ACTIVE: '#C2703F', INTERVAL: '#BC6B47', REST: '#7E97A6' }

function LoggedRunCard({ act }) {
  const [expanded, setExpanded] = useState(false)
  const totalSec = act.moving_duration_seconds || 1
  const teLabel = act.training_effect_label?.replace(/_/g, ' ')?.toLowerCase() || 'training'

  return (
    <div className="rounded-xl border border-line bg-bone overflow-hidden">
      {/* header */}
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-shell transition">
        <div className="w-9 h-9 rounded-lg grid place-items-center text-bone text-[13px] font-bold shrink-0"
          style={{ background: '#BC6B47' }}>✓</div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[14px] text-ink truncate">{act.name}</div>
          <div className="text-[11px] text-muted">{teLabel} · {act.activity_date}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono font-bold text-[16px] text-clay">{act.distance_km}<span className="text-[11px] text-muted"> km</span></div>
          <div className="text-[11px] text-muted font-mono">{act.pace_avg}/km</div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
          className={`w-4 h-4 text-muted shrink-0 transition ${expanded ? 'rotate-180' : ''}`}>
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* expanded detail */}
      {expanded && (
        <div className="border-t border-line px-4 pb-4 pt-3 space-y-3 bg-sand/30">
          {/* key stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <Chip k="Avg HR" v={act.avg_hr} u="bpm" />
            <Chip k="Max HR" v={act.max_hr} u="bpm" />
            <Chip k="Cadence" v={act.avg_cadence} u="spm" />
            <Chip k="Elevation" v={act.elevation_gain_m != null ? `+${act.elevation_gain_m}` : null} u="m" />
            <Chip k="Calories" v={act.calories} u="cal" />
            <Chip k="Power" v={act.avg_power_watts} u="W" />
          </div>
          {(act.workout_feel || act.workout_rpe) && (
            <div className="flex gap-3 text-[12px] text-slate">
              {act.workout_feel && <span>Feel: <b className="text-ink">{act.workout_feel}/100</b></span>}
              {act.workout_rpe && <span>Effort: <b className="text-ink">{act.workout_rpe}/100</b></span>}
              {act.recovery_hr_bpm && <span>Recovery HR: <b className="text-ink">{act.recovery_hr_bpm} bpm</b></span>}
            </div>
          )}

          {/* HR zone bar */}
          {act.hrZones?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[.1em] text-muted font-semibold mb-1.5">HR zones</div>
              <div className="flex h-3 rounded-full overflow-hidden gap-px">
                {act.hrZones.map((z, i) => {
                  const pct = ((z.secs_in_zone || 0) / totalSec) * 100
                  return pct > 0.5 ? <div key={i} style={{ width: `${pct}%`, background: HR_ZONE_COLORS[i] }} title={`${HR_ZONE_NAMES[i]}: ${Math.round(z.secs_in_zone / 60)} min`} /> : null
                })}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                {act.hrZones.map((z, i) => {
                  const mins = Math.round((z.secs_in_zone || 0) / 60)
                  return mins > 0 ? <span key={i} className="inline-flex items-center gap-1 text-[10px] text-slate"><span className="w-1.5 h-1.5 rounded-full" style={{ background: HR_ZONE_COLORS[i] }} />{HR_ZONE_NAMES[i]} {mins}m</span> : null
                })}
              </div>
            </div>
          )}

          {/* splits */}
          {act.laps?.filter(l => l.distance_m >= 200).length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[.1em] text-muted font-semibold mb-1.5">Splits</div>
              <div className="overflow-hidden rounded-lg border border-line-soft text-[11.5px]">
                <table className="w-full">
                  <thead><tr className="bg-bone border-b border-line-soft">
                    <th className="px-2 py-1.5 text-left text-muted">Lap</th>
                    <th className="px-2 py-1.5 text-right text-muted">Dist</th>
                    <th className="px-2 py-1.5 text-right text-muted">Pace</th>
                    <th className="px-2 py-1.5 text-right text-muted">HR</th>
                    <th className="px-2 py-1.5 text-right text-muted hidden sm:table-cell">Cad</th>
                    <th className="px-2 py-1.5 text-left text-muted">Type</th>
                  </tr></thead>
                  <tbody>
                    {act.laps.filter(l => l.distance_m >= 200).map((l, i) => {
                      const ic = INTENSITY_COLOR[l.intensity_type] || '#8C8173'
                      return (
                        <tr key={i} className="border-b border-line-soft last:border-0">
                          <td className="px-2 py-1.5 font-mono text-muted">{l.lap_number}</td>
                          <td className="px-2 py-1.5 font-mono text-right">{(l.distance_m / 1000).toFixed(2)}</td>
                          <td className="px-2 py-1.5 font-mono font-semibold text-right" style={{ color: ic }}>{l.avg_pace || '—'}</td>
                          <td className="px-2 py-1.5 font-mono text-right">{l.avg_hr ?? '—'}</td>
                          <td className="px-2 py-1.5 font-mono text-right text-muted hidden sm:table-cell">{l.avg_cadence ?? '—'}</td>
                          <td className="px-2 py-1.5">
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                              style={{ background: ic + '22', color: ic }}>
                              {(l.intensity_type || '').toLowerCase()}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ---- Run feedback ---- */
function RunFeedback({ day, log, setLog, setToast }) {
  const existing = log[day.date]?.notes || ''
  const [text, setText] = useState(existing)
  const [saved, setSaved] = useState(!!existing)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const saveFeedback = () => { setLog(day.date, { notes: text }); setSaved(true); setToast('Notes saved') }

  const analyse = async () => {
    if (!text.trim()) { setToast('Add some notes first'); return }
    setLoading(true)
    try {
      const prompt = `You are an experienced running coach reviewing a completed session.

Session planned: ${day.title}
Type: ${day.kind} | Planned: ${day.km ? day.km + ' km' : 'unspecified'} 
Purpose: ${day.purpose || ''}
Structure: ${day.rows?.map(r => r[0] + ': ' + r[1] + ' @ ' + r[2]).join(' | ') || ''}

Athlete's feedback: "${text}"

Give a concise, warm, direct coaching response (3-4 sentences). Evaluate how it went against what was planned, what it means for training, and one specific focus for next time. No bullet points.`

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
      })
      const data = await res.json()
      setFeedback(data.content?.find(b => b.type === 'text')?.text || 'Could not generate feedback.')
    } catch { setFeedback('Could not reach the coaching engine — notes saved.') }
    setLoading(false)
  }

  return (
    <div className="card p-4 mt-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-clay grid place-items-center text-bone shrink-0"><IconCoach className="w-4 h-4" /></div>
        <div><div className="font-semibold text-[14px] text-ink">How did it go?</div>
          <div className="text-[11px] text-muted">Log notes and get coaching feedback</div></div>
      </div>
      <textarea className="input text-[13px] leading-relaxed" rows="3" value={text}
        onChange={e => { setText(e.target.value); setSaved(false) }}
        placeholder="Paces, how you felt, anything notable..." />
      <div className="flex gap-2 mt-3 flex-wrap">
        <button className="btn btn-ghost btn-sm" onClick={saveFeedback}>
          <IconCheck className="w-3.5 h-3.5" />{saved ? 'Saved ✓' : 'Save notes'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={analyse} disabled={loading}>
          {loading ? 'Analysing…' : '✦ Coaching feedback'}
        </button>
      </div>
      {feedback && (
        <div className="mt-3 p-3 rounded-xl border-l-2 border-clay bg-bone text-[13px] text-slate leading-relaxed">
          <b className="text-ink block mb-1">Coach</b>{feedback}
        </div>
      )}
    </div>
  )
}

/* ---- Main Today page ---- */
function calcStrain(snap, day) {
  const w = { rest:0, recovery:2, easy:5, aerobic:7, b2b:8, long:10, threshold:13, tempo:13, hills:14, reps:15, vo2:16, race:21 }
  const base = w[day?.kind] ?? 6
  const lf = Math.min((snap.acute || 200) / 300, 1.2)
  const sf = 1 + ((snap.stress || 25) - 20) / 200
  return Math.min(21, Math.max(0, Math.round(base * lf * sf)))
}

export function Today({ ctx }) {
  const { plan, isDone, setLog, openModal, setTab, setToast, log, snap: ctxSnap } = ctx
  const SNAP = ctxSnap || SNAP_FALLBACK
  const day = findDay(plan, TODAY_ISO)
  const k = KIND[day.kind]
  const done = isDone(day.date)
  const week = currentWeek(plan)
  const strain = calcStrain(SNAP, day)

  const [todayRun, setTodayRun] = useState(null)

  useEffect(() => {
    getRecentActivityDetails(5).then(acts => {
      const todayAct = acts.find(a => a.activity_date === TODAY_ISO)
      if (todayAct) setTodayRun(todayAct)
    }).catch(() => {})
  }, [])

  return (
    <div className="animate-rise space-y-4">
      <div>
        <div className="eyebrow">{week.label}</div>
        <h1 className="pagetitle mt-0.5">Today's <span className="thin">waypoint</span></h1>
      </div>

      {/* readiness + strain + key vitals — mobile horizontal strip */}
      <div className="card p-4">
        <div className="flex items-start justify-around">
          <ReadinessWheel snap={SNAP} />
          <StrainWheel score={strain} />
          <div className="flex flex-col gap-2 pt-1">
            <Chip k="HRV" v={SNAP.hrv} u="ms" tone={SNAP.hrv >= 40 ? 'good' : 'warn'} />
            <Chip k="RHR" v={SNAP.rhr} u="bpm" tone={SNAP.rhr <= SNAP.rhr7 ? 'good' : 'warn'} />
            <Chip k="Battery" v={SNAP.battery} u="%" tone={SNAP.battery >= 60 ? 'good' : 'warn'} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-line-soft">
          <Chip k="Sleep" v={SNAP.sleep} u="/100" tone={SNAP.sleep >= 70 ? 'good' : 'warn'} />
          <Chip k="Stress" v={SNAP.stress} u="/100" tone={SNAP.stress <= 35 ? 'good' : 'warn'} />
          <Chip k="SpO₂" v={SNAP.spo2} u="%" tone="good" />
        </div>
      </div>

      {/* today's session */}
      <div className="card p-4 relative overflow-hidden">
        <span className="absolute inset-y-0 left-0 w-1 rounded-l" style={{ background: k.color }} />
        <div className="flex items-start justify-between gap-2 pl-1">
          <div>
            <span className="pill text-[10px]" style={{ background: k.color + '22', color: k.color, border: `1px solid ${k.color}44` }}>{k.label}</span>
            <div className="font-display text-[20px] text-ink mt-1.5 leading-tight">{day.title}</div>
          </div>
          <div className="font-mono font-bold text-[28px] leading-none text-ink shrink-0">
            {day.km ?? '—'}<span className="text-[12px] text-muted">{day.km != null ? 'km' : ''}</span>
          </div>
        </div>
        <div className="mt-3 pl-1"><SessionDetail day={day} /></div>
        <div className="flex flex-wrap gap-2 mt-4 pl-1">
          {done
            ? <span className="inline-flex items-center gap-1.5 text-sage-deep font-semibold text-[13px]"><IconCheck className="w-4 h-4" />Logged</span>
            : <>
              <button className="btn btn-primary btn-sm" onClick={() => { setLog(day.date, { done: true }); setToast('Logged — great work 💪') }}>
                <IconCheck className="w-3.5 h-3.5" />Mark done
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => openModal(day.date)}>Adjust</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setTab('reroute')}>Not feeling it?</button>
            </>}
        </div>
      </div>

      {/* today's completed run from Garmin (if synced) */}
      {todayRun && (
        <div>
          <div className="text-[11px] uppercase tracking-[.1em] text-muted font-semibold mb-2">Today's run from Garmin</div>
          <LoggedRunCard act={todayRun} />
        </div>
      )}

      {/* coach note */}
      <div className="card p-4 flex gap-3" style={{ background: 'linear-gradient(120deg,#FBF6EE,#F7F0E6)' }}>
        <div className="w-8 h-8 rounded-lg bg-clay grid place-items-center text-bone shrink-0"><IconCoach className="w-4 h-4" /></div>
        <p className="text-[13px] text-slate leading-relaxed">
          {SNAP.readiness >= 70
            ? `Readiness ${SNAP.readiness} — green light. Today is a ${k.label.toLowerCase()} day with expected strain of ${strain}/21. Run honest to the zone and finish wanting more.`
            : `Readiness ${SNAP.readiness} — moderate. Consider dropping today's effort a notch or swapping to recovery. Your body is telling you something worth listening to.`}
        </p>
      </div>

      {/* run feedback */}
      <RunFeedback day={day} log={log} setLog={setLog} setToast={setToast} />
    </div>
  )
}
