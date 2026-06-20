// src/components/Sidebar.jsx
import { IconToday, IconWeek, IconPlan, IconFitness, IconZones, IconCoach, IconReroute } from './icons.jsx'

export const NAV = [
  ['today',   'Today',    IconToday],
  ['week',    'Week',     IconWeek],
  ['plan',    'Plan',     IconPlan],
  ['fitness', 'Fitness',  IconFitness],
  ['zones',   'Zones',    IconZones],
  ['coach',   'Coach',    IconCoach],
  ['reroute', 'Re-route', IconReroute],
]

function Mark() {
  return (
    <svg viewBox="0 0 36 36" className="w-7 h-7 shrink-0" fill="none">
      <defs><linearGradient id="bm" x1="0" y1="0" x2="36" y2="36">
        <stop stopColor="#BC6B47" /><stop offset="1" stopColor="#A14A35" />
      </linearGradient></defs>
      <path d="M18 3C11 3 6 8 6 15c0 8 12 18 12 18s12-10 12-18C30 8 25 3 18 3Z" stroke="url(#bm)" strokeWidth="2.2" />
      <circle cx="18" cy="15" r="4.4" fill="url(#bm)" />
    </svg>
  )
}

export function Sidebar({ tab, setTab }) {
  return (
    <aside className="hidden lg:flex flex-col w-[220px] shrink-0 sticky top-0 h-screen border-r border-line bg-bone/70 px-3 py-5">
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <Mark />
        <div>
          <div className="font-display font-semibold tracking-[.12em] text-[16px] text-ink">WAYPOINT</div>
          <div className="text-[9px] tracking-[.18em] uppercase text-muted mt-0.5">Road to 50K</div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition relative
              ${tab === id ? 'bg-clay/10 text-ink' : 'text-slate hover:bg-ink/[.03] hover:text-ink'}`}>
            {tab === id && <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded bg-clay" />}
            <Icon className="w-[17px] h-[17px]" />{label}
          </button>
        ))}
      </nav>
      <div className="mt-auto pt-4 border-t border-line text-[11px] text-muted px-2">
        <span className="text-clay font-semibold">Mol Willmott</span><br />Torquay · Surf Coast VIC
      </div>
    </aside>
  )
}

export function MobileNav({ tab, setTab }) {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-bone/95 backdrop-blur-md border-t border-line
                    flex justify-around mobile-nav-safe pt-1.5">
      {NAV.map(([id, label, Icon]) => (
        <button key={id} onClick={() => setTab(id)}
          className={`flex flex-col items-center gap-0.5 px-1 py-1 text-[9.5px] flex-1 font-medium transition
            ${tab === id ? 'text-clay' : 'text-muted'}`}>
          <Icon className={`w-[22px] h-[22px] transition ${tab === id ? 'scale-110' : ''}`} />
          {label}
        </button>
      ))}
    </nav>
  )
}
