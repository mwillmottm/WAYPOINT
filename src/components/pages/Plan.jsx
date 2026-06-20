import { useState, useEffect } from 'react'
import { KIND, weekVolume, weekQuality, weekElev, weekLongest } from '../../data/plan.js'
import { TODAY_ISO } from '../../data/snapshot.js'
import { fmtShort, isToday, weekOfDate } from '../../lib/utils.js'
import { RouteProfile } from '../charts.jsx'
import { SessionDetail, Pill } from '../ui.jsx'
import { IconChevron, IconMountain, IconCheck } from '../icons.jsx'
import { sbGet } from '../../lib/supabase.js'

/* ---- Completed vs Planned chart ---- */
function ProgressChart({ plan, log }) {
  const relevantWeeks = plan.filter((w, i) => {
    // Show return week + past/current weeks only
    const firstDay = w.days[0]?.date
    return firstDay <= TODAY_ISO || w.n === 0
  }).slice(-8) // last 8 weeks max

  if (relevantWeeks.length < 2) return null

  const planned = relevantWeeks.map(weekVolume)
  const completed = relevantWeeks.map(w => {
    return w.days.reduce((sum, d) => {
      // If marked done, count it; if in the future don't count
      if (d.date > TODAY_ISO) return sum
      const done = log[d.date]?.done
      if (done) return sum + (d.km || 0)
      return sum
    }, 0)
  })

  const maxVal = Math.max(...planned, 10)
  const W = 600, H = 140, pad = { t: 24, b: 32, l: 28, r: 16 }
  const n = relevantWeeks.length
  const barW = Math.floor((W - pad.l - pad.r) / n - 6)
  const X = (i) => pad.l + (W - pad.l - pad.r) * i / (n - 1) - barW / 2
  const Y = (v) => H - pad.b - (H - pad.t - pad.b) * v / maxVal

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 360 }}>
        {/* grid lines */}
        {[25, 50, 75].map(pct => {
          const v = maxVal * pct / 100
          const y = Y(v)
          return (
            <g key={pct}>
              <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="#E6DCCB" strokeWidth="1" />
              <text x={pad.l - 4} y={y + 4} textAnchor="end" fontSize="8" fill="#8C8173" fontFamily="JetBrains Mono">{Math.round(v)}</text>
            </g>
          )
        })}
        {/* bars */}
        {relevantWeeks.map((w, i) => {
          const px = X(i)
          const ph = H - pad.b - Y(planned[i])
          const ch = H - pad.b - Y(completed[i])
          const isCurrent = w.days.some(d => isToday(d.date))
          const isPast = w.days[w.days.length - 1]?.date < TODAY_ISO
          return (
            <g key={i}>
              {/* planned bar (ghost) */}
              <rect x={px} y={Y(planned[i])} width={barW} height={ph}
                rx="3" fill="#BC6B47" opacity="0.15" />
              {/* completed bar */}
              {completed[i] > 0 && (
                <rect x={px} y={Y(completed[i])} width={barW} height={ch}
                  rx="3" fill={isCurrent ? '#BC6B47' : isPast ? '#7E8C6A' : '#C2703F'} opacity="0.85" />
              )}
              {/* week label */}
              <text x={px + barW / 2} y={H - 8} textAnchor="middle" fontSize="8.5"
                fill={isCurrent ? '#BC6B47' : '#8C8173'} fontFamily="JetBrains Mono" fontWeight={isCurrent ? '700' : '400'}>
                {w.n === 0 ? 'R' : w.n}
              </text>
              {/* planned label on top */}
              <text x={px + barW / 2} y={Y(planned[i]) - 4} textAnchor="middle" fontSize="8"
                fill="#8C8173" fontFamily="JetBrains Mono">{planned[i]}</text>
            </g>
          )
        })}
      </svg>
      <div className="flex gap-4 mt-1 text-[10.5px] text-muted">
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-sage opacity-80 inline-block" />Completed km</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-clay opacity-20 inline-block" />Planned km</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-clay inline-block" />Current week</span>
      </div>
    </div>
  )
}

