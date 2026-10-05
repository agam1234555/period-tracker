import { describe, expect, it } from 'vitest'
import { dayNum, isoDay, type Days } from './analyze'
import { forecast } from './forecast'

// Regular 28-day cycles starting 2026-01-01, 5-day periods.
function regular(n: number): Days {
  const d: Days = {}
  const base = dayNum('2026-01-01')
  for (let c = 0; c < n; c++) for (let i = 0; i < 5; i++) d[isoDay(base + c * 28 + i)] = { p: 1 }
  return d
}

describe('display fields', () => {
  const days = regular(6)
  const last = dayNum('2026-01-01') + 5 * 28
  const f = forecast(days, last + 10)!

  it('cycle day, last start, period length', () => {
    expect(f.lastStart).toBe(last)
    expect(f.cycleDay).toBe(11)
    expect(f.periodLen).toBe(5)
  })
  it('next start is consistent with rounded range and daysUntil', () => {
    expect(f.rangeLo).toBeLessThan(f.nextStart)
    expect(f.rangeHi).toBeGreaterThan(f.nextStart)
    expect(f.daysUntil).toBe(f.nextStart - (last + 10))
  })
  it('fertile window surrounds ovulation; unconfirmed when no temps', () => {
    expect(f.ovulationConfirmed).toBe(false)
    expect(f.fertileFrom).toBeLessThan(f.ovulation)
    expect(f.fertileTo).toBeGreaterThan(f.ovulation)
  })
  it('daysUntil goes negative when late', () => {
    expect(forecast(days, last + 40)!.daysUntil).toBeLessThan(0)
  })
  it('confidence is Learning with <2 cycles, High for steady cycles', () => {
    expect(forecast(regular(1), last)!.confidence).toBe('Learning')
    expect(f.confidence).toBe('High')
  })
})
