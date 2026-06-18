import { SNAP as SNAP_FALLBACK } from '../../data/snapshot.js'
import { Stat } from '../ui.jsx'
import { Sparkline, LoadBars, StreamChart } from '../charts.jsx'
import { IconRefresh } from '../icons.jsx'

function SyncStatus({ snap }) {
  const sync = snap?.lastAutoSync
  if (!sync) return null
  const ok = sync.status === 'ok'
  return (
    <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12.5px] mb-4 ${ok ? 'bg-sage/10 text-sage-deep' : 'bg-rust/10 text-rust'}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-sage' : 'bg-rust'}`} />
      {ok
        ? `Auto-sync ran successfully on ${sync.date} — data is live from Garmin`
        : `Last auto-sync on ${sync.date} hit an error: ${sync.error}. Check your GARMIN_EMAIL / GARMIN_PASSWORD env vars in Netlify.`}
    </div>
  )
}

function WeeklyVolumeBars({ recent }) {
  if (!recent?.length) return null
  // group runs into ISO weeks
  const byWeek = {}
  recent.forEach((r) => {
    const d = r.d // "12 Jun" — approx, good enough for display
    const key = d.split(' ')[1] + '-' + d.split(' ')[0]
    byWeek[key] = (byWeek[key] || 0) + r.km
  })
  const entries = Object.entries(byWeek).slice(-6)
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return (
    <div>
      <div className="flex items-end gap-2 h-20">
        {entries.map(([k, v]) => (
          <div key={k} className="flex flex-col items-center gap-1 flex-1">
            <span className="text-[9px] font-mono text-muted">{Math.round(v)}</span>
            <div className="w-full rounded-t" style={{ height: `${(v / max) * 60}px`, background: '#BC6B47', opacity: .75 + .25 * (v / max) }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-1">
        {entries.map(([k]) => (
          <div key={k} className="flex-1 text-center text-[9px] text-muted truncate">{k.split('-')[0]}</div>
        ))}
      </div>
    </div>
  )
}

export function Fitness({ ctx }) {
  const SNAP = ctx.snap || SNAP_FALLBACK
  const { reload, setToast } = ctx

  const onRefresh = () => { reload(); setToast('Refreshing from Supabase…') }

  // build HRV labels from trend length
  const trendLen = SNAP.hrvTrend?.length || 22
  const hrvLabels = ['28 May', '4 Jun', '11 Jun', '18 Jun'].slice(0, Math.ceil(trendLen / 6))

  return (
    <div className="animate-rise">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="eyebrow">Synced from Garmin · {SNAP.syncedAt}</div>
          <h1 className="pagetitle mt-1">Fitness <span className="thin">signals</span></h1>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh}>
          <IconRefresh className="w-4 h-4" />Sync now
        </button>
      </div>

      <SyncStatus snap={SNAP} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
        <Stat k="VO₂ max" v={SNAP.vo2} sub="Stable — building base" trend="stable" />
        <Stat k="Resting HR" v={SNAP.rhr} unit=" bpm" sub={`7-day avg ${SNAP.rhr7}`} trend={`▼ ${(SNAP.rhr7 || 0) - (SNAP.rhr || 0)}`} trendColor="#5F6E4E" />
        <Stat k="Threshold HR" v={SNAP.ltHr} unit=" bpm" sub="Anchors your Z3/Z4 line" />
        <Stat k="ACWR" v={SNAP.acwr} sub="Low — room to build safely" trend="rebuilding" trendColor="#7E97A6" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <div className="card p-5">
          <div className="section-label mb-1">HRV trend</div>
          <p className="text-[12.5px] text-slate mt-2 mb-1">
            Last night: <b className="text-ink">{SNAP.hrv} ms</b> — {SNAP.hrvStatus?.toLowerCase()}. Weekly avg {SNAP.hrvTrend?.slice(-7) ? Math.round(SNAP.hrvTrend.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, SNAP.hrvTrend.length)) : '—'} ms.
          </p>
          {SNAP.hrvTrend?.length > 1 && (
            <Sparkline data={SNAP.hrvTrend} color="#7E8C6A" band={[40, 49]} labels={hrvLabels} unit="ms" />
          )}
        </div>
        <div className="card p-5">
          <div className="section-label mb-1">Training load balance</div>
          <p className="text-[12.5px] text-slate mt-2 mb-1">
            Chronic <b className="text-ink">{SNAP.chronic}</b> (band {SNAP.chronicBand?.[0]}–{SNAP.chronicBand?.[1]}) · Acute <b className="text-ink">{SNAP.acute}</b> · ACWR <b className="text-ink">{SNAP.acwr}</b>.
          </p>
          <LoadBars acute={SNAP.acute} chronic={SNAP.chronic} band={SNAP.chronicBand || [257, 482]} />
        </div>
      </div>

      {SNAP.stream?.dist?.length > 1 && (
        <div className="card p-5 mt-4">
          <div className="section-label mb-1">Last long run · 6 Jun · 8.4 km</div>
          <p className="text-[12.5px] text-slate mt-2 mb-2">
            Avg HR {SNAP.stream.avgHr} · max {SNAP.stream.maxHr} · {SNAP.stream.avgPace}/km · {SNAP.stream.climb} m climb. Heart rate stayed aerobic — good base to layer threshold onto.
          </p>
          <StreamChart s={SNAP.stream} />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <div className="card p-5">
          <div className="section-label mb-3">Race predictions <span className="text-muted normal-case tracking-normal font-normal">· Garmin model</span></div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(SNAP.preds || {}).map(([k, v]) => (
              <div key={k} className="bg-bone border border-line-soft rounded-lg px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted">{k}</div>
                <div className="font-mono font-bold text-[18px] text-ink">{v}</div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-muted mt-3">Your 5K equivalent lines up with your 5K-pace zone — the engine is real; the block converts it to 50K endurance.</p>
        </div>

        <div className="card p-5">
          <div className="section-label mb-3">Recent runs</div>
          <div className="divide-y divide-line-soft -my-1">
            {(SNAP.recent || []).map((r, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <div className="font-mono text-[11px] text-muted w-14">{r.d}</div>
                <div className="text-[13px] text-ink flex-1 truncate">{r.t}</div>
                <div className="font-mono text-[13px] text-ink">{(+r.km).toFixed(1)} km</div>
                <div className="font-mono text-[12px] text-clay w-14 text-right">{r.pace}</div>
                {r.hr && <div className="font-mono text-[11px] text-muted w-14 text-right">{r.hr} bpm</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
