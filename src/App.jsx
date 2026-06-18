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

  const onSync = () => { wp.reload(); wp.setToast('Refreshing from Supabase…') }

  const PAGES = {
    today: <Today ctx={ctx} />,
    week: <Week ctx={ctx} />,
    plan: <Plan ctx={ctx} />,
    fitness: <Fitness ctx={ctx} />,
    zones: <Zones ctx={ctx} />,
    coach: <Coach ctx={ctx} />,
    reroute: <Reroute ctx={ctx} />,
  }

  const modalDay = modalDate ? findDay(wp.plan, modalDate) : null

  return (
    <div className="min-h-screen flex">
      <Sidebar tab={wp.tab} setTab={wp.setTab} />
      <div className="flex-1 min-w-0 flex flex-col pb-20 lg:pb-0">
        <TopBar tab={wp.tab} onSync={onSync} snap={wp.snap} />
        {wp.status === 'offline' && (
          <div className="px-5 sm:px-7 py-2 bg-ochre/[.12] border-b border-ochre/30 text-[12.5px] text-[#9c7a2e] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-ochre" />
            Showing bundled data — couldn’t reach Supabase. Edits are saved locally and will sync when the connection returns.
            <button onClick={wp.reload} className="ml-auto font-semibold underline">Retry</button>
          </div>
        )}
        <main key={wp.tab} className="px-5 sm:px-7 py-6 max-w-[1180px] w-full mx-auto">
          {PAGES[wp.tab]}
        </main>
      </div>
      <MobileNav tab={wp.tab} setTab={wp.setTab} />

      {modalDay && (
        <DayModal
          day={modalDay}
          done={wp.isDone(modalDay.date)}
          onClose={closeModal}
          onToggleDone={wp.toggleDone}
          onSave={(date, patch) => { wp.setOverride(date, patch); closeModal(); wp.setToast('Session updated') }}
        />
      )}

      <Toast msg={wp.toast} />
    </div>
  )
}
