import { useState } from 'react'
import { LTHR, MAX_HR } from '../../data/zones.js'
import { syncZonesFromGarmin } from '../../lib/zonesFeed.js'
import { IconRefresh, IconEdit, IconCheck } from '../icons.jsx'

export function Zones({ ctx }) {
  const { zones, setZones, setToast } = ctx
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(zones.pace)
  const [syncing, setSyncing] = useState(false)
  const [feedNote, setFeedNote] = useState(null)

  const save = () => {
    setZones({ ...zones, pace: draft, meta: { ...zones.meta, source: 'Manual edit', updated: new Date().toISOString().slice(0, 10) } })
    setEditing(false); setToast('Zones updated')
  }

  const sync = async () => {
    setSyncing(true); setFeedNote(null)
    const res = await syncZonesFromGarmin()
    setSyncing(false)
    if (res.ok) {
      setZones({ pace: res.pace, hr: res.hr || zones.hr, meta: res.meta })
      setDraft(res.pace); setToast('Synced from Garmin')
    } else {
      setFeedNote(res.message)
    }
  }

  const setField = (i, key, val) => setDraft((d) => d.map((z, k) => (k === i ? { ...z, [key]: val } : z)))

  return (
    <div className="animate-rise">
      <div className="eyebrow">Source: {zones.meta.source} · updated {zones.meta.updated}</div>
      <div className="flex items-end justify-between flex-wrap gap-3 mt-1.5">
        <h1 className="pagetitle">Training <span className="thin">zones</span></h1>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={sync} disabled={syncing}>
            <IconRefresh className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Syncing…' : 'Sync from Garmin'}
          </button>
          {editing
            ? <button className="btn btn-primary btn-sm" onClick={save}><IconCheck className="w-4 h-4" />Save</button>
            : <button className="btn btn-ghost btn-sm" onClick={() => { setDraft(zones.pace); setEditing(true) }}><IconEdit className="w-4 h-4" />Edit</button>}
        </div>
      </div>
      <p className="text-[14px] text-slate mt-2 max-w-2xl leading-relaxed">
        These are the paces every session in your plan is built from. Edit them by hand any time, or pull the latest from Garmin with the sync button.
      </p>

      {feedNote && (
        <div className="card p-4 mt-4 border-ochre/50 bg-ochre/[.07] text-[13px] text-slate flex gap-3">
          <span className="text-ochre text-lg leading-none">ⓘ</span><span>{feedNote}</span>
        </div>
      )}

      {/* pace zones */}
      <div className="card overflow-hidden mt-5">
        <div className="px-5 py-3 border-b border-line section-label">Run pace zones <span className="normal-case tracking-normal text-muted font-normal">· per km</span></div>
        <div className="divide-y divide-line-soft">
          {(editing ? draft : zones.pace).map((z, i) => (
            <div key={z.key} className="flex items-center gap-4 px-5 py-3">
              <span className="w-2.5 h-8 rounded shrink-0" style={{ background: z.color }} />
              <div className="w-32 shrink-0">
                <div className="font-semibold text-[14px] text-ink">{z.name}</div>
                <div className="text-[11px] text-muted uppercase tracking-wide">{z.key}</div>
              </div>
              {editing ? (
                <div className="flex items-center gap-2">
                  <input className="input w-20 font-mono text-center py-1.5" value={z.lo} onChange={(e) => setField(i, 'lo', e.target.value)} />
                  <span className="text-muted">to</span>
                  <input className="input w-20 font-mono text-center py-1.5" value={z.hi} onChange={(e) => setField(i, 'hi', e.target.value)} />
                </div>
              ) : (
                <div className="font-mono font-bold text-[18px] shrink-0 w-36" style={{ color: z.color }}>{z.lo}<span className="text-muted text-[13px] font-normal"> – </span>{z.hi}</div>
              )}
              <div className="text-[12.5px] text-slate hidden md:block flex-1">{z.use}</div>
            </div>
          ))}
        </div>
      </div>

      {/* HR zones */}
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4 mt-4">
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-line section-label">Heart-rate zones <span className="normal-case tracking-normal text-muted font-normal">· bpm</span></div>
          <div className="divide-y divide-line-soft">
            {zones.hr.map((z) => (
              <div key={z.z} className="flex items-center gap-4 px-5 py-2.5">
                <span className="font-mono font-bold text-[13px] w-8" style={{ color: z.color }}>{z.z}</span>
                <span className="text-[13px] text-ink w-24">{z.name}</span>
                <div className="flex-1 h-2 rounded-full bg-line overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(Math.min(z.hi, MAX_HR) / MAX_HR) * 100}%`, background: z.color, opacity: .85 }} />
                </div>
                <span className="font-mono text-[13px] text-slate w-24 text-right">{z.lo}–{z.hi === MAX_HR ? MAX_HR + '+' : z.hi}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="section-label mb-3">Anchors</div>
          <div className="space-y-3">
            <div className="flex justify-between items-baseline"><span className="text-[13px] text-slate">Lactate threshold HR</span><span className="font-mono font-bold text-[20px] text-clay">{LTHR}</span></div>
            <div className="flex justify-between items-baseline"><span className="text-[13px] text-slate">Max HR</span><span className="font-mono font-bold text-[20px] text-ink">{MAX_HR}</span></div>
            <p className="text-[12px] text-muted leading-relaxed pt-2 border-t border-line-soft">
              Your threshold runs (5:45–5:55) should sit around <b className="text-ink">{LTHR} bpm</b> — the top of Z3 into Z4. If HR drifts well above that at threshold pace, back off; the pace is a target, the effort is the truth.
            </p>
          </div>
        </div>
      </div>

      <div className="card p-4 mt-4 text-[12.5px] text-muted leading-relaxed">
        <b className="text-ink">How the feed works.</b> The dashboard reads your zones from a bundled snapshot and an optional live endpoint. “Sync from Garmin” calls that endpoint (a small Netlify function, or any URL you set in <span className="font-mono text-clay">VITE_ZONES_FEED_URL</span>); if it isn’t wired up yet it falls back to your saved values and tells you so. See the README for the two-minute setup.
      </div>
    </div>
  )
}
