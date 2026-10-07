// First-run setup: turn "my last periods started on ..." into logged days. Pure; produces changes, never touches storage.
import { dayNum, isoDay } from './engine/analyze'
import { MAX_PERIOD_DAYS, type Change } from './periodLogging'

export const SETUP_MIN_LEN = 2
export const SETUP_MAX_LEN = 10
export const SETUP_DEFAULT_LEN = 5
export const SETUP_MIN_GAP = 15      // same lower bound the engine uses for a plausible cycle
export const SETUP_MAX_AGE_DAYS = 730 // older than ~2 years is almost certainly a typo in the year

export type SetupResult = { ok: true; starts: number[] } | { ok: false; error: string }

/**
 * `entries` are the raw date strings from the form (blank ones are ignored). Returns the starts as day numbers,
 * oldest first, or a plain-language error. Order of entry does not matter.
 */
export function validateSetup(entries: readonly string[], len: number, today: number): SetupResult {
  if (!Number.isInteger(len) || len < SETUP_MIN_LEN || len > SETUP_MAX_LEN) return { ok: false, error: `Period length must be between ${SETUP_MIN_LEN} and ${SETUP_MAX_LEN} days.` }
  const raw = entries.map((e) => e.trim()).filter(Boolean)
  if (!raw.length) return { ok: false, error: 'Enter the date your most recent period started.' }
  const days: number[] = []
  for (const s of raw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isoDay(dayNum(s)) !== s) return { ok: false, error: `“${s}” is not a valid date.` }
    const d = dayNum(s)
    if (d > today) return { ok: false, error: 'A period start can’t be in the future.' }
    if (today - d > SETUP_MAX_AGE_DAYS) return { ok: false, error: `${s} is more than two years ago. Check the year.` }
    days.push(d)
  }
  days.sort((a, b) => a - b)
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1]) return { ok: false, error: 'Two of these dates are the same.' }
    if (days[i] - days[i - 1] < SETUP_MIN_GAP) return { ok: false, error: `Two of these dates are only ${days[i] - days[i - 1]} days apart. Periods are normally at least ${SETUP_MIN_GAP} days apart; check the dates.` }
  }
  return { ok: true, starts: days }
}

/**
 * Days to log for each start: `len` days from the start. A period that is already over gets its last day marked
 * as ended (`pe`). A period that is still running (its last day would be today or later) is logged only up to today
 * and left open, so the app shows "Period in progress" and offers "Period ended".
 */
export function setupChanges(starts: readonly number[], len: number, today: number): Change[] {
  const out: Change[] = []
  const L = Math.min(len, MAX_PERIOD_DAYS)
  for (const s of starts) {
    const closed = s + L - 1 < today
    const last = Math.min(s + L - 1, today)
    for (let d = s; d <= last; d++) out.push({ date: isoDay(d), next: d === last && closed ? { p: 1, pe: true } : { p: 1 } })
  }
  return out
}