/* ---- Session row (expandable) ---- */
function SessionRow({ d, isDone }) {
  const [open, setOpen] = useState(false)
  const k = KIND[d.kind], t = isToday(d.date), done = isDone?.(d.date)
  return (
    <div className={`rounded-lg border ${t ? 'border-clay' : 'border-line-soft'} bg-shell overflow-hidden`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-bone/60 transition">
        <span className="w-1 h-8 rounded shrink-0" style={{ background: k.color }} />
        <div className="w-10 shrink-0">
          <div className="text-[10px] font-bold uppercase text-muted">{d.dow}</div>
          <div className="font-mono text-[10px] text-muted">{fmtShort(d.date)}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: k.color }}>{k.label}{t && ' · today'}</div>
          <div className="text-[13px] font-semibold text-ink truncate">{d.title}</div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {done && <IconCheck className="w-4 h-4 text-sage-deep" />}
          <div className="text-right">
            <div className="font-mono font-bold text-[14px] text-ink">{d.km ?? '—'}<span className="text-[9px] text-muted">{d.km != null ? 'km' : ''}</span></div>
            {d.elev > 0 && <div className="font-mono text-[9px] text-sage-deep flex items-center gap-0.5 justify-end"><IconMountain className="w-2.5 h-2.5" />{d.elev}m</div>}
          </div>
          <IconChevron className={`w-4 h-4 text-muted transition shrink-0 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && <div className="px-3.5 pb-4 pt-1 border-t border-line-soft bg-bone/40"><SessionDetail day={d} /></div>}
    </div>
  )
}

/* ---- Week block ---- */
function WeekBlock({ w, defaultOpen, isDone }) {
  const [open, setOpen] = useState(defaultOpen)
  const vol = weekVolume(w)
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-bone/50 transition">
        <div className="w-10 h-10 rounded-xl grid place-items-center font-mono font-bold text-[14px] shrink-0"
          style={{ background: 'rgba(124,74,54,.10)', color: '#7C4A36' }}>
          {w.n === 0 ? 'R' : w.n}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-[15px] text-ink">{w.n === 0 ? 'Return week' : `Week ${w.n}`}</span>
            <Pill kind={w.pill}>{w.label}</Pill>
          </div>
          <div className="text-[11.5px] text-muted truncate mt-0.5">{w.note}</div>
        </div>
        <div className="flex gap-3 shrink-0 text-center">
          {[[vol, 'km'], [weekLongest(w), 'long'], [weekQuality(w), 'Q'], [weekElev(w), 'm↑']].map(([v, l], i) => (
            <div key={i} className="hidden sm:block">
              <div className="font-mono font-bold text-[14px] text-ink">{v}</div>
              <div className="text-[9px] uppercase text-muted">{l}</div>
            </div>
          ))}
        </div>
        <IconChevron className={`w-4 h-4 text-muted transition shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 sm:px-4 pb-4 pt-1 space-y-2 border-t border-line bg-sand/40">
          <div className="sm:hidden flex gap-3 py-2 text-center">
            {[[vol,'km'],[weekLongest(w),'long'],[weekQuality(w),'Q'],[weekElev(w),'m↑']].map(([v,l],i)=>(
              <div key={i}><div className="font-mono font-bold text-[13px] text-ink">{v}</div><div className="text-[9px] uppercase text-muted">{l}</div></div>
            ))}
          </div>
          {w.days.map(d => <SessionRow key={d.date} d={d} isDone={isDone} />)}
        </div>
      )}
    </div>
  )
}

/* ---- Plan page ---- */
export function Plan({ ctx }) {
  const { plan, isDone, log } = ctx
  const curWeek = weekOfDate(plan, TODAY_ISO)
  const curIdx = plan.indexOf(curWeek)
  const totalKm = plan.reduce((s, w) => s + weekVolume(w), 0)
  const peak = Math.max(...plan.map(weekVolume))

  // Calculate completed km so far
  const completedKm = plan.reduce((s, w) =>
    s + w.days.reduce((ds, d) => d.date <= TODAY_ISO && log[d.date]?.done ? ds + (d.km || 0) : ds, 0), 0)

  return (
    <div className="animate-rise space-y-4">
      <div>
        <div className="eyebrow">12-week threshold-led build · 50K · 12 Sep</div>
        <h1 className="pagetitle mt-0.5">The <span className="thin">block</span></h1>
      </div>

      {/* summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[['Total planned', totalKm + ' km'], ['Completed', Math.round(completedKm) + ' km'], ['Peak week', peak + ' km'], ['Quality / wk', '2–3']].map(([k, v]) => (
          <div key={k} className="card p-3 text-center">
            <div className="font-mono font-bold text-[20px] text-clay">{v}</div>
            <div className="text-[10px] uppercase tracking-[.1em] text-muted mt-0.5">{k}</div>
          </div>
        ))}
      </div>

      {/* completed vs planned chart */}
      <div className="card p-4">
        <div className="section-label mb-3">Completed vs planned km</div>
        <ProgressChart plan={plan} log={log} />
      </div>

      {/* long run canyon profile */}
      <div className="card p-4">
        <div className="section-label mb-3">Long-run progression</div>
        <RouteProfile plan={plan} currentIdx={curIdx} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10.5px] text-muted">
          {[['#7E97A6','Base'],['#BC6B47','Build'],['#A14A35','Peak'],['#C99A4B','Taper']].map(([c,l])=>(
            <span key={l} className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background:c}}/>{l}</span>
          ))}
        </div>
      </div>

      {/* week blocks */}
      <div className="space-y-3">
        {plan.map(w => <WeekBlock key={w.n} w={w} defaultOpen={w === curWeek} isDone={isDone} />)}
      </div>
    </div>
  )
}
