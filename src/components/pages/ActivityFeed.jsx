import { useState, useEffect } from 'react'
import { getRecentActivityDetails } from '../../lib/api.js'
import { IconMountain, IconClock, IconFuel } from '../icons.jsx'

// ---- helpers ----
const fmtDuration = (sec) => {
  if (!sec) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.round(sec % 60)
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
               : `${m}:${String(s).padStart(2,'0')}`
}

const fmtDate = (iso) => iso
  ? new Date(iso + (iso.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' })
  : '—'

const HR_ZONE_COLORS = ['#9CA98C','#B6A06A','#C2703F','#B05A3C','#A14A35']
const HR_ZONE_NAMES  = ['Z1 Recovery','Z2 Aerobic','Z3 Tempo','Z4 Threshold','Z5 VO₂ max']

const TE_COLORS = {
  AEROBIC_BASE: { bg:'#7E8C6A', label:'Aerobic base' },
  AEROBIC_CAPACITY: { bg:'#C9954F', label:'Aerobic capacity' },
  VO2MAX: { bg:'#A14A35', label:'VO₂ max' },
  ANAEROBIC_CAPACITY: { bg:'#8A3B2E', label:'Anaerobic' },
  RECOVERY: { bg:'#9CA98C', label:'Recovery' },
  BASE: { bg:'#B6A06A', label:'Base' },
}

const INTENSITY_COLOR = {
  WARMUP:'#9CA98C', COOLDOWN:'#9CA98C', ACTIVE:'#C2703F',
  INTERVAL:'#BC6B47', REST:'#7E97A6',
}

function StatChip({ label, value, unit, mono = true }) {
  return (
    <div className="bg-bone border border-line-soft rounded-lg px-3 py-2.5 text-center">
      <div className="text-[10px] uppercase tracking-[.08em] text-muted">{label}</div>
      <div className={`${mono ? 'font-mono font-bold' : 'font-semibold'} text-[17px] mt-0.5 text-ink leading-tight`}>
        {value ?? '—'}<span className="text-[11px] text-muted font-normal">{unit}</span>
      </div>
    </div>
  )
}

function HRZoneBar({ hrZones, totalSec }) {
  if (!hrZones?.length) return null
  const total = hrZones.reduce((s, z) => s + (z.secs_in_zone || 0), 0) || totalSec || 1
  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden gap-px">
        {hrZones.map((z, i) => {
          const pct = ((z.secs_in_zone || 0) / total) * 100
          if (pct < 0.5) return null
          return (
            <div key={i} style={{ width: `${pct}%`, background: HR_ZONE_COLORS[i] || '#9CA98C' }}
              title={`${HR_ZONE_NAMES[i]}: ${Math.round(z.secs_in_zone / 60)} min`} />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {hrZones.map((z, i) => {
          const mins = Math.round((z.secs_in_zone || 0) / 60)
          if (!mins) return null
          return (
            <span key={i} className="inline-flex items-center gap-1.5 text-[11px] text-slate">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: HR_ZONE_COLORS[i] }} />
              {HR_ZONE_NAMES[i]} · {mins} min
            </span>
          )
        })}
      </div>
    </div>
  )
}

function SplitsTable({ laps }) {
  if (!laps?.length) return null
  // filter to meaningful laps only (>200m, show warmup/cooldown/active/interval)
  const meaningful = laps.filter((l) => (l.distance_m || 0) >= 200)
  if (!meaningful.length) return null
  return (
    <div className="overflow-hidden rounded-lg border border-line-soft">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-bone border-b border-line-soft">
            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-muted font-semibold">Lap</th>
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-muted font-semibold">Dist</th>
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-muted font-semibold">Pace</th>
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-muted font-semibold">HR</th>
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-muted font-semibold hidden sm:table-cell">Cad</th>
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-muted font-semibold hidden sm:table-cell">Pwr</th>
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-muted font-semibold hidden md:table-cell">↑</th>
            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-muted font-semibold">Type</th>
          </tr>
        </thead>
        <tbody>
          {meaningful.map((l, i) => {
            const distKm = (l.distance_m / 1000).toFixed(2)
            const ic = INTENSITY_COLOR[l.intensity_type] || '#8C8173'
            return (
              <tr key={i} className="border-b border-line-soft last:border-0 hover:bg-bone/40">
                <td className="px-3 py-2 font-mono text-muted">{l.lap_number}</td>
                <td className="px-3 py-2 font-mono text-right text-ink">{distKm} km</td>
                <td className="px-3 py-2 font-mono font-semibold text-right" style={{ color: ic }}>
                  {l.avg_pace || '—'}
                </td>
                <td className="px-3 py-2 font-mono text-right text-ink">{l.avg_hr ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-right text-muted hidden sm:table-cell">{l.avg_cadence ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-right text-muted hidden sm:table-cell">{l.avg_power_watts ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-right text-muted hidden md:table-cell">{l.elevation_gain_m != null ? `+${l.elevation_gain_m}m` : '—'}</td>
                <td className="px-3 py-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: ic + '22', color: ic }}>
                    {l.intensity_type?.toLowerCase() || '—'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ActivityCard({ act }) {
  const [expanded, setExpanded] = useState(false)
  const te = TE_COLORS[act.training_effect_label] || { bg: '#9CA98C', label: act.training_effect_label || '—' }

  return (
    <div className="card overflow-hidden">
      {/* header row */}
      <button onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left hover:bg-bone/50 transition">
        <div className="w-10 h-10 rounded-xl shrink-0 grid place-items-center text-bone text-[11px] font-bold"
          style={{ background: te.bg }}>{act.aerobic_effect?.toFixed(1) ?? '—'}</div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] text-ink truncate">{act.name}</div>
          <div className="text-[12px] text-muted">{fmtDate(act.activity_date)}</div>
        </div>
        <div className="hidden sm:flex gap-5 shrink-0 text-right">
          <div><div className="font-mono font-bold text-[16px] text-ink">{act.distance_km} <span className="text-[11px] text-muted font-normal">km</span></div>
            <div className="text-[10px] text-muted">distance</div></div>
          <div><div className="font-mono font-bold text-[16px] text-clay">{act.pace_avg}</div>
            <div className="text-[10px] text-muted">avg pace</div></div>
          <div><div className="font-mono font-bold text-[16px] text-ink">{act.avg_hr}</div>
            <div className="text-[10px] text-muted">avg HR</div></div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
          className={`w-4 h-4 text-muted transition shrink-0 ${expanded ? 'rotate-180' : ''}`}>
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* mobile quick stats */}
      <div className="sm:hidden flex gap-4 px-4 pb-3 text-center">
        {[['dist', act.distance_km, ' km'],['pace', act.pace_avg, ''],['HR', act.avg_hr, ' bpm']].map(([l, v, u]) => (
          <div key={l}><div className="font-mono font-bold text-[15px] text-ink">{v ?? '—'}{u}</div>
            <div className="text-[9px] uppercase text-muted">{l}</div></div>
        ))}
      </div>

      {/* expanded detail */}
      {expanded && (
        <div className="border-t border-line bg-sand/30 px-4 sm:px-5 pb-5 pt-4 space-y-4">
          {/* training effect badge + load */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="pill" style={{ background: te.bg + '22', color: te.bg }}>
              {te.label}
            </span>
            {act.training_load && (
              <span className="text-[12px] text-muted">Training load: <b className="text-ink">{Math.round(act.training_load)}</b></span>
            )}
            {act.calories && (
              <span className="text-[12px] text-muted">Calories: <b className="text-ink">{act.calories}</b></span>
            )}
            {act.body_battery_impact && (
              <span className="text-[12px] text-muted">Body battery: <b className="text-rust">{act.body_battery_impact}</b></span>
            )}
          </div>

          {/* stat grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <StatChip label="Duration" value={fmtDuration(act.moving_duration_seconds)} mono />
            <StatChip label="Avg pace" value={act.pace_avg} />
            <StatChip label="Best pace" value={act.pace_best} />
            <StatChip label="Avg HR" value={act.avg_hr} unit=" bpm" />
            <StatChip label="Max HR" value={act.max_hr} unit=" bpm" />
            <StatChip label="Cadence" value={act.avg_cadence} unit=" spm" />
            <StatChip label="Power" value={act.avg_power_watts} unit=" W" />
            <StatChip label="NP" value={act.normalized_power_watts} unit=" W" />
            <StatChip label="Elevation" value={act.elevation_gain_m != null ? `+${act.elevation_gain_m}` : null} unit=" m" />
            <StatChip label="Stride" value={act.avg_stride_cm} unit=" cm" />
            <StatChip label="GCT" value={act.avg_ground_contact_ms} unit=" ms" />
            <StatChip label="Vert osc" value={act.avg_vertical_osc_cm} unit=" cm" />
          </div>

          {/* feel / RPE (if recorded) */}
          {(act.workout_feel || act.workout_rpe) && (
            <div className="flex gap-4 text-[13px]">
              {act.workout_feel && <span className="text-slate">Feel: <b className="text-ink">{act.workout_feel}/100</b></span>}
              {act.workout_rpe  && <span className="text-slate">Effort: <b className="text-ink">{act.workout_rpe}/100</b></span>}
              {act.recovery_hr_bpm && <span className="text-slate">Recovery HR: <b className="text-ink">{act.recovery_hr_bpm} bpm</b></span>}
            </div>
          )}

          {/* HR zone bar */}
          {act.hrZones?.length > 0 && (
            <div>
              <div className="section-label mb-2">Heart rate zones</div>
              <HRZoneBar hrZones={act.hrZones} totalSec={act.moving_duration_seconds} />
            </div>
          )}

          {/* splits table */}
          {act.laps?.length > 0 && (
            <div>
              <div className="section-label mb-2">
                Splits
                <span className="ml-2 text-muted normal-case tracking-normal font-normal text-[11px]">
                  {act.laps.filter((l) => l.distance_m >= 200).length} laps
                </span>
              </div>
              <SplitsTable laps={act.laps} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ActivityFeed({ snap }) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getRecentActivityDetails(7)
      .then((acts) => { setActivities(acts); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="card p-8 text-center text-muted text-[13px]">
      <div className="animate-pulse">Loading activity data…</div>
    </div>
  )

  if (error || !activities.length) {
    // Fall back to the simple recent runs list from the snapshot
    return (
      <div className="card p-5">
        <div className="section-label mb-3">Recent runs</div>
        <div className="divide-y divide-line-soft -my-1">
          {(snap?.recent || []).map((r, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <div className="font-mono text-[11px] text-muted w-14">{r.d}</div>
              <div className="text-[13px] text-ink flex-1 truncate">{r.t}</div>
              <div className="font-mono text-[13px] text-ink">{(+r.km).toFixed(1)} km</div>
              <div className="font-mono text-[12px] text-clay w-14 text-right">{r.pace}</div>
              {r.hr && <div className="font-mono text-[11px] text-muted w-16 text-right">{r.hr} bpm</div>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {activities.map((act) => <ActivityCard key={act.id} act={act} />)}
    </div>
  )
}
