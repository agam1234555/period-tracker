// Cycle history: one row per cycle, plus plain summary numbers. Pure; reads period dates only.
// Uses the logged cycles as they are (the forecast additionally blends in typical cycles until there are ~6, so its numbers can differ a little).
import { periodStarts, type Days } from './engine/analyze'

export const MIN_CYCLE = 15 // same bounds the engine uses for a plausible cycle
export const MAX_CYCLE = 60
export const TAG_MIN_CYCLES = 3   // no "longer/shorter than usual" tags until this many counted cycles
export const TAG_MIN_DIFF = 5     // days away from your average before a cycle is called longer/shorter
export const CHART_MAX_BARS = 12

export interface CycleRow {
  start: number
  end: number | null        // day number of the NEXT period start; null for the current cycle
  length: number | null     // days from this start to the next start; null for the current cycle
  periodLen: number         // logged period days
  inProgress: boolean       // the current (latest) cycle
  dayNumber: number | null  // today's day within the current cycle
  counted: boolean          // used in averages (completed, 15-60 days)
  tag: { kind: 'longer' | 'shorter'; days: number } | { kind: 'gap' } | null
}

export interface History {
  rows: CycleRow[]          // newest first
  counted: number
  avgCycle: number | null
  shortest: number | null
  longest: number | null
  avgPeriod: number | null  // mean logged period length over completed cycles
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length

export function computeHistory(days: Days, today: number): History {
  const { st, pl } = periodStarts(days)
  const rows: CycleRow[] = st.map((start, i) => {
    const last = i === st.length - 1
    const end = last ? null : st[i + 1]
    const length = end === null ? null : end - start
    return {
      start, end, length, periodLen: pl[i], inProgress: last,
      dayNumber: last ? Math.max(1, today - start + 1) : null,
      counted: length !== null && length >= MIN_CYCLE && length <= MAX_CYCLE,
      tag: null,
    }
  })
  const lens = rows.filter((r) => r.counted).map((r) => r.length as number)
  const avg = lens.length ? mean(lens) : null
  for (const r of rows) {
    if (r.length !== null && !r.counted) r.tag = { kind: 'gap' }
    else if (r.counted && avg !== null && lens.length >= TAG_MIN_CYCLES) {
      const d = Math.round((r.length as number) - avg)
      if (Math.abs(d) >= TAG_MIN_DIFF) r.tag = { kind: d > 0 ? 'longer' : 'shorter', days: Math.abs(d) }
    }
  }
  const completed = rows.filter((r) => !r.inProgress)
  return {
    rows: rows.reverse(),
    counted: lens.length,
    avgCycle: avg,
    shortest: lens.length ? Math.min(...lens) : null,
    longest: lens.length ? Math.max(...lens) : null,
    avgPeriod: completed.length ? mean(completed.map((r) => r.periodLen)) : null,
  }
}

/** Bars for the chart: counted cycles only, oldest to newest, at most the latest `max`. */
export function chartBars(h: History, max = CHART_MAX_BARS): { values: number[]; top: number } {
  const values = h.rows.filter((r) => r.counted).map((r) => r.length as number).reverse().slice(-max)
  return { values, top: values.length ? Math.max(...values) : 0 }
}

/** Bar height as a percentage of the chart. Starts at zero so bar heights are honest ratios. */
export const barPct = (value: number, top: number): number => (top > 0 ? Math.round((value / top) * 100) : 0)
