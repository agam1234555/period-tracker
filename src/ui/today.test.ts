import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayDayNum } from '../engine/analyze'
import { msUntilMidnight, subscribeDateRollover } from './today'

describe('date rollover handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('TZ', 'America/New_York')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('calculates milliseconds until local midnight accurately on a standard 24h day', () => {
    const fixedNow = new Date(2026, 9, 3, 23, 59, 50, 0) // 10s before midnight Oct 4
    const ms = msUntilMidnight(fixedNow)
    expect(ms).toBe(10050) // 10000ms + 50ms buffer
  })

  it('handles DST spring-forward (23h day): lands on local midnight, not +24h', () => {
    // In America/New_York, 2026-03-08 springs forward at 2:00 AM -> 3:00 AM (23h day)
    const midnightStart = new Date(2026, 2, 8, 0, 0, 0, 0) // Mar 8 00:00 EST
    const ms = msUntilMidnight(midnightStart)

    // Exact duration to next midnight is 23h + 50ms, NOT 24h
    expect(ms).toBe(23 * 3600 * 1000 + 50)

    const nextLanding = new Date(midnightStart.getTime() + ms)
    expect(nextLanding.getFullYear()).toBe(2026)
    expect(nextLanding.getMonth()).toBe(2)
    expect(nextLanding.getDate()).toBe(9) // March 9
    expect(nextLanding.getHours()).toBe(0) // 00:00:00.050 EDT
    expect(nextLanding.getMinutes()).toBe(0)
    expect(nextLanding.getSeconds()).toBe(0)
    expect(nextLanding.getMilliseconds()).toBe(50)
  })

  it('handles DST fall-back (25h day): lands on local midnight, not +24h', () => {
    // In America/New_York, 2026-11-01 falls back at 2:00 AM -> 1:00 AM (25h day)
    const midnightStart = new Date(2026, 10, 1, 0, 0, 0, 0) // Nov 1 00:00 EDT
    const ms = msUntilMidnight(midnightStart)

    // Exact duration to next midnight is 25h + 50ms, NOT 24h
    expect(ms).toBe(25 * 3600 * 1000 + 50)

    const nextLanding = new Date(midnightStart.getTime() + ms)
    expect(nextLanding.getFullYear()).toBe(2026)
    expect(nextLanding.getMonth()).toBe(10)
    expect(nextLanding.getDate()).toBe(2) // November 2
    expect(nextLanding.getHours()).toBe(0) // 00:00:00.050 EST
    expect(nextLanding.getMinutes()).toBe(0)
    expect(nextLanding.getSeconds()).toBe(0)
    expect(nextLanding.getMilliseconds()).toBe(50)
  })

  it('triggers onChange when timer reaches midnight and reschedules for next day', () => {
    let now = new Date(2026, 9, 3, 23, 59, 59, 0)
    const getNow = () => now
    const changes: number[] = []

    const unsubscribe = subscribeDateRollover((t) => changes.push(t), getNow)

    // Advance 2 seconds into the next day (Oct 4)
    now = new Date(2026, 9, 4, 0, 0, 1, 0)
    vi.advanceTimersByTime(2000)

    expect(changes).toHaveLength(1)
    expect(changes[0]).toBe(todayDayNum(now))

    // Advance 24 hours into Oct 5
    now = new Date(2026, 9, 5, 0, 0, 1, 0)
    vi.advanceTimersByTime(86400000)

    expect(changes).toHaveLength(2)
    expect(changes[1]).toBe(todayDayNum(now))

    unsubscribe()
  })

  it('triggers check and updates today on visibility change if day changed while backgrounded', () => {
    let now = new Date(2026, 9, 3, 14, 0, 0)
    const getNow = () => now
    const changes: number[] = []

    // Simulate document event listener in Node test environment
    const listeners: Record<string, () => void> = {}
    const fakeDoc = {
      visibilityState: 'visible',
      addEventListener: (type: string, fn: () => void) => {
        listeners[type] = fn
      },
      removeEventListener: (type: string) => {
        delete listeners[type]
      },
    }
    vi.stubGlobal('document', fakeDoc)

    const unsubscribe = subscribeDateRollover((t) => changes.push(t), getNow)

    // App is backgrounded overnight and wakes up on Oct 4
    now = new Date(2026, 9, 4, 8, 30, 0)
    fakeDoc.visibilityState = 'visible'
    listeners['visibilitychange']?.()

    expect(changes).toHaveLength(1)
    expect(changes[0]).toBe(todayDayNum(now))

    // Subsequent visibility changes on the same day do not emit redundant notifications
    listeners['visibilitychange']?.()
    expect(changes).toHaveLength(1)

    unsubscribe()
    vi.unstubAllGlobals()
  })

  it('stops listening and clears timer on unsubscribe', () => {
    let now = new Date(2026, 9, 3, 23, 59, 59, 0)
    const getNow = () => now
    const changes: number[] = []

    const unsubscribe = subscribeDateRollover((t) => changes.push(t), getNow)
    unsubscribe()

    now = new Date(2026, 9, 4, 0, 0, 1, 0)
    vi.advanceTimersByTime(2000)

    expect(changes).toHaveLength(0)
  })
})
