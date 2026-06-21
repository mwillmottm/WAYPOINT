import { SNAP as SNAP_FALLBACK } from '../../data/snapshot.js'
import { Sparkline, LoadBars } from '../charts.jsx'

function TrendBadge({ dir, label, good = 'down' }) {
  const pos = good === 'down' ? dir === 'down' : dir === 'up'
  const neutral = dir === 'flat' || dir == null
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—'
  const cls = neutral ? 'bg-bone text-muted border border-line-soft'
    : pos ? 'bg-sage/15 text-sage-deep'
    : 'bg-clay/10 text-clay'
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9.5px] font-bold px-2 py-0.5 rounded-full ${cls}`}>
      {arrow}{label ? ' ' + label : ''}
    </span>
  )
}

function KpiCard({ label, value, unit, sub, dir, trendLabel, good }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-[.12em] text-muted font-semibold mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono font-bold text-[26px] text-ink leading-none">{value ?? '—'}</span>
        {unit && <span className="text-[11px] text-muted">{unit}</span>}
      </div>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {dir != null && <TrendBadge dir={dir} label={trendLabel} good={good} />}
        {sub && <span className="text-[11px] text-muted leading-tight">{sub}</span>}
      </div>
    </div>
  )
}

function WellnessChip({ label, value, unit, good }) {
  const ok = value != null && good(value)
  const missing = value == null
  return (
    <div className={`rounded-xl px-3 py-2.5 border ${missing ? 'border-line bg-bone' : ok ? 'bg-sage/10 border-sage/25' : 'bg-ochre/10 border-ochre/25'}`}>
      <div className="text-[9.5px] uppercase tracking-[.08em] text-muted font-semibold">{label}</div>
      <div className="font-mono font-bold text-[17px] text-ink mt-0.5 leading-none">
        {value ?? '—'}<span className="text-[10px] text-muted font-normal"> {unit}</span>
      </div>
    </div>
  )
}

function RaceCard({ label, time, highlight }) {
  return (
    <div className={`rounded-xl px-3.5 py-3 border flex flex-col gap-0.5
      ${highlight ? 'bg-clay text-bone border-clay' : 'bg-bone border-line-soft'}`}>
      <div className={`text-[10px] uppercase tracking-[.1em] font-semibold ${highlight ? 'text-bone/70' : 'text-muted'}`}>{label}</div>
      <div className={`font-mono font-bold text-[19px] leading-tight ${highlight ? 'text-bone' : 'text-ink'}`}>{time || '—'}</div>
    </div>
  )
}

function PaceBar({ pace }) {
  if (!pace) return null
  const [m, s] = pace.split(':').map(Number)
  const sec = m * 60 + (s || 0)
  const pct = Math.max(5, Math.min(100, ((510 - sec) / 210) * 100))
  const color = pct > 65 ? '#7E8C6A' : pct > 35 ? '#C99A4B' : '#BC6B47'
  return (
    <div className="mt-1 h-1 rounded-full bg-line w-14 overflow-hidden">
      <div style={{ width: `${pct}%`, background: color }} className="h-full rounded-full" />
    </div>
  )
}

function HrBadge({ hr, ltHr = 173 }) {
  if (!hr) return <span className="text-muted text-[11px]">—</span>
  const zones = [
    { max: ltHr * 0.78, label: 'Z1', color: '#9CA98C' },
    { max: ltHr * 0.88, label: 'Z2', color: '#B6A06A' },
    { max: ltHr * 0.95, label: 'Z3', color: '#C2703F' },
    { max: ltHr,        label: 'Z4', color: '#BC6B47' },
    { max: 999,         label: 'Z5', color: '#A14A35' },
  ]
  const zone = zones.find(z => hr < z.max) || zones[4]
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: zone.color + '22', color: zone.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: zone.color }} />
      {zone.label} · {hr}
    </span>
  )
}

function EffortBar({ re }) {
  if (re == null) return <span className="text-muted text-[11px]">—</span>
  const color = re >= 70 ? '#A14A35' : re >= 50 ? '#BC6B47' : re >= 30 ? '#C99A4B' : '#9CA98C'
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-1.5 rounded-full bg-line overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${re}%`, background: color }} />
      </div>
      <span className="text-[10px] text-muted font-mono">{re}</span>
    </div>
  )
}

