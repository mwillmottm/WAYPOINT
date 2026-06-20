import { KIND, weekVolume, weekQuality, weekElev, isQuality } from '../../data/plan.js'
import { TODAY_ISO } from '../../data/snapshot.js'
import { currentWeek, fmtShort, isToday } from '../../lib/utils.js'
import { IconCheck, IconReroute } from '../icons.jsx'

export function Week({ ctx }) {
  const { plan, isDone, openModal, setTab } = ctx
  const week = currentWeek(plan)
  const planned = weekVolume(week)
  const done = week.days.filter(d => isDone(d.date) && d.km).reduce((s, d) => s + d.km, 0)

  return (
    <div className="animate-rise space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="eyebrow">Week {week.n === 0 ? '0 · return' : `${week.n} of 12`} · {fmtShort(week.days[0].date)}</div>
          <h1 className="pagetitle mt-0.5">This <span className="thin">week</span></h1>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setTab('reroute')}>
          <IconReroute className="w-3.5 h-3.5" /><span className="hidden sm:inline">Re-route</span>
        </button>
      </div>

      {/* weekly totals */}
      <div className="grid grid-cols-4 gap-2">
        {[['Planned', planned + ' km'], ['Done', Math.round(done) + ' km'], ['Quality', weekQuality(week)], ['Climb', weekElev(week) + ' m']].map(([k, v]) => (
          <div key={k} className="card p-3 text-center">
            <div className="font-mono font-bold text-[17px] text-ink">{v}</div>
            <div className="text-[9.5px] uppercase tracking-[.08em] text-muted mt-0.5">{k}</div>
          </div>
        ))}
      </div>

      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {week.days.map((d) => {
          const k = KIND[d.kind], t = isToday(d.date), dn = isDone(d.date)
          return (
            <button key={d.date} onClick={() => openModal(d.date)}
              className={`text-left card p-2 sm:p-3 flex flex-col min-h-[120px] sm:min-h-[150px] relative transition
                active:scale-[.97] hover:-translate-y-0.5 hover:shadow-lift
                ${t ? 'ring-2 ring-clay' : ''} ${dn ? 'opacity-55' : ''}`}>
              {dn
                ? <IconCheck className="absolute top-1.5 right-1.5 w-3 h-3 text-sage-deep" />
                : <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full" style={{ background: k.color }} />}
              <div className="text-[9.5px] uppercase tracking-[.06em] text-muted font-semibold">{d.dow.slice(0,3)}</div>
              <div className="font-mono text-[9px] text-muted">{fmtShort(d.date).split(' ')[0]}</div>
              <div className="text-[9px] font-bold uppercase mt-1" style={{ color: k.color }}>{k.label.split(' ')[0]}</div>
              <div className="text-[11px] font-semibold mt-0.5 leading-snug mb-auto text-ink line-clamp-2">{d.title.replace('Back-to-back —','B2B').replace('Long run —','Long').replace('Recovery shuffle','Recovery').replace('Aerobic medium-long','Aerobic').replace('Easy aerobic','Easy')}</div>
              <div className="font-mono font-bold text-[14px] mt-1 text-ink">
                {d.km ?? '—'}<span className="text-[9px] text-muted font-normal">{d.km != null ? 'k' : ''}</span>
              </div>
            </button>
          )
        })}
      </div>

      <p className="text-[12.5px] text-muted text-center">Tap any day to see the full session or adjust it</p>
    </div>
  )
}
