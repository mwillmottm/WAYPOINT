import { SNAP } from '../../data/snapshot.js'
import { Stat } from '../ui.jsx'
import { Sparkline, LoadBars, StreamChart } from '../charts.jsx'

export function Fitness({ ctx }) {
  return (
    <div className="animate-rise">
      <div className="eyebrow">Synced from Garmin + Strava · {SNAP.syncedAt}</div>
      <h1 className="pagetitle mt-1.5">Fitness <span className="thin">signals</span></h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <Stat k="VO₂ max" v={SNAP.vo2} sub="Holding steady (42–43)" trend="stable" trendColor="text-muted" />
        <Stat k="Resting HR" v={SNAP.rhr} unit=" bpm" sub={`7-day avg ${SNAP.rhr7}`} trend={`▼ ${SNAP.rhr7 - SNAP.rhr}`} trendColor="text-sage-deep" />
        <Stat k="Threshold HR" v={SNAP.ltHr} unit=" bpm" sub="Anchors your Z3/Z4 line" />
        <Stat k="ACWR" v={SNAP.acwr} sub="Low — room to build" trend="rebuilding" trendColor="text-sky" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <div className="card p-5">
          <div className="section-label mb-1">HRV trend · 22 days</div>
          <p className="text-[12.5px] text-slate mt-2 mb-1">Dipped through the illness (to 40 ms) and has rebalanced back to your norm. Status: <b className="text-sage-deep">{SNAP.hrvStatus}</b>.</p>
          <Sparkline data={SNAP.hrvTrend} color="#7E8C6A" band={[40, 49]} labels={['28 May', '4 Jun', '11 Jun', '18 Jun']} unit="ms" />
        </div>
        <div className="card p-5">
          <div className="section-label mb-1">Training load balance</div>
          <p className="text-[12.5px] text-slate mt-2 mb-1">Chronic load sits inside the optimal band; acute dropped during the lay-off. The build refills acute load safely week by week.</p>
          <LoadBars acute={SNAP.acute} chronic={SNAP.chronic} band={SNAP.chronicBand} />
        </div>
      </div>

      <div className="card p-5 mt-4">
        <div className="section-label mb-1">Last long run · 6 Jun · 8.4 km</div>
        <p className="text-[12.5px] text-slate mt-2 mb-2">Avg HR {SNAP.stream.avgHr} · max {SNAP.stream.maxHr} · {SNAP.stream.avgPace}/km · {SNAP.stream.climb} m climb. Heart rate stayed mostly aerobic, brushing the Z3 line only on the climbs — a good aerobic base to layer threshold onto.</p>
        <StreamChart s={SNAP.stream} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <div className="card p-5">
          <div className="section-label mb-3">Race predictions <span className="text-muted normal-case tracking-normal font-normal">· Garmin model</span></div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(SNAP.preds).map(([k, v]) => (
              <div key={k} className="bg-bone border border-line-soft rounded-lg px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted">{k}</div>
                <div className="font-mono font-bold text-[18px] text-ink">{v}</div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-muted mt-3">Your 5K equivalent lines up with your 5K-pace zone (5:10–5:20) — the engine is real; the block converts it to 50K endurance.</p>
        </div>
        <div className="card p-5">
          <div className="section-label mb-3">Recent runs</div>
          <div className="divide-y divide-line-soft -my-1">
            {SNAP.recent.map((r) => (
              <div key={r.d} className="flex items-center gap-3 py-2">
                <div className="font-mono text-[11px] text-muted w-14">{r.d}</div>
                <div className="text-[13px] text-ink flex-1">{r.t}</div>
                <div className="font-mono text-[13px] text-ink">{r.km.toFixed(1)} km</div>
                <div className="font-mono text-[12px] text-clay w-14 text-right">{r.pace}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
