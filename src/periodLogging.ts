// "Start / End" period logging. Pure; produces day changes, never touches storage.
//
// Model: a period is the run of consecutive logged period days (analyze.ts merges runs with a 1-day gap).
// The user taps "started" once, and "ended" once. Ending fills every day from the start through the end day and
// marks the last day with `pe` (period end confirmed). Days AFTER today are never stored: while a period is open,
// the remaining expected days are only shown on the calendar.
import { dayNum, isoDay, periodStarts, type DayRecord, type Days } from './engine/analyze'

export const DEFAULT_PERIOD_LEN = 5
export const MIN_EXPECTED_LEN = 2
export const MAX_EXPECTED_LEN = 10
export const MAX_PERIOD_DAYS = 14   // longest period the app will record via "ended"
export const MAX_ONGOING_DAYS = 10  // stop offering "ended" this many days after a start

export interface Change { date: string; next: DayRecord } // next = {} deletes the day

/** Usual period length: mean of the last 6 completed periods, default 5, clamped to 2-10. */
export function expectedPeriodLength(days: Days, excludeLast: boolean): number {
  const { pl } = periodStarts(days)
  const lens = (excludeLast ? pl.slice(0, -1) : pl).slice(-6)
  if (!lens.length) return DEFAULT_PERIOD_LEN
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length
  return Math.min(MAX_EXPECTED_LEN, Math.max(MIN_EXPECTED_LEN, Math.round(mean)))
}

export interface InProgress {
  start: number
  loggedEnd: number        // last logged period day of this run
  dayNumber: number        // today's day within the period (1 = start day)
  expectedLen: number
  expectedDays: number[]   // unlogged days still expected to be period days (display only, never stored)
}

/** The open period, if the latest run has not been ended and started less than MAX_ONGOING_DAYS ago. */
export function periodInProgress(days: Days, today: number): InProgress | null {
  const { st, pl } = periodStarts(days)
  if (!st.length) return null
  const start = st[st.length - 1]
  const loggedEnd = start + pl[pl.length - 1] - 1
  if (start > today) return null
  if (today - start >= MAX_ONGOING_DAYS) return null
  if (days[isoDay(loggedEnd)]?.pe) return null
  const expectedLen = expectedPeriodLength(days, true)
  const expectedDays: number[] = []
  for (let d = loggedEnd + 1; d <= start + expectedLen - 1; d++) expectedDays.push(d)
  return { start, loggedEnd, dayNumber: today - start + 1, expectedLen, expectedDays }
}

/** Mark `day` as a period day (keeps whatever else was logged that day). */
export function startPeriod(days: Days, day: number): Change[] {
  const date = isoDay(day)
  const cur = days[date] ?? {}
  const next: DayRecord = { ...cur, p: 1 }
  delete next.pe
  return same(cur, next) ? [] : [{ date, next }]
}

export type EndResult = { ok: true; changes: Change[] } | { ok: false; error: string }

/**
 * End the period that started on or before `endDay`: fill start..endDay, mark endDay, and if the run was
 * previously longer, un-mark the days after endDay (their other data is kept).
 */
export function endPeriod(days: Days, endDay: number): EndResult {
  const { st, pl } = periodStarts(days)
  let i = -1
  for (let k = st.length - 1; k >= 0; k--) if (st[k] <= endDay) { i = k; break }
  if (i < 0) return { ok: false, error: 'There is no period start on or before that day.' }
  const start = st[i]
  if (endDay - start + 1 > MAX_PERIOD_DAYS) return { ok: false, error: `A period can be at most ${MAX_PERIOD_DAYS} days long.` }
  const oldEnd = start + pl[i] - 1
  const changes: Change[] = []
  for (let d = start; d <= Math.max(oldEnd, endDay); d++) {
    const date = isoDay(d)
    const cur = days[date] ?? {}
    const next: DayRecord = { ...cur }
    delete next.pe
    if (d <= endDay) next.p = 1
    else { delete next.p; delete next.f }
    if (d === endDay) next.pe = true
    if (!same(cur, next)) changes.push({ date, next })
  }
  return { ok: true, changes }
}

/** Apply changes to a Days map without mutating it (used by tests and previews). */
export function applyChanges(days: Days, changes: Change[]): Days {
  const out: Days = { ...days }
  for (const c of changes) {
    const keep = Object.entries(c.next).filter(([, v]) => v !== undefined && v !== null && v !== false && v !== 0 && v !== '' && !(Array.isArray(v) && v.length === 0))
    if (keep.length) out[c.date] = Object.fromEntries(keep) as DayRecord
    else delete out[c.date]
  }
  return out
}

const norm = (r: DayRecord): string => JSON.stringify(Object.entries(r).filter(([, v]) => v !== undefined && v !== null && v !== false && v !== 0).sort(([a], [b]) => a.localeCompare(b)))
const same = (a: DayRecord, b: DayRecord): boolean => norm(a) === norm(b)

export { dayNum }
