import { TODAY_ISO, RACE } from '../data/snapshot.js'

export const today = new Date(TODAY_ISO + 'T05:00:00')
export const raceDate = new Date(RACE.date + 'T07:00:00')

export const daysTo = (iso) => Math.round((new Date(iso + 'T07:00:00') - today) / 864e5)
export const daysToRace = Math.round((raceDate - today) / 864e5)

export const fmtShort = (iso) =>
  new Date(iso + 'T05:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })

export const fmtLong = (d = today) =>
  d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })

export const isToday = (iso) => iso === TODAY_ISO

// derived plan readers that respect overrides
export const effDay = (day, overrides) => {
  const o = overrides[day.date]
  return o ? { ...day, ...o } : day
}

export const flatDays = (plan) => plan.flatMap((w) => w.days)
export const findDay = (plan, date) => flatDays(plan).find((d) => d.date === date)
export const weekOfDate = (plan, date) => plan.find((w) => w.days.some((d) => d.date === date))
export const currentWeek = (plan) => weekOfDate(plan, TODAY_ISO) || plan[0]
