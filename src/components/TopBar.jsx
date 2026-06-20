import { SNAP } from '../data/snapshot.js'
import { daysToRace, fmtLong } from '../lib/utils.js'
import { IconRefresh } from './icons.jsx'

const TITLES = {
  today: 'Today', week: 'This week', plan: 'The plan',
  fitness: 'Fitness', zones: 'Zones', coach: 'Coach', reroute: 'Re-route',
}

export function TopBar({ tab, onSync, snap, status }) {
  const syncedAt = (snap || SNAP).syncedAt?.split('·')[0]?.trim() || '—'
  const dotColor = status === 'live' ? '#7E8C6A' : status === 'connecting' ? '#C99A4B' : '#A14A35'

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 py-3
                       bg-sand/90 backdrop-blur-md border-b border-line">
      {/* title */}
      <div className="min-w-0">
        <div className="font-display font-semibold text-[17px] text-ink leading-tight truncate">{TITLES[tab]}</div>
        <div className="text-[11px] text-muted hidden sm:block">{fmtLong()}</div>
      </div>

      {/* spacer */}
      <div className="flex-1" />

      {/* sync button — compact on mobile */}
      <button onClick={onSync}
        className="flex items-center gap-1.5 text-[11.5px] text-slate border border-line rounded-full px-2.5 py-1.5 bg-bone hover:border-clay transition">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
        <span className="hidden sm:inline">{syncedAt}</span>
        <IconRefresh className="w-3 h-3" />
      </button>

      {/* countdown — always visible */}
      <div className="text-right shrink-0">
        <div className="font-mono font-bold text-[20px] sm:text-[22px] leading-none text-clay">{daysToRace}</div>
        <div className="text-[9px] uppercase tracking-[.1em] text-muted">days · 50K</div>
      </div>
    </header>
  )
}
