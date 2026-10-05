import { describe, expect, it } from 'vitest'
import { applyChanges, endPeriod, expectedPeriodLength, MAX_ONGOING_DAYS, MAX_PERIOD_DAYS, periodInProgress, startPeriod } from './periodLogging'
import { dayNum, isoDay, periodStarts, type Days } from './engine/analyze'
import { forecast } from './engine/forecast'

const D0 = dayNum('2026-01-01')
const run = (start: number, len: number, extra: Days = {}): Days => {
  const d: Days = { ...extra }
  for (let i = 0; i < len; i++) d[isoDay(start + i)] = { ...(d[isoDay(start + i)] ?? {}), p: 1 }
  return d
}
/** `n` completed 28-day cycles of 5-day periods, then nothing. */
const history = (n: number): Days => { let d: Days = {}; for (let c = 0; c < n; c++) d = run(D0 + c * 28, 5, d); return d }
const ok = (r: ReturnType<typeof endPeriod>) => { if (!r.ok) throw new Error(r.error); return r.changes }

describe('expectedPeriodLength', () => {
  it('defaults to 5 with no history', () => expect(expectedPeriodLength({}, false)).toBe(5))
  it('averages recent completed periods', () => {
    let d = run(D0, 4); d = run(D0 + 28, 6, d); d = run(D0 + 56, 5, d)
    expect(expectedPeriodLength(d, false)).toBe(5)
  })
  it('excludes the in-progress period (a 1-day run must not drag the estimate down)', () => {
    let d = run(D0, 6); d = run(D0 + 28, 6, d); d = run(D0 + 56, 1, d)
    expect(expectedPeriodLength(d, true)).toBe(6)
    expect(expectedPeriodLength(d, false)).toBe(4) // what the naive average would give
  })
  it('clamps to 2-10', () => {
    expect(expectedPeriodLength(run(D0, 1), false)).toBe(2)
    expect(expectedPeriodLength(run(D0, 13), false)).toBe(10)
  })
})

describe('periodInProgress', () => {
  it('none without data, or when the start is in the future', () => {
    expect(periodInProgress({}, D0)).toBeNull()
    expect(periodInProgress(run(D0 + 5, 1), D0)).toBeNull()
  })
  it('a start logged today is day 1 with the remaining expected days listed, never stored', () => {
    const d = run(D0, 1)
    const p = periodInProgress(d, D0)!
    expect(p).toMatchObject({ start: D0, loggedEnd: D0, dayNumber: 1, expectedLen: 5 })
    expect(p.expectedDays).toEqual([D0 + 1, D0 + 2, D0 + 3, D0 + 4])
  })
  it('uses the person’s own usual length once there is history', () => {
    let d = history(3)
    d = run(D0 + 3 * 28, 1, d)
    expect(periodInProgress(d, D0 + 3 * 28 + 1)!.expectedLen).toBe(5)
    let six: Days = {}; for (let c = 0; c < 3; c++) six = run(D0 + c * 28, 6, six)
    six = run(D0 + 84, 1, six)
    expect(periodInProgress(six, D0 + 84)!.expectedLen).toBe(6)
  })
  it('days already logged are not listed as expected', () => {
    const p = periodInProgress(run(D0, 3), D0 + 2)!
    expect(p.expectedDays).toEqual([D0 + 3, D0 + 4])
  })
  it('an ended period (pe on its last day) is not in progress', () => {
    const d = applyChanges(run(D0, 1), ok(endPeriod(run(D0, 1), D0 + 3)))
    expect(periodInProgress(d, D0 + 4)).toBeNull()
  })
  it(`stops offering "ended" ${MAX_ONGOING_DAYS} days after the start`, () => {
    expect(periodInProgress(run(D0, 1), D0 + MAX_ONGOING_DAYS - 1)).not.toBeNull()
    expect(periodInProgress(run(D0, 1), D0 + MAX_ONGOING_DAYS)).toBeNull()
  })
})

describe('startPeriod', () => {
  it('marks the day and keeps everything else logged that day', () => {
    const d: Days = { [isoDay(D0)]: { t: 36.5, s: ['cramps'] } }
    const c = startPeriod(d, D0)
    expect(c).toEqual([{ date: isoDay(D0), next: { t: 36.5, s: ['cramps'], p: 1 } }])
  })
  it('does nothing if the day is already a period day', () => {
    expect(startPeriod(run(D0, 1), D0)).toEqual([])
  })
})

