import { describe, expect, it } from 'vitest'
import { backupStatus, daysSinceBackup, REMIND_AFTER_DAYS, REMIND_MIN_DAYS } from './backupReminder'

const now = new Date(2026, 9, 3, 12, 0, 0) // Oct 3 2026, local noon
const daysAgo = (n: number, h = 12) => new Date(2026, 9, 3 - n, h, 0, 0).toISOString()

describe('daysSinceBackup', () => {
  it('null for never / empty / unreadable', () => {
    for (const v of [null, undefined, '', 'garbage']) expect(daysSinceBackup(v, now)).toBeNull()
  })
  it('counts local calendar days, not 24h blocks', () => {
    expect(daysSinceBackup(daysAgo(0, 1), now)).toBe(0)
    expect(daysSinceBackup(new Date(2026, 9, 2, 23, 59).toISOString(), new Date(2026, 9, 3, 0, 1))).toBe(1) // 2 minutes apart, different days
    expect(daysSinceBackup(daysAgo(30), now)).toBe(30)
  })
  it('a timestamp in the future (clock change) clamps to 0', () => {
    expect(daysSinceBackup(new Date(2026, 9, 9).toISOString(), now)).toBe(0)
  })
})

describe('backupStatus', () => {
  it('labels', () => {
    expect(backupStatus(null, 0, now).label).toBe('Last backup: never')
    expect(backupStatus(daysAgo(0), 0, now).label).toBe('Last backup: today')
    expect(backupStatus(daysAgo(1), 0, now).label).toBe('Last backup: yesterday')
    expect(backupStatus(daysAgo(12), 0, now).label).toBe('Last backup: 12 days ago')
  })
  it('no nudge with little data, even if never backed up', () => {
    expect(backupStatus(null, REMIND_MIN_DAYS - 1, now).nudge).toBe(false)
  })
  it('nudges when never backed up and enough data', () => {
    expect(backupStatus(null, REMIND_MIN_DAYS, now).nudge).toBe(true)
  })
  it('threshold is strictly more than 30 days', () => {
    expect(backupStatus(daysAgo(REMIND_AFTER_DAYS), 100, now).nudge).toBe(false)
    expect(backupStatus(daysAgo(REMIND_AFTER_DAYS + 1), 100, now).nudge).toBe(true)
  })
  it('a recent backup never nudges', () => {
    expect(backupStatus(daysAgo(2), 500, now).nudge).toBe(false)
  })
  it('an unreadable stored value is treated as never', () => {
    expect(backupStatus('garbage', 100, now).nudge).toBe(true)
  })
})
