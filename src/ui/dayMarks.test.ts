import { describe, expect, it } from 'vitest'
import { dayAriaLabel, dayMarks } from './dayMarks'

describe('dayMarks', () => {
  it('empty day has no marks', () => {
    expect(dayMarks(undefined)).toEqual({ period: false, flow: 0, symptoms: 0, mood: false, temp: false, lh: false })
    expect(dayMarks({})).toEqual(dayMarks(undefined))
  })
  it('counts what was logged', () => {
    expect(dayMarks({ p: 1, f: 3, s: ['cramps', 'acne'], m: 2, t: 36.5, lh: true })).toEqual({ period: true, flow: 3, symptoms: 2, mood: true, temp: true, lh: true })
  })
  it('flow only counts on period days', () => {
    expect(dayMarks({ f: 2 }).flow).toBe(0)
  })
})

describe('dayAriaLabel', () => {
  it('plain day is just the date', () => expect(dayAriaLabel('October 6', undefined)).toBe('October 6'))
  it('describes everything on the day', () => {
    expect(dayAriaLabel('October 6', { p: 1, f: 3, s: ['cramps', 'acne'], m: 4, t: 36.5 }, { today: true }))
      .toBe('October 6, today, period, heavy flow, 2 symptoms, mood logged, temperature logged')
  })
  it('singular symptom, and predicted/fertile/expected states', () => {
    expect(dayAriaLabel('Oct 7', { s: ['cramps'] })).toBe('Oct 7, 1 symptom')
    expect(dayAriaLabel('Oct 8', undefined, { expected: true })).toBe('Oct 8, period expected')
    expect(dayAriaLabel('Oct 9', undefined, { predicted: true })).toBe('Oct 9, predicted period')
    expect(dayAriaLabel('Oct 10', undefined, { fertile: true, ovulation: true })).toBe('Oct 10, estimated fertile window, estimated ovulation')
  })
  it('a logged period day is "period", not "expected"', () => {
    expect(dayAriaLabel('Oct 8', { p: 1 }, { expected: true, predicted: true })).toBe('Oct 8, period')
  })
})
