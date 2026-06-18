// Minimal stroke icons. Each takes className for sizing/color.
const S = ({ children, className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>
)

export const IconToday = (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>
export const IconWeek = (p) => <S {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></S>
export const IconPlan = (p) => <S {...p}><path d="M4 18 9 8l4 6 3-4 4 8" /><circle cx="4" cy="18" r="1.2" fill="currentColor" /><circle cx="20" cy="18" r="1.2" fill="currentColor" /></S>
export const IconFitness = (p) => <S {...p}><path d="M3 12h3l2-6 4 14 3-9 2 4h4" /></S>
export const IconZones = (p) => <S {...p}><path d="M4 20h16M4 16h16M4 12h16M4 8h16M4 4h16" /></S>
export const IconCoach = (p) => <S {...p}><path d="M12 3 4 7v5c0 5 3.5 8 8 9 4.5-1 8-4 8-9V7l-8-4Z" /><path d="m9 12 2 2 4-4" /></S>
export const IconReroute = (p) => <S {...p}><path d="M4 7h11a4 4 0 0 1 0 8H8" /><path d="m7 4-3 3 3 3M17 13l3 3-3 3M4 17h6" /></S>
export const IconCheck = (p) => <S {...p}><path d="m5 13 4 4L19 7" /></S>
export const IconChevron = (p) => <S {...p}><path d="m6 9 6 6 6-6" /></S>
export const IconRefresh = (p) => <S {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3M21 4v5h-5" /></S>
export const IconEdit = (p) => <S {...p}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></S>
export const IconMountain = (p) => <S {...p}><path d="m3 20 6-11 4 6 2-3 6 8H3Z" /></S>
export const IconFuel = (p) => <S {...p}><path d="M14 4H6a2 2 0 0 0-2 2v14h12V6a2 2 0 0 0-2-2Z" /><path d="M16 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 1-3 0v-3" /></S>
export const IconClock = (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></S>
