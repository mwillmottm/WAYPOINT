import { KIND, weekVolume, weekQuality, weekElev, isQuality } from '../../data/plan.js'
import { TODAY_ISO } from '../../data/snapshot.js'
import { currentWeek, fmtShort, isToday } from '../../lib/utils.js'
import { IconCheck, IconReroute } from '../icons.jsx'

export function Week({ ctx }) {
  const { plan, isDone, openModal, setTab } = ctx
  const week = currentWeek(plan)
  const planned = weekVolume(week)
  const done = week.days.filter((d) => isDone(d.date) && d.km).reduce((s, d) => s + d.km, 0)

  return (
    <div className="animate-rise">
      <div className="eyebrow">Week {week.n === 0 ? '0 · return' : `${week.n} of 12`} · {week.label} · {fmtShort(week.days[0].date)}</div>
      <h1 className="pagetitle mt-1.5">This <span className="thin">week</span></h1>

      <div className="flex items-center justify-between flex-wrap gap-3 mt-5 mb-4">
        <div className="flex gap-6">
          {[['Planned km', planned], ['Logged km', Math.round(done)], ['Quality days', weekQuality(week)], ['Climb', weekElev(week) + ' m']].map(([k, v]) => (
            <div key={k}><div className="font-mono font-bold text-[21px] text-ink">{v}</div><div className="text-[10.5px] uppercase tracking-[.1em] text-muted">{k}</div></div>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setTab('reroute')}><IconReroute className="w-4 h-4" />Re-route this week</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {week.days.map((d) => {
          const k = KIND[d.kind], t = isToday(d.date), done = isDone(d.date)
          return (
            <button key={d.date} onClick={() => openModal(d.date)}
              className={`text-left card p-3 min-h-[150px] flex flex-col relative transition hover:-translate-y-0.5 hover:shadow-lift
                ${t ? 'ring-2 ring-clay' : ''} ${done ? 'opacity-60' : ''}`}>
              {done
                ? <IconCheck className="absolute top-2.5 right-2.5 w-4 h-4 text-sage-deep" />
                : <span className="absolute top-3 right-3 w-2 h-2 rounded-full" style={{ background: k.color }} />}
              <div className="text-[11px] uppercase tracking-[.1em] text-muted font-semibold">{d.dow}</div>
              <div className="font-mono text-[11px] text-muted mb-2">{fmtShort(d.date)}</div>
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: k.color }}>{k.label}</div>
              <div className="text-[13px] font-semibold mt-1 leading-snug mb-auto text-ink">{d.title}</div>
              <div className="font-mono font-bold text-[16px] mt-2 text-ink">{d.km ?? '—'}<span className="text-[11px] text-muted font-normal">{d.km != null ? ' km' : ''}</span></div>
            </button>
          )
        })}
      </div>

      <div className="card p-4 mt-5 text-[13.5px] text-slate flex gap-3">
        <IconCheck className="w-5 h-5 text-clay shrink-0 mt-0.5" />
        <span><b className="text-ink">Tap any day</b> to see the full session breakdown, change the distance or type, or mark it done. Edits save to the dashboard and reshape the weekly totals automatically.</span>
      </div>
    </div>
  )
}
