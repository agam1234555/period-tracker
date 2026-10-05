// Backup / restore: pure logic (no DOM, no storage) so it can be tested in node.
// File format v2: { app: 'cycle', version: 2, exportedAt: ISO string, days: { 'YYYY-MM-DD': { p?, t?, f?, lh?, s?, m?, pe? } } }
// v1 (no s / m) files are still accepted.
import { dayNum, isoDay, type DayRecord, type Days } from './engine/analyze'
import { canonicalSymptoms, isMood, isSymptomKey } from './symptoms'

export const BACKUP_VERSION = 2
export const MAX_DAYS = 20000 // ~55 years; guards against absurd files

export function exportBackup(days: Days, now: Date = new Date()): string {
  const sorted: Days = {}
  for (const k of Object.keys(days).sort()) sorted[k] = days[k]
  return JSON.stringify({ app: 'cycle', version: BACKUP_VERSION, exportedAt: now.toISOString(), days: sorted }, null, 2)
}

/** cycle-backup-YYYY-MM-DD.json, using the LOCAL date. */
export function backupFilename(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `cycle-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`
}

export interface BackupSummary { count: number; first: string; last: string }
export type BackupResult = { ok: true; days: Days; summary: BackupSummary } | { ok: false; error: string }

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isRealDate = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k) && isoDay(dayNum(k)) === k // rejects 2026-02-30

/**
 * Validate a backup file's text. Nothing is returned for writing unless EVERYTHING checks out:
 * one bad day rejects the whole file (a half-imported history would corrupt cycle lengths).
 * Only known fields are kept; empty records are dropped (same rule as saveDay).
 */
export function validateBackup(text: string): BackupResult {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, error: 'This is not a valid backup file (not JSON).' } }
  if (!isPlainObject(raw) || raw.app !== 'cycle') return { ok: false, error: 'This file was not made by Cycle.' }
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version)) return { ok: false, error: 'Backup has no version number.' }
  if (raw.version > BACKUP_VERSION) return { ok: false, error: 'This backup was made by a newer version of Cycle. Update the app and try again.' }
  if (raw.version < 1) return { ok: false, error: 'Unsupported backup version.' }
  if (!isPlainObject(raw.days)) return { ok: false, error: 'Backup has no day data.' }

  const keys = Object.keys(raw.days)
  if (keys.length > MAX_DAYS) return { ok: false, error: 'Backup has too many days.' }

  const days: Days = {}
  for (const k of keys) {
    if (!isRealDate(k)) return { ok: false, error: `Invalid date in backup: "${k}".` }
    const r = (raw.days as Record<string, unknown>)[k]
    if (!isPlainObject(r)) return { ok: false, error: `Invalid entry for ${k}.` }
    const out: DayRecord = {}
    if (r.p !== undefined && r.p !== null) {
      if (r.p !== 0 && r.p !== 1 && typeof r.p !== 'boolean') return { ok: false, error: `Invalid period value on ${k}.` }
      if (r.p) out.p = 1
    }
    if (r.t !== undefined && r.t !== null) {
      if (typeof r.t !== 'number' || !Number.isFinite(r.t) || r.t < 34 || r.t > 42) return { ok: false, error: `Temperature on ${k} is outside 34–42 °C.` }
      out.t = r.t
    }
    if (r.f !== undefined && r.f !== null) {
      if (r.f !== 1 && r.f !== 2 && r.f !== 3) return { ok: false, error: `Invalid flow value on ${k}.` }
      out.f = r.f
    }
    if (r.lh !== undefined && r.lh !== null) {
      if (typeof r.lh !== 'boolean') return { ok: false, error: `Invalid LH value on ${k}.` }
      if (r.lh) out.lh = true
    }
    if (r.pe !== undefined && r.pe !== null) {
      if (typeof r.pe !== 'boolean') return { ok: false, error: `Invalid period-end value on ${k}.` }
      if (r.pe) out.pe = true
    }
    if (r.s !== undefined && r.s !== null) {
      if (!Array.isArray(r.s) || !r.s.every(isSymptomKey)) return { ok: false, error: `Unknown symptom on ${k}.` }
      const s = canonicalSymptoms(r.s)
      if (s.length) out.s = s
    }
    if (r.m !== undefined && r.m !== null) {
      if (!isMood(r.m)) return { ok: false, error: `Invalid mood on ${k} (must be 1–5).` }
      out.m = r.m
    }
    if (Object.keys(out).length) days[k] = out
  }

  const kept = Object.keys(days).sort()
  // Replacing real data with nothing is almost certainly a mistake (wrong file), so refuse.
  if (!kept.length) return { ok: false, error: 'This backup contains no logged days.' }
  return { ok: true, days, summary: { count: kept.length, first: kept[0], last: kept[kept.length - 1] } }
}
