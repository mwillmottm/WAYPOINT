import { useState } from 'react'
import { KIND, weekVolume, weekQuality, weekElev, weekLongest } from '../../data/plan.js'
import { TODAY_ISO } from '../../data/snapshot.js'
import { fmtShort, isToday, weekOfDate } from '../../lib/utils.js'
import { RouteProfile } from '../charts.jsx'
import { SessionDetail, Pill, KindDot } from '../ui.jsx'
import { IconChevron, IconMountain } from '../icons.jsx'

function SessionRow({ d }) {
  const [open, setOpen] = useState(false)
  const k = KIND[d.kind], t = isToday(d.date)
  return (
    <div className={`rounded-lg border ${t ? 'border-clay' : 'border-line-soft'} bg-shell overflow-hidden`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-bone/60 transition">
        <span className="w-1.5 h-9 rounded" style={{ background: k.color }} />
        <div className="w-12 shrink-0">
          <div className="text-[11px] font-bold uppercase text-muted">{d.dow}</div>
          <div className="font-mono text-[10.5px] text-muted">{fmtShort(d.date)}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: k.color }}>{k.label}{t && ' · today'}</div>
          <div className="text-[13.5px] font-semibold text-ink truncate">{d.title}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono font-bold text-[15px] text-ink">{d.km ?? '—'}<span className="text-[10px] text-muted">{d.km != null ? 'km' : ''}</span></div>
          {d.elev > 0 && <div className="font-mono text-[10px] text-sage-deep flex items-center gap-0.5 justify-end"><IconMountain className="w-3 h-3" />{d.elev}m</div>}
        </div>
        <IconChevron className={`w-4 h-4 text-muted transition shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-3.5 pb-4 pt-1 border-t border-line-soft bg-bone/40"><SessionDetail day={d} /></div>}
    </div>
  )
}

function WeekBlock({ w, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const vol = weekVolume(w)
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-4 px-4 sm:px-5 py-4 text-left hover:bg-bone/50 transition">
        <div className="w-11 h-11 rounded-xl grid place-items-center font-mono font-bold text-[15px] shrink-0"
          style={{ background: KIND[w.pill === 'race' ? 'race' : 'long'].color + '18', color: KIND.long.color }}>
          {w.n === 0 ? 'R' : w.n}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-[16px] text-ink">{w.n === 0 ? 'Return week' : `Week ${w.n}`}</span>
            <Pill kind={w.pill}>{w.label}</Pill>
          </div>
          <div className="text-[12.5px] text-muted truncate mt-0.5">{w.note}</div>
        </div>
        <div className="hidden sm:flex gap-5 shrink-0 text-center">
          {[[vol, 'km'], [weekLongest(w), 'long'], [weekQuality(w), 'quality'], [weekElev(w), 'm ↑']].map(([v, l], i) => (
            <div key={i}><div className="font-mono font-bold text-[16px] text-ink">{v}</div><div className="text-[9.5px] uppercase tracking-wide text-muted">{l}</div></div>
          ))}
        </div>
        <IconChevron className={`w-5 h-5 text-muted transition shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-5 pt-1 grid gap-2 border-t border-line bg-sand/40">
          <div className="sm:hidden flex gap-4 py-2 text-center">
            {[[vol, 'km'], [weekLongest(w), 'long'], [weekQuality(w), 'quality'], [weekElev(w), 'm ↑']].map(([v, l], i) => (
              <div key={i}><div className="font-mono font-bold text-[15px] text-ink">{v}</div><div className="text-[9px] uppercase text-muted">{l}</div></div>
            ))}
          </div>
          {w.days.map((d) => <SessionRow key={d.date} d={d} />)}
        </div>
      )}
    </div>
  )
}

export function Plan({ ctx }) {
  const { plan } = ctx
  const curWeek = weekOfDate(plan, TODAY_ISO)
  const curIdx = plan.indexOf(curWeek)
  const totalKm = plan.reduce((s, w) => s + weekVolume(w), 0)
  const peak = Math.max(...plan.map(weekVolume))

  return (
    <div className="animate-rise">
      <div className="eyebrow">12-week threshold-led build · 50K · 12 Sep</div>
      <h1 className="pagetitle mt-1.5">The whole <span className="thin">block</span></h1>
      <p className="text-[14px] text-slate mt-2 max-w-2xl leading-relaxed">
        A threshold and tempo-led build on a deep aerobic base, with weekend back-to-backs for ultra durability.
        Tap any week to expand it, then tap any session to see the full breakdown — paces, intervals, goal climb and the reason it’s there.
      </p>

      <div className="flex gap-6 mt-4 mb-5">
        {[['Total volume', totalKm + ' km'], ['Peak week', peak + ' km'], ['Longest run', '32 km + race'], ['Quality / wk', '2–3']].map(([k, v]) => (
          <div key={k}><div className="font-mono font-bold text-[20px] text-clay">{v}</div><div className="text-[10.5px] uppercase tracking-[.1em] text-muted">{k}</div></div>
        ))}
      </div>

      <div className="card p-4 sm:p-5 mb-5">
        <div className="section-label mb-3">Long-run progression — the canyon line</div>
        <RouteProfile plan={plan} currentIdx={curIdx} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted">
          {[['#7E97A6', 'Base'], ['#BC6B47', 'Build'], ['#A14A35', 'Peak'], ['#C99A4B', 'Taper'], ['#BC6B47', 'Race']].map(([c, l]) => (
            <span key={l} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{l}</span>
          ))}
          <span className="ml-auto">numbers = longest run that week (km)</span>
        </div>
      </div>

      <div className="grid gap-3">
        {plan.map((w) => <WeekBlock key={w.n} w={w} defaultOpen={w === curWeek} />)}
      </div>
    </div>
  )
}