describe('endPeriod', () => {
  it('fills every day from start to the end day, and marks only the end day', () => {
    const d = run(D0, 1)
    const after = applyChanges(d, ok(endPeriod(d, D0 + 3)))
    for (let i = 0; i < 4; i++) expect(after[isoDay(D0 + i)]?.p).toBe(1)
    expect(after[isoDay(D0 + 3)]?.pe).toBe(true)
    for (let i = 0; i < 3; i++) expect(after[isoDay(D0 + i)]?.pe).toBeUndefined()
    expect(after[isoDay(D0 + 4)]).toBeUndefined()
  })
  it('the result is one contiguous period: one start, correct length (no stray start)', () => {
    const d = run(D0, 1)
    const { st, pl } = periodStarts(applyChanges(d, ok(endPeriod(d, D0 + 4))))
    expect(st).toEqual([D0]); expect(pl).toEqual([5])
  })
  it('retroactive end shortens a longer run, keeps other data, and clears flow on removed days', () => {
    let d = run(D0, 5)
    d[isoDay(D0 + 3)] = { p: 1, f: 3, t: 36.4 }
    const after = applyChanges(d, ok(endPeriod(d, D0 + 2)))
    expect(after[isoDay(D0 + 2)]?.pe).toBe(true)
    expect(after[isoDay(D0 + 3)]).toEqual({ t: 36.4 })
    expect(after[isoDay(D0 + 4)]).toBeUndefined()
    expect(periodStarts(after).pl).toEqual([3])
  })
  it('is idempotent: ending the same way twice changes nothing the second time', () => {
    const d = run(D0, 1)
    const once = applyChanges(d, ok(endPeriod(d, D0 + 3)))
    expect(ok(endPeriod(once, D0 + 3))).toEqual([])
  })
  it('moving the end clears the old marker', () => {
    const d = run(D0, 1)
    const a = applyChanges(d, ok(endPeriod(d, D0 + 3)))
    const b = applyChanges(a, ok(endPeriod(a, D0 + 4)))
    expect(b[isoDay(D0 + 3)]?.pe).toBeUndefined()
    expect(b[isoDay(D0 + 4)]?.pe).toBe(true)
    expect(b[isoDay(D0 + 4)]?.p).toBe(1)
  })
  it('only touches the latest period at or before the end day', () => {
    const d = history(3)
    const changes = ok(endPeriod(d, D0 + 56 + 3))
    for (const c of changes) expect(dayNum(c.date)).toBeGreaterThanOrEqual(D0 + 56)
  })
  it('errors: nothing before, or longer than the maximum', () => {
    expect(endPeriod({}, D0)).toMatchObject({ ok: false })
    expect(endPeriod(run(D0, 1), D0 - 1)).toMatchObject({ ok: false })
    expect(endPeriod(run(D0, 1), D0 + MAX_PERIOD_DAYS)).toMatchObject({ ok: false })
    expect(endPeriod(run(D0, 1), D0 + MAX_PERIOD_DAYS - 1)).toMatchObject({ ok: true })
  })
  it('undoing (restoring the before-records) returns the exact original data', () => {
    const d = run(D0, 2, { [isoDay(D0 + 1)]: { p: 1, f: 2 } })
    const changes = ok(endPeriod(d, D0 + 4))
    const redone = applyChanges(d, changes)
    const undo = changes.map((c) => ({ date: c.date, next: d[c.date] ?? {} }))
    expect(applyChanges(redone, undo)).toEqual(d)
  })
})

describe('forecast is unaffected by how a period is logged', () => {
  it('start-only, filled-by-"ended", and day-by-day give identical cycle predictions', () => {
    let startOnly: Days = {}, filled: Days = {}, daily: Days = {}
    for (let c = 0; c < 6; c++) {
      const s = D0 + c * 28
      startOnly = run(s, 1, startOnly)
      filled = applyChanges(filled, [...startPeriod(filled, s), ...ok(endPeriod(run(s, 1, filled), s + 4))])
      daily = run(s, 5, daily)
    }
    const today = D0 + 5 * 28 + 10
    const pick = (f: ReturnType<typeof forecast>) => f && { start: f.start, hw: f.halfWidth, next: f.nextStart, lo: f.rangeLo, hi: f.rangeHi, conf: f.confidence }
    expect(pick(forecast(filled, today))).toEqual(pick(forecast(daily, today)))
    expect(pick(forecast(startOnly, today))).toEqual(pick(forecast(daily, today)))
  })
})
