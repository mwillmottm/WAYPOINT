import { useState } from 'react'
import { KIND, P } from '../../data/plan.js'
import { TODAY_ISO } from '../../data/snapshot.js'
import { findDay, currentWeek } from '../../lib/utils.js'
import { IconReroute, IconRefresh } from '../icons.jsx'

export function Reroute({ ctx }) {
  const { plan, setOverride, clearOverride, setTab, setToast } = ctx
  const [done, setDone] = useState(null)
  const week = currentWeek(plan)
  const today = findDay(plan, TODAY_ISO)

  const flash = (msg) => { setDone(msg); setToast(msg); setTimeout(() => setDone(null), 2600) }

  const notFeelingIt = () => {
    setOverride(today.date, { kind: 'recovery', zone: 'sj', km: Math.max(4, Math.round((today.km || 6) * 0.5)),
      title: 'Recovery — downgraded', pace: P.sj,
      rows: [['Run', 'short & easy', P.sj]],
      purpose: 'You flagged low. Downgraded to an easy flush — keep the streak, lose the stress. Re-rack the quality tomorrow if you bounce back.' })
    flash('Today downgraded to recovery')
  }

  const missedDays = () => {
    // protect the long run; trim a mid-week quality day to easy to reabsorb load
    const q = week.days.find((d) => ['threshold', 'tempo', 'vo2', 'reps'].includes(d.kind) && d.date > TODAY_ISO)
    if (q) setOverride(q.date, { kind: 'easy', zone: 'e', title: 'Easy (reflowed)', pace: P.e,
      rows: [['Run', `${q.km || 8} km`, P.e]],
      purpose: 'Reflowed after missed days — we drop one quality session to easy so the week re-absorbs cleanly and the long run stays protected.' })
    flash('Week reflowed — long run protected')
  }

  const moveLong = () => {
    const sat = week.days.find((d) => d.kind === 'long')
    const sun = week.days.find((d) => d.kind === 'b2b')
    if (sat && sun) {
      setOverride(sat.date, { ...sun, title: sun.title, kind: 'b2b' })
      setOverride(sun.date, { ...sat, title: sat.title, kind: 'long' })
    }
    flash('Long run moved to Sunday')
  }

  const resetWeek = () => { week.days.forEach((d) => clearOverride(d.date)); flash('Week reset to plan') }

  const ACTIONS = [
    { t: 'Not feeling it today', d: 'Downgrade today to an easy recovery effort while keeping the habit. Best when readiness is amber or the legs are flat.', btn: 'Downgrade today', fn: notFeelingIt, c: '#7E8C6A' },
    { t: 'I missed a day or two', d: 'Reflow the rest of the week — trim a quality session to easy so load re-absorbs without cramming. Your long run stays put.', btn: 'Reflow week', fn: missedDays, c: '#C9954F' },
    { t: 'Move the long run', d: 'Swap Saturday’s long run with Sunday’s back-to-back when life gets in the way of the weekend.', btn: 'Swap to Sunday', fn: moveLong, c: '#7E97A6' },
    { t: 'Reset this week', d: 'Clear every adjustment and snap the week back to the original plan.', btn: 'Reset week', fn: resetWeek, c: '#A89B88' },
  ]

  return (
    <div className="animate-rise">
      <div className="eyebrow">Adaptive coaching · life happens</div>
      <h1 className="pagetitle mt-1.5">Re-<span className="thin">route</span></h1>
      <p className="text-[14px] text-slate mt-2 max-w-2xl leading-relaxed">
        The plan bends so it doesn’t break. Pick what happened and the week reshapes around it — always protecting the long run and your recovery.
      </p>

      <div className="grid md:grid-cols-2 gap-4 mt-5">
        {ACTIONS.map((a) => (
          <div key={a.t} className="card p-5 relative overflow-hidden flex flex-col">
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: a.c }} />
            <h3 className="font-display text-[17px] text-ink mb-1.5 pl-1">{a.t}</h3>
            <p className="text-[13px] text-slate leading-relaxed pl-1 mb-4 flex-1">{a.d}</p>
            <button className="btn btn-ghost btn-sm self-start ml-1" onClick={a.fn}><IconReroute className="w-4 h-4" />{a.btn}</button>
          </div>
        ))}
      </div>

      {done && <div className="text-center text-sage-deep font-semibold text-sm mt-4">{done} — check the week ↗</div>}

      <div className="card p-5 mt-5">
        <div className="flex items-center gap-2.5 mb-2">
          <IconRefresh className="w-5 h-5 text-clay" />
          <h3 className="font-display text-[16px] text-ink">Keeping it live with Garmin & Strava</h3>
        </div>
        <p className="text-[13.5px] text-slate leading-relaxed">
          Your dashboard was last synced <b className="text-ink">18 Jun, 5:00am</b> from Garmin and Strava. The numbers here — readiness, HRV, load, recent runs and your zones — are pulled from real data.
          A static site can’t poll Garmin on its own, so refreshing happens one of two ways: ask me in chat to re-pull and rebuild your snapshot, or wire the included serverless function so the
          <span className="font-mono text-clay"> Refresh</span> and <span className="font-mono text-clay">Sync from Garmin</span> buttons fetch on their own. The README walks through both — it’s a couple of minutes.
        </p>
        <button className="btn btn-ghost btn-sm mt-3" onClick={() => setTab('zones')}>Go to Zones →</button>
      </div>
    </div>
  )
}