export function Fitness({ ctx }) {
  const SNAP = ctx.snap || SNAP_FALLBACK
  const ltHr = SNAP.ltHr || 173

  const rhrDiff = SNAP.rhr != null && SNAP.rhr7 != null ? SNAP.rhr7 - SNAP.rhr : null
  const rhrDir = rhrDiff == null ? null : rhrDiff > 2 ? 'down' : rhrDiff < -2 ? 'up' : 'flat'

  const hrvDir = SNAP.hrv == null ? null : SNAP.hrv >= 49 ? 'up' : SNAP.hrv >= 40 ? 'flat' : 'down'

  const acwrOk = SNAP.acwr != null && SNAP.acwr >= 0.8 && SNAP.acwr <= 1.3

  return (
    <div className="animate-rise space-y-4">
      <div>
        <div className="eyebrow">Synced from Garmin · {SNAP.syncedAt}</div>
        <h1 className="pagetitle mt-0.5">Fitness <span className="thin">signals</span></h1>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="VO₂ max" value={SNAP.vo2} unit="mL/kg/min"
          dir="flat" trendLabel="stable" good="up"
          sub="Aerobic engine intact" />
        <KpiCard label="Resting HR" value={SNAP.rhr} unit="bpm"
          dir={rhrDir}
          trendLabel={rhrDiff != null ? `${Math.abs(rhrDiff)} vs avg` : null}
          good="down"
          sub={SNAP.rhr7 ? `7-day avg ${SNAP.rhr7} bpm` : 'Lower = better'} />
        <KpiCard label="Threshold HR" value={ltHr} unit="bpm"
          sub="Z3/Z4 boundary — pace anchor" />
        <KpiCard label="ACWR" value={SNAP.acwr}
          dir={acwrOk ? 'flat' : SNAP.acwr < 0.8 ? 'down' : 'up'}
          trendLabel={acwrOk ? 'optimal' : SNAP.acwr < 0.8 ? 'low' : 'high'}
          good="flat"
          sub={SNAP.acwr < 0.8 ? 'Room to build load' : SNAP.acwr > 1.3 ? 'Back off — injury risk' : 'In optimal window'} />
      </div>

      {/* HRV + Load */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="section-label mb-3">HRV overnight</div>
          <div className="flex items-end gap-3 mb-3">
            <div>
              <div className="font-mono font-bold text-[32px] text-ink leading-none">
                {SNAP.hrv ?? '—'}<span className="text-[13px] text-muted font-normal"> ms</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                {hrvDir && <TrendBadge dir={hrvDir} good="up" />}
                <span className="text-[11.5px] text-muted">Baseline 40–49 ms</span>
              </div>
            </div>
            <div className="text-right ml-auto pb-1">
              <div className="text-[10px] text-muted uppercase tracking-wide">Status</div>
              <div className="font-semibold text-sage-deep text-[13px]">{SNAP.hrvStatus || '—'}</div>
            </div>
          </div>
          <Sparkline data={SNAP.hrvTrend} color="#7E8C6A" band={[40, 49]} unit="ms" />
          <p className="text-[11.5px] text-muted mt-2 leading-relaxed">
            {SNAP.hrv == null ? 'Waiting for Garmin sync.'
              : SNAP.hrv >= 49 ? 'Above baseline — body is adapting well. Green light for quality work today.'
              : SNAP.hrv >= 40 ? 'Within your balanced range. Run to plan; check again tomorrow.'
              : 'Below baseline. Prioritise sleep and step back to easy running today.'}
          </p>
        </div>

        <div className="card p-4">
          <div className="section-label mb-3">Training load</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[['Acute 7d', SNAP.acute], ['Chronic 28d', SNAP.chronic], ['Ratio', SNAP.acwr]].map(([k, v]) => (
              <div key={k}>
                <div className="text-[9.5px] uppercase tracking-wide text-muted">{k}</div>
                <div className="font-mono font-bold text-[20px] text-ink">{v ?? '—'}</div>
              </div>
            ))}
          </div>
          <LoadBars acute={SNAP.acute} chronic={SNAP.chronic} band={SNAP.chronicBand} />
          <p className="text-[11.5px] text-muted mt-2 leading-relaxed">
            {SNAP.acwr == null ? 'Waiting for training load data.'
              : SNAP.acwr < 0.8 ? `Ratio ${SNAP.acwr} — safely low. Add 10–15% volume this week to rebuild acute load.`
              : SNAP.acwr > 1.3 ? `Ratio ${SNAP.acwr} — reduce intensity. Risk window for soft tissue.`
              : `Ratio ${SNAP.acwr} — in the green band. Maintain current weekly progression.`}
          </p>
        </div>
      </div>

      {/* Wellness chips */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <WellnessChip label="Sleep" value={SNAP.sleep} unit="/100" good={v => v >= 75} />
        <WellnessChip label="Body battery" value={SNAP.battery} unit="%" good={v => v >= 60} />
        <WellnessChip label="Stress" value={SNAP.stress} unit="/100" good={v => v <= 35} />
        <WellnessChip label="SpO₂" value={SNAP.spo2} unit="%" good={v => v >= 95} />
        <WellnessChip label="RHR 7d avg" value={SNAP.rhr7} unit="bpm" good={v => v <= 60} />
        <WellnessChip label="Recovery" value={SNAP.recoveryHrs} unit="" good={v => v === '1 hr'} />
      </div>

      {/* Race predictions */}
      <div className="card p-4">
        <div className="section-label mb-3">
          Race predictions
          <span className="text-muted normal-case tracking-normal font-normal text-[11px]"> · Garmin fitness model</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <RaceCard label="5K" time={SNAP.preds?.['5K']} />
          <RaceCard label="10K" time={SNAP.preds?.['10K']} />
          <RaceCard label="Half marathon" time={SNAP.preds?.['Half'] || SNAP.preds?.['Half Marathon']} />
          <RaceCard label="Marathon" time={SNAP.preds?.['Marathon']} />
          <RaceCard label="50K · 12 Sep" time={SNAP.preds?.['50K']} highlight />
        </div>
        <p className="text-[11.5px] text-muted mt-3 leading-relaxed">
          The 50K projection is extrapolated from your current aerobic capacity and recent run data.
          Your 5K speed sits right in your interval zone (5:10–5:20/km) — the block converts that
          raw speed into 50K durability through progressive long runs and back-to-back training.
          {SNAP.acwr < 0.8 ? ' ACWR is low — there\'s headroom to build; each week of consistent running tightens this number.' : ''}
        </p>
      </div>

      {/* Recent runs */}
      <div className="card p-4">
        <div className="section-label mb-3">Recent runs</div>
        {(!SNAP.recent || SNAP.recent.length === 0) ? (
          <p className="text-[13px] text-muted text-center py-6">No runs synced yet — will appear after next Garmin sync</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-line-soft text-left">
                  {['Date','Session','Distance','Pace','Effort','Heart rate'].map(h => (
                    <th key={h} className="pb-2 text-[10px] uppercase tracking-[.1em] text-muted font-semibold pr-3 first:pl-1">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {SNAP.recent.map((r, i) => (
                  <tr key={i} className="hover:bg-bone/50 transition">
                    <td className="py-3 pr-3 pl-1 font-mono text-[11px] text-muted whitespace-nowrap">{r.d}</td>
                    <td className="py-3 pr-3 text-[13px] text-ink font-medium">{r.t}</td>
                    <td className="py-3 pr-3 text-right whitespace-nowrap">
                      <span className="font-mono font-bold text-[14px] text-ink">{r.km?.toFixed(2)}</span>
                      <span className="text-[10px] text-muted"> km</span>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="font-mono text-[13px] font-semibold text-clay">{r.pace}<span className="text-muted font-normal text-[10px]">/km</span></div>
                      <PaceBar pace={r.pace} />
                    </td>
                    <td className="py-3 pr-3"><EffortBar re={r.re} /></td>
                    <td className="py-3"><HrBadge hr={r.hr} ltHr={ltHr} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
