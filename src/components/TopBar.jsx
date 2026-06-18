import { SNAP } from '../data/snapshot.js'
import { daysToRace, fmtLong } from '../lib/utils.js'

const TITLES = {
  today: 'Today', week: 'This week', plan: 'The plan',
  fitness: 'Fitness', zones: 'Zones', coach: 'Coach', reroute: 'Re-route',
}

export function TopBar({ tab, onSync }) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-4 flex-wrap px-5 sm:px-7 py-3.5 bg-sand/85 backdrop-blur border-b border-line">
      <div>
        <div className="font-display font-semibold text-[18px] text-ink leading-tight">{TITLES[tab]}</div>
        <div className="text-[13px] text-muted">{fmtLong()}</div>
      </div>
      <button onClick={onSync}
        className="ml-auto flex items-center gap-2 text-[12px] text-slate border border-line rounded-full px-3 py-1.5 bg-bone hover:border-clay transition">
        <span className="w-2 h-2 rounded-full bg-sage" style={{ boxShadow: '0 0 0 4px rgba(126,140,106,.18)' }} />
        Synced {SNAP.syncedAt.split('·')[0].trim()}
        <span className="text-clay font-semibold">Refresh</span>
      </button>
      <div className="text-right">
        <div className="font-mono font-bold text-[24px] leading-none text-clay">{daysToRace}</div>
        <div className="text-[10px] uppercase tracking-[.13em] text-muted mt-0.5">days to 50K · Sat 12 Sep</div>
      </div>
    </header>
  )
}
