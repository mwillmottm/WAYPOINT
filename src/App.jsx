import { useState, useCallback } from 'react'
import { useWaypoint } from './state/useWaypoint.js'
import { findDay } from './lib/utils.js'
import { Sidebar, MobileNav } from './components/Sidebar.jsx'
import { TopBar } from './components/TopBar.jsx'
import { Toast } from './components/Toast.jsx'
import { DayModal } from './components/DayModal.jsx'
import { Today } from './components/pages/Today.jsx'
import { Week } from './components/pages/Week.jsx'
import { Plan } from './components/pages/Plan.jsx'
import { Fitness } from './components/pages/Fitness.jsx'
import { Zones } from './components/pages/Zones.jsx'
import { Coach } from './components/pages/Coach.jsx'
import { Reroute } from './components/pages/Reroute.jsx'

export default function App() {
  const wp = useWaypoint()
  const [modalDate, setModalDate] = useState(null)

  const openModal = useCallback((date) => setModalDate(date), [])
  const closeModal = useCallback(() => setModalDate(null), [])

  const ctx = { ...wp, openModal }

  const PAGES = {
    today:   <Today   ctx={ctx} />,
    week:    <Week    ctx={ctx} />,
    plan:    <Plan    ctx={ctx} />,
    fitness: <Fitness ctx={ctx} />,
    zones:   <Zones   ctx={ctx} />,
    coach:   <Coach   ctx={ctx} />,
    reroute: <Reroute ctx={ctx} />,
  }

  const modalDay = modalDate ? findDay(wp.plan, modalDate) : null

  return (
    <div className="min-h-dvh flex bg-sand">
      {/* desktop sidebar */}
      <Sidebar tab={wp.tab} setTab={wp.setTab} />

      {/* main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar tab={wp.tab}
          onSync={() => { wp.reload(); wp.setToast('Refreshing from Supabase…') }}
          snap={wp.snap} status={wp.status} />

        {/* offline banner */}
        {wp.status === 'offline' && (
          <div className="px-4 py-2 bg-ochre/10 border-b border-ochre/25 text-[12px] text-[#9c7a2e] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-ochre shrink-0" />
            Showing cached data — Supabase unreachable.
            <button onClick={wp.reload} className="ml-auto font-semibold underline">Retry</button>
          </div>
        )}

        {/* page content — extra bottom padding on mobile for nav */}
        <main key={wp.tab}
          className="flex-1 overflow-y-auto px-4 sm:px-6 pt-4 pb-24 lg:pb-6 max-w-[1160px] w-full mx-auto">
          {PAGES[wp.tab]}
        </main>
      </div>

      {/* mobile bottom nav */}
      <MobileNav tab={wp.tab} setTab={wp.setTab} />

      {/* day edit modal */}
      {modalDay && (
        <DayModal
          day={modalDay}
          done={wp.isDone(modalDay.date)}
          onClose={closeModal}
          onToggleDone={wp.toggleDone}
          onSave={(date, patch) => {
            wp.setOverride(date, patch)
            closeModal()
            wp.setToast('Session updated')
          }}
        />
      )}

      <Toast msg={wp.toast} />
    </div>
  )
}
