import { describe, expect, it } from 'vitest'
import { computeInsights, MIN_ENRICHMENT, MIN_SHARE, MIN_TRACKED_CYCLES, symptomDetail } from './insights'
import { dayNum, isoDay, type DayRecord, type Days } from './engine/analyze'

const BASE = dayNum('2026-01-01')
/** `starts` period starts, `len`-day cycles, 5-day periods, plus extra per-day records keyed by (cycle, offset). */
function history(starts: number, len = 28, extra: (c: number, off: number) => DayRecord | null = () => null): Days {
  const d: Days = {}
  for (let c = 0; c < starts; c++) {
    for (let off = 0; off < len; off++) {
      const rec: DayRecord = { ...(off < 5 ? { p: 1 } : {}), ...(extra(c, off) ?? {}) }
      if (Object.keys(rec).length) d[isoDay(BASE + c * len + off)] = rec
    }
  }
  return d
}

describe('readiness', () => {
  it('not ready with fewer than the minimum tracked cycles', () => {
    // 3 starts = 2 completed cycles, but only the first has symptoms logged
    const d = history(3, 28, (c, off) => (c === 0 && off < 2 ? { s: ['cramps'] } : null))
    const r = computeInsights(d)
    expect(r.completedCycles).toBe(2)
    expect(r.trackedCycles).toBe(1)
    expect(r.ready).toBe(false)
    expect(r.symptoms).toEqual([])
  })
  it('no period data at all gives an empty, not-ready result', () => {
    const r = computeInsights({ '2026-01-01': { s: ['cramps'] } })
    expect(r).toMatchObject({ completedCycles: 0, trackedCycles: 0, ready: false })
  })
  it('the current (unfinished) cycle never counts', () => {
    // 3 starts: cycles 0,1 complete; cycle 2 is current. Symptoms only in cycle 2.
    const d = history(3, 28, (c, off) => (c === 2 && off < 2 ? { s: ['cramps'] } : null))
    expect(computeInsights(d).trackedCycles).toBe(0)
  })
  it(`ready at ${MIN_TRACKED_CYCLES} tracked cycles`, () => {
    const d = history(4, 28, (c, off) => (c < 2 && off === 0 ? { m: 3 } : null))
    expect(computeInsights(d).ready).toBe(true)
  })
})

describe('symptom timing', () => {
  // 5 starts => 4 completed 28-day cycles; 5-day period; 'pre' = offsets 23..27.
  const d = history(5, 28, (c, off) => {
    if (c >= 4) return null
    const s: string[] = []
    if (off <= 1) s.push('cramps')                 // only on period days 1-2
    if (off >= 25) s.push('bloating')              // only the last 3 days before the period
    if (off % 4 === 0) s.push('fatigue')           // spread evenly over the cycle
    return s.length ? { s } : null
  })
  const r = computeInsights(d)

  it('finds cramps in the period phase with exact numbers', () => {
    const cramps = r.symptoms.find((x) => x.key === 'cramps')!
    expect(cramps.phase).toBe('period')
    expect(cramps.days).toBe(8)            // 2 days x 4 cycles
    expect(cramps.cycles).toBe(4)
    expect(cramps.phaseCycles).toBe(4)
    expect(cramps.share).toBe(1)
    expect(cramps.expected).toBeCloseTo(20 / 112, 10)   // 5 of 28 days
    expect(cramps.enrichment).toBeCloseTo(112 / 20, 10)
  })
  it('finds bloating in the pre-period phase', () => {
    const b = r.symptoms.find((x) => x.key === 'bloating')!
    expect(b.phase).toBe('pre')
    expect(b.days).toBe(12)
    expect(b.expected).toBeCloseTo(20 / 112, 10)
  })
  it('does not report a symptom spread evenly across the cycle', () => {
    expect(r.symptoms.find((x) => x.key === 'fatigue')).toBeUndefined()
  })
  it('a mild lean is not reported (needs >= MIN_ENRICHMENT and >= MIN_SHARE)', () => {
    // fatigue every 4th day: 2 of 7 days (29%) fall in the period phase, 1.6x chance. Below both bars.
    const f = computeInsights(d)
    expect(MIN_ENRICHMENT).toBe(2)
    expect(MIN_SHARE).toBe(0.4)
    expect(f.symptoms.some((x) => x.key === 'fatigue')).toBe(false)
  })
  it('sorts strongest first', () => {
    const e = r.symptoms.map((x) => x.enrichment)
    expect([...e].sort((a, b) => b - a)).toEqual(e)
  })
})

