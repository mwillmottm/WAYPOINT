import { IconCheck } from './icons.jsx'

export function Toast({ msg }) {
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300
      ${msg ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
      <div className="flex items-center gap-2.5 bg-shell border border-clay rounded-xl px-5 py-3 text-sm font-semibold text-ink shadow-lift">
        <IconCheck className="w-[18px] h-[18px] text-clay" />{msg}
      </div>
    </div>
  )
}
