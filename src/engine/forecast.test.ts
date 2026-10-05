import { describe, expect, it } from 'vitest'
import { analyze, isoDay, type Days } from './analyze'
import { buildTrack, forecast } from './forecast'
import golden from './__fixtures__/golden.json'

interface Case { name: string; today: number; days: Days }
const cases = golden as unknown as Case[]
const byName = (p: string) => cases.find((c) => c.name.startsWith(p))!

describe('forecast() glue', () => {
  it('returns null with no logged period', () => {
    expect(forecast({}, 19000)).toBeNull()
  })

  it('without confirmed ovulation, shows the cycle-length model unchanged', () => {
    const c = byName('regular 7 cycles, no temps')
    const A = analyze(c.days, c.today)
    const F = forecast(c.days, c.today)!
    expect(F.confirmed).toBe(false)
    expect(F.weightOv).toBe(0)
    expect(F.ovStart).toBeNull()
    expect(F.start).toBe(A.last! + Math.round(A.mu))
    expect(F.start).toBe(F.lenStart)
  })

  it('with confirmed ovulation, blends the two predictions (weight strictly between 0 and 1)', () => {
    const c = byName('luteal known + ovulation confirmed')
    const F = forecast(c.days, c.today)!
    expect(F.confirmed).toBe(true)
    expect(F.weightOv).toBeGreaterThan(0)
    expect(F.weightOv).toBeLessThan(1)
    expect(F.start).toBeGreaterThanOrEqual(Math.min(F.lenStart, F.ovStart!) - 1e-9)
    expect(F.start).toBeLessThanOrEqual(Math.max(F.lenStart, F.ovStart!) + 1e-9)
    expect(F.start).toBeCloseTo(F.weightOv * F.ovStart! + (1 - F.weightOv) * F.lenStart, 9)
  })

  it('uses the cycle-length path for blend inputs even when ovulation is confirmed (analyze() proj[0] would be the ovulation forecast)', () => {
    const c = byName('luteal known + ovulation confirmed')
    const A = analyze(c.days, c.today)
    const F = forecast(c.days, c.today)!
    expect(A.proj[0].conf).toBe(true)
    expect(F.lenStart).toBe(A.last! + Math.round(A.mu))
    expect(F.ovStart).toBe(A.curOv! + A.lut)
    expect(F.lenStart).not.toBe(A.proj[0].s)
  })

  it('range is never narrower than 1 day and is finite', () => {
    for (const c of cases) {
      const F = forecast(c.days, c.today)
      if (F) {
        expect(Number.isFinite(F.start)).toBe(true)
        expect(F.halfWidth).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('is deterministic and does not mutate the logs', () => {
    const c = byName('fuzz 3')
    const snapshot = JSON.stringify(c.days)
    const a = forecast(c.days, c.today), b = forecast(c.days, c.today)
    expect(a).toEqual(b)
    expect(JSON.stringify(c.days)).toBe(snapshot)
  })
})

describe('buildTrack() replay', () => {
  it('records one outcome per completed cycle that has any history before it', () => {
    const c = byName('regular 7 cycles, no temps')   // 7 starts -> 6 cycles; the first has no history before it
    const t = buildTrack(c.days)
    expect(t.shownErrors.length).toBe(5)
    expect(t.ovErrors.length).toBe(0)                  // no temperatures -> no ovulation comparisons
  })

  it('records ovulation-vs-cycle-length comparisons when temperatures exist', () => {
    const c = byName('luteal known + ovulation confirmed')
    const t = buildTrack(c.days)
    expect(t.ovErrors.length).toBeGreaterThan(0)
    expect(t.ovErrors.length).toBe(t.lenErrors.length)
  })

  it('skips outcome cycles outside 15-60 days (missed logs)', () => {
    const c = byName('missed logs')   // cycles 29, 62, 29, 12, 29, 29 -> 62 and 12 skipped
    expect(buildTrack(c.days).shownErrors.length).toBe(3)
  })

  it('a later edit to old logs changes the track (no stale stored state)', () => {
    const c = byName('luteal known + ovulation confirmed')
    const before = buildTrack(c.days)
    const edited: Days = JSON.parse(JSON.stringify(c.days))
    for (const k of Object.keys(edited)) delete edited[k].t   // user deletes all temperatures
    expect(buildTrack(edited).ovErrors.length).toBe(0)
    expect(before.ovErrors.length).toBeGreaterThan(0)
  })

  it('only uses information from before each cycle ended (no peeking)', () => {
    const c = byName('luteal known + ovulation confirmed')
    const t1 = buildTrack(c.days)
    // Adding a future cycle must not change errors already recorded for earlier cycles.
    const extra: Days = JSON.parse(JSON.stringify(c.days))
    const last = Math.max(...Object.keys(extra).map((k) => Date.parse(k) / 864e5))
    for (let d = 0; d < 5; d++) extra[isoDay(last + 30 + d)] = { p: 1 }
    const t2 = buildTrack(extra)
    expect(t2.shownErrors.slice(0, t1.shownErrors.length)).toEqual(t1.shownErrors)
  })
})
