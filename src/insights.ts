// Insights: where logged symptoms and mood fall in the cycle. Pure; reads logs only and NEVER feeds the forecast.
//
// Method (kept deliberately simple and conservative):
//  * Only COMPLETED cycles (15-60 days between consecutive period starts) are used, and only the ones where the
//    user logged at least one symptom or mood ("tracked cycles"). Untracked cycles are ignored entirely, so not
//    logging is never read as "no symptoms".
//  * Every day of a tracked cycle belongs to one phase: 'period' (the logged period length), 'pre' (the 5 days
//    before the next period, unless they overlap the period), otherwise 'rest'.
//  * A symptom is reported for the phase where it is most over-represented: share of its logged days in that phase
//    versus that phase's share of tracked-cycle time ("enrichment"). It needs enough days, enough cycles, and
//    enrichment >= MIN_ENRICHMENT and share >= MIN_SHARE, and must appear in that phase in >= MIN_SYMPTOM_CYCLES cycles.
import { periodStarts, dayNum, type Days } from './engine/analyze'
import { SYMPTOMS } from './symptoms'

export const MIN_TRACKED_CYCLES = 2
export const MIN_SYMPTOM_DAYS = 3
export const MIN_SYMPTOM_CYCLES = 2
export const MIN_ENRICHMENT = 2     // at least twice as concentrated as chance
export const MIN_SHARE = 0.4         // and at least 40% of the symptom's logged days must fall in that phase
export const MIN_MOOD_DAYS = 3        // logged mood days a phase needs before its average is shown
export const MOOD_GAP = 0.5           // minimum difference between phase averages to call one "lower"
export const PRE_DAYS = 5
export const MIN_CYCLE = 15
export const MAX_CYCLE = 60

export type Phase = 'period' | 'pre' | 'rest'
export const PHASE_TEXT: Record<Phase, string> = { period: 'during your period', pre: `in the ${PRE_DAYS} days before your period`, rest: 'between periods' }

export interface SymptomInsight {
  key: string; label: string
  days: number              // logged days in tracked cycles
  cycles: number            // tracked cycles it appears in (any phase)
  phase: Phase
  phaseCycles: number       // cycles where it appears in `phase`
  share: number             // fraction of its logged days that fall in `phase`
  expected: number          // fraction of tracked-cycle time that is `phase`
  enrichment: number        // share / expected
}
export interface MoodPhase { phase: Phase; avg: number; days: number }
export interface Insights {
  completedCycles: number
  trackedCycles: number
  ready: boolean            // enough tracked cycles to show anything
  symptoms: SymptomInsight[]       // sorted by enrichment, strongest first
  mood: MoodPhase[]                // phases with enough mood days, in period/pre/rest order
  moodLowest: Phase | null         // set only when the lowest average is clearly (>= MOOD_GAP) below every other shown phase
}

interface Cyc { s: number; e: number; pl: number }

const phaseOf = (offset: number, c: Cyc): Phase => {
  const len = c.e - c.s
  if (offset < c.pl) return 'period'
  if (offset >= len - PRE_DAYS) return 'pre'
  return 'rest'
}
const PHASES: Phase[] = ['period', 'pre', 'rest']

export function computeInsights(days: Days): Insights {
  const { st, pl } = periodStarts(days)
  const completed: Cyc[] = []
  for (let i = 0; i + 1 < st.length; i++) {
    const len = st[i + 1] - st[i]
    if (len >= MIN_CYCLE && len <= MAX_CYCLE) completed.push({ s: st[i], e: st[i + 1], pl: pl[i] })
  }

  // Bucket logged symptom / mood days by completed cycle.
  type Entry = { offset: number; s: string[]; m?: number }
  const byCycle: Entry[][] = completed.map(() => [])
  for (const [iso, r] of Object.entries(days)) {
    const hasS = Array.isArray(r.s) && r.s.length > 0
    if (!hasS && r.m == null) continue
    const n = dayNum(iso)
    const ci = completed.findIndex((c) => n >= c.s && n < c.e)
    if (ci >= 0) byCycle[ci].push({ offset: n - completed[ci].s, s: hasS ? (r.s as string[]) : [], m: r.m ?? undefined })
  }
  const tracked = completed.map((c, i) => ({ c, entries: byCycle[i] })).filter((x) => x.entries.length > 0)

  const out: Insights = { completedCycles: completed.length, trackedCycles: tracked.length, ready: tracked.length >= MIN_TRACKED_CYCLES, symptoms: [], mood: [], moodLowest: null }
  if (!out.ready) return out

  // Time spent in each phase across tracked cycles.
  const phaseDays: Record<Phase, number> = { period: 0, pre: 0, rest: 0 }
  for (const { c } of tracked) {
    const len = c.e - c.s
    const period = Math.min(c.pl, len)
    const pre = len - Math.max(c.pl, len - PRE_DAYS)
    phaseDays.period += period
    phaseDays.pre += pre
    phaseDays.rest += len - period - pre
  }
  const totalDays = phaseDays.period + phaseDays.pre + phaseDays.rest

  // Symptoms.
  for (const def of SYMPTOMS) {
    const perPhase: Record<Phase, number> = { period: 0, pre: 0, rest: 0 }
    const cyclesIn: Record<Phase, number> = { period: 0, pre: 0, rest: 0 }
    let daysTotal = 0, cyclesAny = 0
    for (const { c, entries } of tracked) {
      const seen = new Set<Phase>()
      for (const e of entries) {
        if (!e.s.includes(def.key)) continue
        const ph = phaseOf(e.offset, c)
        perPhase[ph]++; daysTotal++; seen.add(ph)
      }
      if (seen.size) cyclesAny++
      for (const ph of seen) cyclesIn[ph]++
    }
    if (daysTotal < MIN_SYMPTOM_DAYS || cyclesAny < MIN_SYMPTOM_CYCLES) continue
    let best: SymptomInsight | null = null
    for (const ph of PHASES) {
      if (!phaseDays[ph] || cyclesIn[ph] < MIN_SYMPTOM_CYCLES) continue
      const share = perPhase[ph] / daysTotal
      const expected = phaseDays[ph] / totalDays
      const enrichment = share / expected
      if (enrichment >= MIN_ENRICHMENT && share >= MIN_SHARE && (!best || enrichment > best.enrichment)) {
        best = { key: def.key, label: def.label, days: daysTotal, cycles: cyclesAny, phase: ph, phaseCycles: cyclesIn[ph], share, expected, enrichment }
      }
    }
    if (best) out.symptoms.push(best)
  }
  out.symptoms.sort((a, b) => b.enrichment - a.enrichment || a.label.localeCompare(b.label))

  // Mood by phase.
  const mSum: Record<Phase, number> = { period: 0, pre: 0, rest: 0 }
  const mN: Record<Phase, number> = { period: 0, pre: 0, rest: 0 }
  for (const { c, entries } of tracked) for (const e of entries) if (e.m != null) { const ph = phaseOf(e.offset, c); mSum[ph] += e.m; mN[ph]++ }
  out.mood = PHASES.filter((p) => mN[p] >= MIN_MOOD_DAYS).map((p) => ({ phase: p, avg: mSum[p] / mN[p], days: mN[p] }))
  if (out.mood.length >= 2) {
    const sorted = [...out.mood].sort((a, b) => a.avg - b.avg)
    if (sorted[1].avg - sorted[0].avg >= MOOD_GAP) out.moodLowest = sorted[0].phase
  }
  return out
}
