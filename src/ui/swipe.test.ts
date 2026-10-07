import { describe, expect, it } from 'vitest'
import { swipeMonth, SWIPE_MIN_X } from './swipe'

describe('swipeMonth', () => {
  it('swipe left = next month, swipe right = previous month', () => {
    expect(swipeMonth(-120, 5)).toBe(1)
    expect(swipeMonth(120, -5)).toBe(-1)
  })
  it('short movements are taps/jitter, not swipes', () => {
    expect(swipeMonth(SWIPE_MIN_X - 1, 0)).toBe(0)
    expect(swipeMonth(-(SWIPE_MIN_X - 1), 0)).toBe(0)
    expect(swipeMonth(0, 0)).toBe(0)
  })
  it('the threshold itself counts', () => {
    expect(swipeMonth(-SWIPE_MIN_X, 0)).toBe(1)
  })
  it('mostly-vertical movement is scrolling, never a month change', () => {
    expect(swipeMonth(-80, 120)).toBe(0)
    expect(swipeMonth(60, -100)).toBe(0)
  })
  it('a clearly diagonal-but-horizontal swipe still works', () => {
    expect(swipeMonth(-120, 60)).toBe(1) // 120 >= 1.5 * 60
  })
})
