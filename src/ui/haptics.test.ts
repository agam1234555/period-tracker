import { afterEach, describe, expect, it, vi } from 'vitest'
import { tap } from './haptics'

afterEach(() => vi.unstubAllGlobals())

describe('tap', () => {
  it('does nothing (and does not throw) when there is no navigator, as in tests or SSR', () => {
    expect(() => tap()).not.toThrow()
  })
  it('does nothing when the Vibration API is missing (iOS)', () => {
    vi.stubGlobal('navigator', {})
    expect(() => tap()).not.toThrow()
  })
  it('vibrates briefly when supported', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    tap()
    tap(14)
    expect(vibrate).toHaveBeenNthCalledWith(1, 8)
    expect(vibrate).toHaveBeenNthCalledWith(2, 14)
  })
  it('swallows errors from browsers that block vibration', () => {
    vi.stubGlobal('navigator', { vibrate: () => { throw new Error('blocked') } })
    expect(() => tap()).not.toThrow()
  })
})
