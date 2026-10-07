import { describe, expect, it } from 'vitest'
import { barPct, chartBars, computeHistory } from './history'
import { dayNum, isoDay, type Days } from './engine/analyze'

const D0 = dayNum('2026-01-01')
/** period starts at D0 + offsets, each `len` days long */
const mk = (offsets: number[], len = 5): Days => {
  const d: Days = {}
  for (const o of offsets) for (let i = 0; i < len; i++) d[isoDay(D0 + o + i)] = { p: 1 }
  return d
}
const cum = (gaps: number[]) => gaps.reduce<number[]>((a, g) => [...a, a[a.length - 1] + g], [0])

describe('computeHistory', () => {
  it('no periods: empty, no stats', () => {
    expect(computeHistory({}, D0)).toEqual({ rows: [], counted: 0, avgCycle: null, shortest: null, longest: null, avgPeriod: null })
  })
  it('one start: just the current cycle, nothing counted yet', () => {
    const h = computeHistory(mk([0]), D0 + 11)
    expect(h.rows).toHaveLength(1)
    expect(h.rows[0]).toMatchObject({ inProgress: true, length: null, end: null, dayNumber: 12, counted: false })
    expect(h.counted).toBe(0)
    expect(h.avgCycle).toBeNull()
    expect(h.avgPeriod).toBeNull()
  })
  it('rows are newest first, with start, length and period length', () => {
    const h = computeHistory(mk(cum([28, 30, 26])), D0 + 100)
    expect(h.rows.map((r) => r.start - D0)).toEqual([84, 58, 28, 0])
    expect(h.rows.map((r) => r.length)).toEqual([null, 26, 30, 28])
    expect(h.rows.map((r) => r.inProgress)).toEqual([true, false, false, false])
  })
  it('summary uses counted cycles only', () => {
    const h = computeHistory(mk(cum([26, 30, 28])), D0 + 200)
    expect(h.counted).toBe(3)
    expect(h.avgCycle).toBeCloseTo(28, 10)
    expect(h.shortest).toBe(26)
    expect(h.longest).toBe(30)
  })
  it('average period length covers completed cycles only (not the one in progress)', () => {
    const d: Days = { ...mk([0], 4), ...mk([28], 6), ...mk([56], 1) }
    expect(computeHistory(d, D0 + 56).avgPeriod).toBe(5) // (4 + 6) / 2, the 1-day current period is ignored
  })
  it('gaps outside 15-60 days are listed but not counted, and flagged', () => {
    const h = computeHistory(mk(cum([28, 70, 28])), D0 + 300)
    const lens = h.rows.map((r) => [r.length, r.counted])
    expect(lens).toEqual([[null, false], [28, true], [70, false], [28, true]])
    expect(h.rows.find((r) => r.length === 70)!.tag).toEqual({ kind: 'gap' })
    expect(h.counted).toBe(2)
    expect(h.avgCycle).toBe(28)
    expect(computeHistory(mk(cum([10, 28])), D0 + 300).rows.find((r) => r.length === 10)!.tag).toEqual({ kind: 'gap' })
  })
  it('"longer/shorter than usual" tags need 3 counted cycles and a 5+ day difference', () => {
    const two = computeHistory(mk(cum([28, 40])), D0 + 200)
    expect(two.rows.every((r) => r.tag === null)).toBe(true)
    const h = computeHistory(mk(cum([28, 28, 28, 40])), D0 + 300) // avg 31; the 40-day cycle is 9 longer
    expect(h.rows.find((r) => r.length === 40)!.tag).toEqual({ kind: 'longer', days: 9 })
    expect(h.rows.filter((r) => r.length === 28).every((r) => r.tag === null || r.tag.kind === 'shorter')).toBe(true)
    const steady = computeHistory(mk(cum([28, 29, 27, 30])), D0 + 300)
    expect(steady.rows.every((r) => r.tag === null)).toBe(true)
  })
  it('does not mutate its input', () => {
    const d = mk(cum([28, 28]))
    const copy = JSON.parse(JSON.stringify(d))
    computeHistory(d, D0 + 100)
    expect(d).toEqual(copy)
  })
})

describe('chart', () => {
  it('counted cycles only, oldest to newest', () => {
    const h = computeHistory(mk(cum([26, 70, 30, 28])), D0 + 400)
    expect(chartBars(h)).toEqual({ values: [26, 30, 28], top: 30 })
  })
  it('keeps only the latest N bars', () => {
    const h = computeHistory(mk(cum(Array.from({ length: 15 }, (_, i) => 24 + i))), D0 + 900)
    const { values } = chartBars(h, 12)
    expect(values).toHaveLength(12)
    expect(values[values.length - 1]).toBe(24 + 14)
  })
  it('empty history gives an empty chart', () => expect(chartBars(computeHistory({}, D0))).toEqual({ values: [], top: 0 }))
  it('bar heights are honest ratios from zero', () => {
    expect(barPct(30, 30)).toBe(100)
    expect(barPct(15, 30)).toBe(50)
    expect(barPct(28, 30)).toBe(93)
    expect(barPct(5, 0)).toBe(0)
  })
})
