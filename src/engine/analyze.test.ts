import { describe, expect, it } from 'vitest'
import { analyze, dayNum, isoDay, todayDayNum } from './analyze'
import type { Days } from './analyze'
import golden from './__fixtures__/golden.json'

interface Expected {
  st: number[]
  plen: number
  sd: number
  mu: number
  n: number
  lut: number
  lutKnown: boolean
  last?: number | null
  curOv?: number | null
  lenPred?: number | null
  lenHw?: number | null
  ovPred?: number | null
  proj: { s: number; w: number; ov: number; conf: boolean }[]
  cy: { len: number; ok: boolean; ov: number | null; lut: number | null }[]
}
interface Case {
  name: string
  today: number
  days: Days
  expected: Expected
}
const cases = golden as unknown as Case[]

describe('analyze() matches the Python reference (golden cases)', () => {
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const A = analyze(c.days, c.today)
    const E = c.expected
    expect(A.st).toEqual(E.st)
    expect(A.plen).toBe(E.plen)
    expect(A.n).toBe(E.n)
    expect(A.lut).toBe(E.lut)
    expect(A.lutKnown).toBe(E.lutKnown)
    expect(A.mu).toBeCloseTo(E.mu, 9)
    expect(A.sd).toBeCloseTo(E.sd, 9)
    if (E.last != null) expect(A.last).toBe(E.last)
    if (E.st.length) expect(A.curOv ?? null).toBe(E.curOv ?? null)
    expect(A.lenPred ?? null).toBe(E.lenPred ?? null)
    expect(A.lenHw ?? null).toBe(E.lenHw ?? null)
    expect(A.ovPred ?? null).toBe(E.ovPred ?? null)
    expect(A.proj).toEqual(E.proj)
    expect(A.cy.map((x) => ({ len: x.len, ok: x.ok, ov: x.ov, lut: x.lut }))).toEqual(E.cy)
  })

  it('fixtures cover the interesting branches', () => {
    const confirmed = cases.filter((c) => c.expected.proj[0]?.conf)
    expect(confirmed.some((c) => c.expected.lutKnown)).toBe(true)
    expect(confirmed.some((c) => !c.expected.lutKnown)).toBe(true)
    expect(cases.some((c) => c.expected.cy.some((x) => !x.ok))).toBe(true) // missed-log exclusion
  })
})

describe('behaviour pinned by Phase 1', () => {
  const regular = cases.find((c) => c.name === 'regular 7 cycles, no temps')!
  const unknown = cases.find((c) => c.name.startsWith('ovulation confirmed, luteal NOT known'))!
  const known = cases.find((c) => c.name.startsWith('luteal known + ovulation confirmed'))!

  it('empty input returns defaults (29 d, sd 4, luteal 14)', () => {
    const A = analyze({}, 19000)
    expect(A).toMatchObject({ mu: 29, sd: 4, lut: 14, lutKnown: false, n: 0, proj: [] })
  })
  it('without temperatures, forecast is last start + rounded mean, window from sd', () => {
    const A = analyze(regular.days, regular.today)
    expect(A.proj[0].conf).toBe(false)
    expect(A.proj[0].s).toBe(A.last! + Math.round(A.mu))
    expect(A.proj[0].w).toBe(Math.max(1, Math.round(1.28 * A.sd)))
  })
  it('confirmed ovulation, luteal not learned yet -> window w=3', () => {
    const A = analyze(unknown.days, unknown.today)
    expect(A.proj[0]).toMatchObject({ conf: true, w: 3 })
    expect(A.lutKnown).toBe(false)
  })
  it('confirmed ovulation, luteal learned -> window w=2 and start = ovulation + personal luteal', () => {
    const A = analyze(known.days, known.today)
    expect(A.proj[0]).toMatchObject({ conf: true, w: 2 })
    expect(A.proj[0].s).toBe(A.curOv! + A.lut)
  })
  it('outlier cycles (missed logs) are excluded from the mean', () => {
    const c = cases.find((x) => x.name.startsWith('missed logs'))!
    const A = analyze(c.days, c.today)
    expect(A.cy.filter((x) => !x.ok).map((x) => x.len)).toEqual(expect.arrayContaining([62, 12]))
    expect(A.mu).toBeGreaterThan(26)
    expect(A.mu).toBeLessThan(32)
  })
})

describe('date helpers', () => {
  it('dayNum and isoDay round-trip', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2028-02-29', '2026-12-31']) expect(isoDay(dayNum(iso))).toBe(iso)
  })
  it('todayDayNum uses the local calendar date', () => {
    expect(isoDay(todayDayNum(new Date(2026, 9, 2, 23, 59)))).toBe('2026-10-02')
    expect(isoDay(todayDayNum(new Date(2026, 9, 2, 0, 1)))).toBe('2026-10-02')
  })
})
