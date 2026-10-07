import { describe, expect, it } from 'vitest'
import { setupChanges, validateSetup, SETUP_MAX_AGE_DAYS } from './setup'
import { applyChanges, periodInProgress } from './periodLogging'
import { dayNum, isoDay, periodStarts } from './engine/analyze'
import { forecast } from './engine/forecast'

const TODAY = dayNum('2026-10-08')
const iso = (offset: number) => isoDay(TODAY + offset)
const ok = (r: ReturnType<typeof validateSetup>) => { if (!r.ok) throw new Error(r.error); return r.starts }
const err = (r: ReturnType<typeof validateSetup>) => { expect(r.ok).toBe(false); return r.ok ? '' : r.error }

describe('validateSetup', () => {
  it('needs at least one date', () => {
    expect(err(validateSetup([], 5, TODAY))).toMatch(/most recent period/)
    expect(err(validateSetup(['', '  '], 5, TODAY))).toMatch(/most recent period/)
  })
  it('accepts one to three dates in any order and returns them oldest first', () => {
    expect(ok(validateSetup([iso(-5)], 5, TODAY))).toEqual([TODAY - 5])
    expect(ok(validateSetup([iso(-5), iso(-61), iso(-33)], 5, TODAY))).toEqual([TODAY - 61, TODAY - 33, TODAY - 5])
    expect(ok(validateSetup([iso(-5), '', iso(-33)], 5, TODAY))).toEqual([TODAY - 33, TODAY - 5])
  })
  it('a start today is allowed, tomorrow is not', () => {
    expect(ok(validateSetup([iso(0)], 5, TODAY))).toEqual([TODAY])
    expect(err(validateSetup([iso(1)], 5, TODAY))).toMatch(/future/)
  })
  it('rejects invalid dates, including impossible ones', () => {
    for (const s of ['2026-02-30', '2026-13-01', 'yesterday', '10/08/2026']) expect(err(validateSetup([s], 5, TODAY))).toMatch(/not a valid date/)
  })
  it('rejects dates over two years old (likely a typo)', () => {
    expect(ok(validateSetup([iso(-SETUP_MAX_AGE_DAYS)], 5, TODAY))).toHaveLength(1)
    expect(err(validateSetup([iso(-SETUP_MAX_AGE_DAYS - 1)], 5, TODAY))).toMatch(/two years/)
  })
  it('rejects duplicates and starts closer than 15 days', () => {
    expect(err(validateSetup([iso(-30), iso(-30)], 5, TODAY))).toMatch(/same/)
    expect(err(validateSetup([iso(-40), iso(-26)], 5, TODAY))).toMatch(/only 14 days apart/)
    expect(ok(validateSetup([iso(-40), iso(-25)], 5, TODAY))).toHaveLength(2)
  })
  it('period length must be a whole number from 2 to 10', () => {
    for (const l of [1, 11, 2.5, NaN]) expect(err(validateSetup([iso(-5)], l, TODAY))).toMatch(/between 2 and 10/)
    for (const l of [2, 5, 10]) expect(validateSetup([iso(-30)], l, TODAY).ok).toBe(true)
  })
})

describe('setupChanges', () => {
  it('a finished period fills its days and marks the last as ended', () => {
    const days = applyChanges({}, setupChanges([TODAY - 40], 5, TODAY))
    for (let i = 0; i < 5; i++) expect(days[isoDay(TODAY - 40 + i)]?.p).toBe(1)
    expect(days[isoDay(TODAY - 40 + 4)]?.pe).toBe(true)
    expect(days[isoDay(TODAY - 40 + 3)]?.pe).toBeUndefined()
    expect(days[isoDay(TODAY - 40 + 5)]).toBeUndefined()
    expect(periodInProgress(days, TODAY)).toBeNull()
  })
  it('a period still running is logged only up to today and left open', () => {
    const days = applyChanges({}, setupChanges([TODAY - 2], 5, TODAY))
    expect(Object.keys(days)).toEqual([iso(-2), iso(-1), iso(0)])
    expect(Object.values(days).some((r) => r.pe)).toBe(false)
    const p = periodInProgress(days, TODAY)!
    expect(p.start).toBe(TODAY - 2)
    expect(p.dayNumber).toBe(3)
    expect(p.expectedDays).toEqual([TODAY + 1, TODAY + 2])
  })
  it('a period whose last day is exactly today stays open', () => {
    const days = applyChanges({}, setupChanges([TODAY - 4], 5, TODAY))
    expect(Object.values(days).some((r) => r.pe)).toBe(false)
    expect(periodInProgress(days, TODAY)).not.toBeNull()
  })
  it('three starts give contiguous periods (no stray starts) with the chosen length', () => {
    const starts = [TODAY - 90, TODAY - 62, TODAY - 33]
    const days = applyChanges({}, setupChanges(starts, 6, TODAY))
    const { st, pl } = periodStarts(days)
    expect(st).toEqual(starts)
    expect(pl).toEqual([6, 6, 6])
  })
  it('three starts are enough for a real forecast', () => {
    const days = applyChanges({}, setupChanges([TODAY - 90, TODAY - 62, TODAY - 33], 5, TODAY))
    const f = forecast(days, TODAY)!
    expect(f).not.toBeNull()
    expect(f.cyclesUsed).toBe(2)
    expect(f.confidence).not.toBe('Learning')
  })
  it('never writes a day after today', () => {
    const ch = setupChanges([TODAY - 1], 10, TODAY)
    expect(ch.every((c) => dayNum(c.date) <= TODAY)).toBe(true)
  })
})
