import { describe, expect, it } from 'vitest'
import { backupFilename, exportBackup, MAX_DAYS, validateBackup } from './backup'
import { dayNum, isoDay, type Days } from './engine/analyze'
import { forecast } from './engine/forecast'

const sample: Days = {
  '2026-01-01': { p: 1, f: 2 },
  '2026-01-02': { p: 1, f: 3, lh: true },
  '2026-01-15': { t: 36.45 },
  '2026-01-29': { p: 1 },
}
const wrap = (days: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ app: 'cycle', version: 2, days, ...extra })
const err = (text: string) => { const r = validateBackup(text); expect(r.ok).toBe(false); return r.ok ? '' : r.error }

describe('export / import round trip', () => {
  it('restores exactly what was exported', () => {
    const r = validateBackup(exportBackup(sample))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.days).toEqual(sample)
      expect(r.summary).toEqual({ count: 4, first: '2026-01-01', last: '2026-01-29' })
    }
  })
  it('a restored history gives the identical forecast', () => {
    const base = dayNum('2026-01-01')
    const days: Days = {}
    for (let c = 0; c < 6; c++) for (let i = 0; i < 5; i++) days[isoDay(base + c * 28 + i)] = { p: 1 }
    const r = validateBackup(exportBackup(days))
    if (!r.ok) throw new Error(r.error)
    const today = base + 5 * 28 + 10
    expect(forecast(r.days, today)).toEqual(forecast(days, today))
  })
  it('export is sorted and records a timestamp', () => {
    const j = JSON.parse(exportBackup({ '2026-02-01': { p: 1 }, '2026-01-01': { p: 1 } }, new Date('2026-10-03T00:00:00Z')))
    expect(Object.keys(j.days)).toEqual(['2026-01-01', '2026-02-01'])
    expect(j.exportedAt).toBe('2026-10-03T00:00:00.000Z')
    expect(j.version).toBe(2)
  })
  it('filename uses the local date, zero-padded', () => {
    expect(backupFilename(new Date(2026, 0, 5))).toBe('cycle-backup-2026-01-05.json')
  })
})

describe('rejects bad files (nothing is returned for writing)', () => {
  it('not JSON / wrong app / bad version / no days', () => {
    expect(err('hello')).toMatch(/not JSON/)
    expect(err('[]')).toMatch(/not made by Cycle/)
    expect(err(JSON.stringify({ app: 'other', version: 1, days: {} }))).toMatch(/not made by Cycle/)
    expect(err(JSON.stringify({ app: 'cycle', days: {} }))).toMatch(/no version/)
    expect(err(JSON.stringify({ app: 'cycle', version: 3, days: sample }))).toMatch(/newer version/)
    expect(err(JSON.stringify({ app: 'cycle', version: 0, days: sample }))).toMatch(/Unsupported/)
    expect(err(JSON.stringify({ app: 'cycle', version: 1 }))).toMatch(/no day data/)
  })
  it('invalid dates, including impossible ones', () => {
    for (const k of ['2026-13-01', '2026-02-30', '26-01-01', 'yesterday']) expect(err(wrap({ [k]: { p: 1 } }))).toMatch(/Invalid date/)
  })
  it('out-of-range or wrong-typed fields', () => {
    expect(err(wrap({ '2026-01-01': { t: 98.6 } }))).toMatch(/34–42/)
    expect(err(wrap({ '2026-01-01': { t: '36.5' } }))).toMatch(/34–42/)
    expect(err(wrap({ '2026-01-01': { f: 4 } }))).toMatch(/flow/)
    expect(err(wrap({ '2026-01-01': { p: 'yes' } }))).toMatch(/period/)
    expect(err(wrap({ '2026-01-01': { lh: 1 } }))).toMatch(/LH/)
    expect(err(wrap({ '2026-01-01': 5 }))).toMatch(/Invalid entry/)
  })
  it('one bad day rejects the whole file', () => {
    expect(err(wrap({ '2026-01-01': { p: 1 }, '2026-01-02': { t: 50 } }))).toMatch(/2026-01-02/)
  })
  it('refuses an empty backup so a wrong file cannot wipe real data', () => {
    expect(err(wrap({}))).toMatch(/no logged days/)
    expect(err(wrap({ '2026-01-01': { p: 0 } }))).toMatch(/no logged days/)
  })
  it('rejects absurdly large files', () => {
    const big: Record<string, unknown> = {}
    for (let i = 0; i <= MAX_DAYS; i++) big[`k${i}`] = {}
    expect(err(wrap(big))).toMatch(/too many/)
  })
})

