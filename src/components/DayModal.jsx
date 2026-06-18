import { useState, useEffect } from 'react'
import { KIND, P } from '../data/plan.js'
import { fmtShort } from '../lib/utils.js'
import { SessionDetail } from './ui.jsx'

const PACE_BY_KIND = {
  easy: P.e, recovery: P.sj, aerobic: P.a, threshold: P.t, tempo: P.t,
  reps: P.k5, vo2: P.i, hills: P.t, long: P.e, b2b: P.e, rest: '—', race: P.goal,
}

export function DayModal({ day, onClose, onSave, onToggleDone, done }) {
  const [kind, setKind] = useState(day.kind)
  const [km, setKm] = useState(day.km ?? '')
  const [title, setTitle] = useState(day.title)
  const [notes, setNotes] = useState(day.notes || '')

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-bone border border-line rounded-xl2 shadow-lift w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto animate-rise">
        <div className="font-display text-[19px] text-ink">Edit {day.dow}</div>
        <div className="text-[13px] text-muted font-mono mb-4">{fmtShort(day.date)} · {day.date}</div>

        <div className="rounded-lg border border-line-soft p-3 mb-4 bg-shell">
          <SessionDetail day={day} compact />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Session type</label>
            <select className="input" value={kind} onChange={(e) => { setKind(e.target.value); }}>
              {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Distance (km)</label>
            <input className="input" type="number" step="0.5" min="0" value={km} onChange={(e) => setKm(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <label className="field-label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="mt-3">
          <label className="field-label">Notes / how it felt</label>
          <textarea className="input" rows="2" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Splits, feel, anything to remember…" />
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button className="btn btn-ghost btn-sm" onClick={() => { onToggleDone(day.date); onClose() }}>
            {done ? 'Mark not done' : 'Mark done'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={() => {
            onSave(day.date, { kind, km: km === '' ? null : +km, title, pace: PACE_BY_KIND[kind], notes })
          }}>Save</button>
        </div>
      </div>
    </div>
  )
}