describe('thresholds', () => {
  it('a symptom seen in only one cycle is not reported, however often', () => {
    const d = history(5, 28, (c, off) => (c === 0 && off < 5 ? { s: ['cramps'] } : c === 1 && off === 10 ? { m: 3 } : c === 2 && off === 10 ? { m: 3 } : null))
    expect(computeInsights(d).symptoms.find((x) => x.key === 'cramps')).toBeUndefined()
  })
  it('a symptom with fewer than 3 logged days is not reported', () => {
    const d = history(5, 28, (c, off) => (c < 2 && off === 0 ? { s: ['cramps'] } : null))
    expect(computeInsights(d).symptoms).toEqual([])
  })
  it('untracked cycles are excluded from the time denominator', () => {
    // Cramps in the first 2 days of cycles 0 and 1 (tracked); cycles 2 and 3 have nothing logged.
    const d = history(5, 28, (c, off) => (c < 2 && off < 2 ? { s: ['cramps'] } : null))
    const r = computeInsights(d)
    expect(r.trackedCycles).toBe(2)
    expect(r.symptoms[0].expected).toBeCloseTo(10 / 56, 10)   // 2 tracked cycles, not 4
  })
  it('cycles outside 15-60 days are ignored', () => {
    // one 70-day gap between starts
    const d: Days = { ...history(3, 28, () => ({ s: ['cramps'] })) }
    d[isoDay(BASE + 56 + 70)] = { p: 1 }
    const r = computeInsights(d)
    expect(r.completedCycles).toBe(2)
  })
})

describe('mood by phase', () => {
  const d = history(5, 28, (c, off) => (c < 4 ? { m: off < 5 ? 2 : off >= 23 ? 3 : 4 } : null))
  const r = computeInsights(d)
  it('averages per phase', () => {
    expect(r.mood).toEqual([
      { phase: 'period', avg: 2, days: 20 },
      { phase: 'pre', avg: 3, days: 20 },
      { phase: 'rest', avg: 4, days: 72 },
    ])
  })
  it('flags the lowest phase only when clearly lower than the others', () => {
    expect(r.moodLowest).toBe('period')
    const flat = computeInsights(history(5, 28, (c, _off) => (c < 4 ? { m: 3 } : null)))
    expect(flat.moodLowest).toBeNull()
  })
  it('a phase with too few mood days is not shown', () => {
    const sparse = computeInsights(history(5, 28, (c, off) => (c < 4 && off === 10 ? { m: 5 } : c < 4 && off === 0 ? { m: 1 } : null)))
    // 4 days each: both shown. Remove one cycle's worth to drop below 3 for 'period'.
    const fewer = computeInsights(history(5, 28, (c, off) => (c < 4 && off === 10 ? { m: 5 } : c === 0 && off === 0 ? { m: 1 } : null)))
    expect(sparse.mood.map((m) => m.phase)).toEqual(['period', 'rest'])
    expect(fewer.mood.map((m) => m.phase)).toEqual(['rest'])
    expect(fewer.moodLowest).toBeNull()
  })
})

describe('purity', () => {
  it('does not mutate its input', () => {
    const d = history(5, 28, (_c, off) => (off < 2 ? { s: ["cramps"], m: 2 } : null))
    const copy = JSON.parse(JSON.stringify(d))
    computeInsights(d)
    expect(d).toEqual(copy)
  })
})

describe('symptomDetail wording', () => {
  it('reads naturally for each phase and rounds percentages', () => {
    expect(symptomDetail({ phase: 'period', share: 0.5, expected: 0.1786, phaseCycles: 2 }))
      .toBe('concentrated during your period. 50% of the days you logged it fall there, versus 18% of the cycle (seen in 2 cycles).')
    expect(symptomDetail({ phase: 'pre', share: 1, expected: 0.1786, phaseCycles: 4 })).toMatch(/^concentrated in the 5 days before your period\. 100%/)
    expect(symptomDetail({ phase: 'rest', share: 0.6, expected: 0.3, phaseCycles: 3 })).toMatch(/^concentrated between periods\./)
  })
  it('has no verb that must agree with the symptom name (Cramps vs Headache)', () => {
    expect(symptomDetail({ phase: 'period', share: 0.5, expected: 0.2, phaseCycles: 2 })).not.toMatch(/\b(is|are|clusters?)\b/)
  })
})