describe('normalisation', () => {
  it('drops unknown fields and empty records, normalises period flag', () => {
    const r = validateBackup(wrap({ '2026-01-01': { p: true, mood: 'ok', f: null }, '2026-01-02': { p: 0, t: null }, '2026-01-03': { t: 36.6 } }))
    expect(r.ok && r.days).toEqual({ '2026-01-01': { p: 1 }, '2026-01-03': { t: 36.6 } })
  })
})

describe('symptoms + mood in backups (v2)', () => {
  const rich: Days = { '2026-01-01': { p: 1, s: ['cramps', 'fatigue'], m: 2 }, '2026-01-02': { s: ['headache'] }, '2026-01-03': { m: 5 } }
  it('round trips', () => {
    const r = validateBackup(exportBackup(rich))
    expect(r.ok && r.days).toEqual(rich)
  })
  it('v1 files (no symptoms) still restore', () => {
    const r = validateBackup(JSON.stringify({ app: 'cycle', version: 1, days: sample }))
    expect(r.ok && r.days).toEqual(sample)
  })
  it('rejects unknown symptoms, non-arrays and bad mood', () => {
    expect(err(wrap({ '2026-01-01': { s: ['cramps', 'dizzy'] } }))).toMatch(/Unknown symptom/)
    expect(err(wrap({ '2026-01-01': { s: 'cramps' } }))).toMatch(/Unknown symptom/)
    for (const m of [0, 6, 2.5, '3']) expect(err(wrap({ '2026-01-01': { m } }))).toMatch(/Invalid mood/)
  })
  it('de-duplicates, orders canonically, drops empty symptom lists', () => {
    const r = validateBackup(wrap({ '2026-01-01': { s: ['fatigue', 'cramps', 'cramps'] }, '2026-01-02': { s: [], p: 1 }, '2026-01-03': { s: [] } }))
    expect(r.ok && r.days).toEqual({ '2026-01-01': { s: ['cramps', 'fatigue'] }, '2026-01-02': { p: 1 } })
  })
  it('a day with only an empty symptom list does not count as a logged day', () => {
    expect(err(wrap({ '2026-01-01': { s: [] } }))).toMatch(/no logged days/)
  })
  it('symptoms and mood never change the forecast', () => {
    const base = dayNum('2026-01-01')
    const plain: Days = {}
    for (let c = 0; c < 6; c++) for (let i = 0; i < 5; i++) plain[isoDay(base + c * 28 + i)] = { p: 1 }
    const noisy: Days = JSON.parse(JSON.stringify(plain))
    for (const k of Object.keys(noisy)) { noisy[k].s = ['cramps', 'bloating']; noisy[k].m = 1 }
    noisy[isoDay(base + 12)] = { s: ['headache'], m: 5 }
    const today = base + 5 * 28 + 10
    expect(forecast(noisy, today)).toEqual(forecast(plain, today))
  })
})

describe('period-end marker (pe)', () => {
  it('round trips', () => {
    const d: Days = { '2026-01-01': { p: 1 }, '2026-01-02': { p: 1, pe: true } }
    const r = validateBackup(exportBackup(d))
    expect(r.ok && r.days).toEqual(d)
  })
  it('false is dropped, non-boolean rejected', () => {
    const r = validateBackup(wrap({ '2026-01-01': { p: 1, pe: false } }))
    expect(r.ok && r.days).toEqual({ '2026-01-01': { p: 1 } })
    expect(err(wrap({ '2026-01-01': { p: 1, pe: 'yes' } }))).toMatch(/period-end/)
  })
})
