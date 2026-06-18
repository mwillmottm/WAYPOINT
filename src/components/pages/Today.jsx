import { SNAP } from '../../data/snapshot.js'
import { KIND } from '../../data/plan.js'
import { TODAY_ISO } from '../../data/snapshot.js'
import { findDay, currentWeek } from '../../lib/utils.js'
import { SessionDetail } from '../ui.jsx'
import { IconCheck, IconCoach } from '../icons.jsx'

function Metric({ k, v, u, chip, chipTone }) {
  const tone = { good: 'bg-sage/20 text-sage-deep', low: 'bg-sky/20 text-[#5a7686]', warn: 'bg-ochre/25 text-[#9c7a2e]' }[chipTone]
  return (
    <div className="bg-bone border border-line-soft rounded-lg px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-[.08em] text-muted flex items-center gap-1.5">
        {k} <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${tone}`}>{chip}</span>
      </div>
      <div className="font-mono font-bold text-[17px] mt-1 text-ink">{v}<span className="text-[11px] text-muted font-normal"> {u}</span></div>
    </div>
  )
}

export function Today({ ctx }) {
  const { plan, isDone, setLog, toggleDone, openModal, setTab, setToast } = ctx
  const day = findDay(plan, TODAY_ISO)
  const k = KIND[day.kind]
  const done = isDone(day.date)
  const week = currentWeek(plan)
  const r = 36, circ = 2 * Math.PI * r
  const ring = SNAP.readiness

  return (
    <div className="animate-rise">
      <div className="eyebrow">{week.label} · re-entry from illness</div>
      <h1 className="pagetitle mt-1.5">Today’s <span className="thin">waypoint</span></h1>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 mt-5">
        {/* session */}
        <div className="card p-5 relative overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-1" style={{ background: k.color }} />
          <div className="flex items-start gap-3">
            <div>
              <span className="pill" style={{ background: k.color + '22', color: k.color, border: `1px solid ${k.color}55` }}>{k.label}</span>
              <div className="font-display text-[22px] text-ink mt-2">{day.title}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="font-mono font-bold text-[30px] leading-none text-ink">{day.km ?? '—'}<span className="text-[14px] text-muted">{day.km != null ? ' km' : ''}</span></div>
            </div>
          </div>

          <div className="mt-4"><SessionDetail day={day} /></div>

          <div className="flex flex-wrap gap-2 mt-5">
            {done ? (
              <span className="inline-flex items-center gap-2 text-sage-deep font-semibold text-sm"><IconCheck className="w-[18px] h-[18px]" />Logged — nice work</span>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => { setLog(day.date, { done: true }); setToast('Logged — great work') }}>
                  <IconCheck className="w-[17px] h-[17px]" />Mark done
                </button>
                <button className="btn btn-ghost" onClick={() => openModal(day.date)}>Adjust</button>
                <button className="btn btn-ghost" onClick={() => setTab('reroute')}>Not feeling it?</button>
              </>
            )}
          </div>
        </div>

        {/* readiness */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="font-display text-[16px] text-ink">Readiness</div>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-sage/20 text-sage-deep">Ready to run</span>
          </div>
          <div className="flex items-center gap-4 my-3">
            <svg width="84" height="84" viewBox="0 0 84 84">
              <circle cx="42" cy="42" r={r} stroke="#E6DCCB" strokeWidth="7" fill="none" />
              <circle cx="42" cy="42" r={r} stroke="#7E8C6A" strokeWidth="7" fill="none" strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={circ - circ * ring / 100} transform="rotate(-90 42 42)" />
              <text x="42" y="40" textAnchor="middle" className="font-mono" fill="#352E27" fontSize="19" fontWeight="700">{ring}</text>
              <text x="42" y="55" textAnchor="middle" fill="#8C8173" fontSize="9">/ 100</text>
            </svg>
            <div className="text-[13px] text-slate leading-relaxed">
              Recovery time <b className="text-sage-deep">{SNAP.recoveryHrs}</b> — fully recovered.<br />
              Overnight signals point to <b className="text-sage-deep">green</b> for an easy effort.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Metric k="Resting HR" v={SNAP.rhr} u="bpm" chip={`▼ ${SNAP.rhr7 - SNAP.rhr} vs avg`} chipTone="good" />
            <Metric k="HRV" v={SNAP.hrv} u="ms" chip={SNAP.hrvStatus} chipTone="good" />
            <Metric k="Sleep" v={SNAP.sleep} u="/100" chip="Good" chipTone="good" />
            <Metric k="Body batt." v={SNAP.battery} u="/100" chip="Charged" chipTone="low" />
            <Metric k="Stress" v={SNAP.stress} u="/100" chip="Low" chipTone="good" />
            <Metric k="SpO₂" v={SNAP.spo2} u="%" chip="Normal" chipTone="good" />
          </div>
        </div>
      </div>

      {/* coach note */}
      <div className="card p-5 mt-4 flex gap-4" style={{ background: 'linear-gradient(120deg,#FBF6EE,#F7F0E6)' }}>
        <div className="w-9 h-9 shrink-0 rounded-lg bg-clay grid place-items-center text-bone"><IconCoach className="w-5 h-5" /></div>
        <div>
          <h4 className="font-display text-[15px] text-ink mb-1">Coach’s read on today</h4>
          <p className="text-[13.5px] text-slate leading-relaxed">
            Your overnight numbers are green — HRV has rebalanced and resting HR sits below your 7-day average, so the illness load has cleared.
            But it’s day one back: today reopens the door, it doesn’t push through it. Keep it nasal-breathing easy and finish wanting more.
            The 50K is won by the runs you recover from, not the ones you survive. From Tuesday we light the threshold work back up.
          </p>
        </div>
      </div>
    </div>
  )
}
