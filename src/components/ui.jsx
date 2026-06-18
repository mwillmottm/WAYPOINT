import { KIND } from '../data/plan.js'
import { IconMountain, IconFuel, IconClock } from './icons.jsx'

export const PHASE_PILL = {
  base: 'bg-sky/15 text-sky',
  build: 'bg-clay/15 text-clay',
  peak: 'bg-rust/15 text-rust',
  deload: 'bg-sage/15 text-sage-deep',
  taper: 'bg-ochre/20 text-[#9c7a2e]',
  race: 'bg-clay text-bone',
}

export function Pill({ kind = 'base', children }) {
  return <span className={`pill ${PHASE_PILL[kind] || PHASE_PILL.base}`}>{children}</span>
}

export function KindDot({ kind }) {
  return <span className="inline-block w-2 h-2 rounded-full" style={{ background: KIND[kind]?.color }} />
}

export function Stat({ k, v, unit, sub, trend, trendColor = 'text-muted' }) {
  return (
    <div className="card p-4 relative">
      {trend && <span className={`absolute top-3.5 right-4 text-[11px] font-mono font-semibold ${trendColor}`}>{trend}</span>}
      <div className="text-[11px] uppercase tracking-[.1em] text-muted">{k}</div>
      <div className="font-mono font-bold text-[26px] mt-1.5 leading-none text-ink">{v}<span className="text-[13px] text-muted">{unit}</span></div>
      {sub && <div className="text-xs text-slate mt-1.5">{sub}</div>}
    </div>
  )
}

// full session breakdown — reused in Plan accordion, Today, and the day modal
export function SessionDetail({ day, compact = false }) {
  const k = KIND[day.kind]
  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-line-soft">
        <table className="w-full text-sm">
          <tbody>
            {day.rows?.map((r, i) => (
              <tr key={i} className="border-b border-line-soft last:border-0">
                <td className="px-3 py-2 text-muted text-[11px] uppercase tracking-wide font-semibold w-[30%] align-top">{r[0]}</td>
                <td className="px-3 py-2 text-ink align-top">{r[1]}</td>
                <td className="px-3 py-2 font-mono text-[12.5px] align-top whitespace-nowrap" style={{ color: k?.color }}>{r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-[12.5px] text-slate">
        {day.elev > 0 && <span className="inline-flex items-center gap-1.5"><IconMountain className="w-4 h-4 text-sage-deep" />{day.elev} m climb (goal)</span>}
        {day.cadence && <span className="inline-flex items-center gap-1.5"><IconClock className="w-4 h-4 text-sky" />{day.cadence}</span>}
        {day.fuel && <span className="inline-flex items-center gap-1.5"><IconFuel className="w-4 h-4 text-clay" />{day.fuel}</span>}
      </div>
      {!compact && day.purpose && (
        <p className="text-[13.5px] text-slate leading-relaxed mt-3 border-l-2 pl-3" style={{ borderColor: k?.color }}>
          <span className="font-semibold text-ink">Why: </span>{day.purpose}
        </p>
      )}
    </div>
  )
}
