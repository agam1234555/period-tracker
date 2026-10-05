import { describe, expect, it, vi } from 'vitest'
import { requestPersistence } from './persist'

describe('requestPersistence', () => {
  it('returns false when there is no storage API (old browser, non-browser)', async () => {
    expect(await requestPersistence(undefined)).toBe(false)
    expect(await requestPersistence({} as never)).toBe(false)
  })
  it('already persisted: returns true and does not ask again', async () => {
    const persist = vi.fn(async () => true)
    expect(await requestPersistence({ persisted: async () => true, persist })).toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })
  it('not yet persisted: asks, and returns the browserâ€™s actual answer', async () => {
    const yes = vi.fn(async () => true), no = vi.fn(async () => false)
    expect(await requestPersistence({ persisted: async () => false, persist: yes })).toBe(true)
    expect(await requestPersistence({ persisted: async () => false, persist: no })).toBe(false)
    expect(yes).toHaveBeenCalledTimes(1)
  })
  it('works when `persisted` is missing (some browsers only have persist)', async () => {
    expect(await requestPersistence({ persist: async () => true } as never)).toBe(true)
  })
  it('never throws: errors from either call become false', async () => {
    expect(await requestPersistence({ persisted: async () => { throw new Error('x') }, persist: async () => true })).toBe(false)
    expect(await requestPersistence({ persisted: async () => false, persist: async () => { throw new Error('x') } })).toBe(false)
  })
})

