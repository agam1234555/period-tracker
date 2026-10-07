import { describe, expect, it } from 'vitest'
import { forecastText, type ForecastTextInput } from './forecastText'

const fmt = (n: number) => `d${n}`
const base: ForecastTextInput = { daysUntil: 10, rangeLo: 108, rangeHi: 112, nextStart: 110, fertileFrom: 95, fertileTo: 101, ovulation: 97, ovulationConfirmed: false, confidence: 'High', cyclesUsed: 5, avgCycle: 28.2, variability: 1.2, weightOv: 0 }
const t = (o: Partial<ForecastTextInput> = {}) => forecastText({ ...base, ...o }, fmt)

describe('headline', () => {
  it('future, singular/plural, today', () => {
    expect(t({ daysUntil: 10 }).headline).toBe('In 10 days')
    expect(t({ daysUntil: 1 }).headline).toBe('In 1 day')
    expect(t({ daysUntil: 0 }).headline).toBe('Expected today')
  })
  it('late', () => {
    expect(t({ daysUntil: -1 }).headline).toBe('1 day late')
    expect(t({ daysUntil: -3 }).headline).toBe('3 days late')
  })
})

describe('late status', () => {
  it('no status when not late', () => expect(t({ daysUntil: 3 }).status).toBeNull())
  it('late but still inside the range says so', () => {
    // today = nextStart - daysUntil = 111, rangeHi 112
    expect(t({ daysUntil: -1 }).status).toBe('Still within your usual range.')
  })
  it('late beyond the range', () => {
    // today = 113 > 112
    expect(t({ daysUntil: -3 }).status).toMatch(/Later than your usual range/)
    expect(t({ daysUntil: -3 }).status).toMatch(/many reasons/)
  })
})

describe('learning vs known cycles', () => {
  it('fewer than 2 cycles: honest "still learning", no average claimed', () => {
    for (const n of [0, 1]) {
      const l = t({ cyclesUsed: n }).cycleLine
      expect(l).toMatch(/Still learning/)
      expect(l).not.toMatch(/average/)
    }
  })
  it('2+ cycles: average and spread in plain words', () => {
    expect(t().cycleLine).toBe('Your cycles average 28 days and usually vary by about ±1 days.')
    expect(t({ variability: 0.4 }).cycleLine).toMatch(/less than a day/)
    expect(t({ variability: 3.6 }).cycleLine).toMatch(/about ±4 days/)
  })
})

describe('estimated vs confirmed ovulation', () => {
  it('estimate: labelled as estimated, with a fertile-window caveat and no temperature note', () => {
    const x = t()
    expect(x.ovulation).toBe('Estimated ovulation: d97')
    expect(x.fertileNote).toMatch(/estimated .* can be off/)
    expect(x.blendNote).toBeNull()
  })
  it('confirmed by temperature: says so, no caveat, shows the temperature weight', () => {
    const x = t({ ovulationConfirmed: true, weightOv: 0.62 })
    expect(x.ovulation).toBe('Ovulation confirmed by temperature: d97')
    expect(x.fertileNote).toBeNull()
    expect(x.blendNote).toMatch(/62% temperature/)
  })
})

it('formats ranges with the supplied formatter', () => {
  const x = t()
  expect(x.range).toBe('d108 – d112')
  expect(x.best).toBe('d110')
  expect(x.fertile).toBe('d95 – d101')
})
