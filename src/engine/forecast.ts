// Glue: analyze() (cycle-length + ovulation inputs) + blend.ts (weighting + range) -> the forecast the UI shows.
// The per-user error Track is REBUILT from the logs on every call by replaying each completed cycle, so
// edits, deletions and undo of past logs can never leave stale stored state.
import { analyzeCore, periodStarts, tempsOf, type Days } from './analyze'
import { blend, emptyTrack, halfWidth, recordOutcome, type Track } from './blend'

export interface Forecast {
  /** Predicted next period start as an absolute day number (fractional; round only for display). */
  start: number
  /** Range half-width in days: start +/- halfWidth. */
  halfWidth: number
  /** Weight given to the ovulation-based prediction (0 when ovulation is not confirmed this cycle). */
  weightOv: number
  /** True when ovulation is confirmed in the current cycle (the blend is active). */
  confirmed: boolean
  /** Cycle-length model alone, absolute day number (for "why" / comparison UI). */
  lenStart: number
  /** Ovulation-based start, absolute day number, or null. */
  ovStart: number | null
  /** Cycles after this one (cycle-length model, as analyze() gives them). */
  later: { s: number; w: number }[]
  /** Completed cycles used to judge the two predictors (feeds the on-device accuracy panel). */
  track: Track
  // --- Display-ready fields (whole days), used by the UI ---
  lastStart: number
  cycleDay: number
  periodLen: number
  nextStart: number
  rangeLo: number
  rangeHi: number
  daysUntil: number // < 0 means late
  ovulation: number
  ovulationConfirmed: boolean
  fertileFrom: number
  fertileTo: number
  confidence: 'Learning' | 'High' | 'Medium' | 'Low'
  cyclesUsed: number
  avgCycle: number
  variability: number
  lutealLen: number
  lutealKnown: boolean
}

// Outcome cycles outside this length are missed logs / illness; analyze() already drops them from its mean.
const MIN_LEN = 15
const MAX_LEN = 60

/** Replay every completed cycle: what would the app have shown, and how wrong was it? */
function replay(st: number[], pl: number[], temps: Record<number, number>): Track {
  let track = emptyTrack()
  // j = 0 is skipped on purpose: the first cycle has no earlier cycle to predict from, and the Phase 1 backtest never scored it either.
  for (let j = 1; j + 1 < st.length; j++) {
    const actual = st[j + 1] - st[j]
    if (actual < MIN_LEN || actual > MAX_LEN) continue
    const A = analyzeCore(st.slice(0, j + 1), pl.slice(0, j + 1), temps, st[j + 1] - 1)
    if (A.lenPred === undefined) continue
    const ovPred = A.ovPred ?? null
    track = recordOutcome(track, { actual, lenPred: A.lenPred, ovPred, shown: blend(A.lenPred, ovPred, track).pred })
  }
  return track
}

export function buildTrack(days: Days): Track {
  const { st, pl } = periodStarts(days)
  return replay(st, pl, tempsOf(days))
}

export function forecast(days: Days, today: number): Forecast | null {
  const { st, pl } = periodStarts(days)
  const temps = tempsOf(days)
  const A = analyzeCore(st, pl, temps, today)
  if (A.last === undefined || A.lenPred === undefined || A.lenHw === undefined) return null
  const track = replay(st, pl, temps)
  const ovPred = A.ovPred ?? null
  const b = blend(A.lenPred, ovPred, track)
  const hw = halfWidth(A.lenHw, track)
  const nextStart = A.last + Math.round(b.pred)
  const hwDays = Math.max(1, Math.round(hw))
  const confirmed = ovPred !== null
  const ov = confirmed ? (A.curOv as number) : nextStart - A.lut
  const fw = confirmed ? 0 : Math.min(A.lenHw, 3) // fertile window widens while ovulation is only predicted
  return {
    lastStart: A.last,
    cycleDay: today - A.last + 1,
    periodLen: A.plen,
    nextStart,
    rangeLo: nextStart - hwDays,
    rangeHi: nextStart + hwDays,
    daysUntil: nextStart - today,
    ovulation: ov,
    ovulationConfirmed: confirmed,
    fertileFrom: ov - 5 - fw,
    fertileTo: ov + 1 + fw,
    confidence: A.n < 2 ? 'Learning' : A.sd <= 2.5 ? 'High' : A.sd <= 4.5 ? 'Medium' : 'Low',
    cyclesUsed: A.n,
    avgCycle: A.mu,
    variability: A.sd,
    lutealLen: A.lut,
    lutealKnown: A.lutKnown,
    start: A.last + b.pred,
    halfWidth: hw,
    weightOv: b.weightOv,
    confirmed: ovPred !== null,
    lenStart: A.last + A.lenPred,
    ovStart: ovPred === null ? null : A.last + ovPred,
    later: A.proj.slice(1).map(({ s, w }) => ({ s, w })),
    track,
  }
}
