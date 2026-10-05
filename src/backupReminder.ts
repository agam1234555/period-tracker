// Backup reminder: pure rules, no DOM / storage / clock access (the caller passes `now`).
export const REMIND_MIN_DAYS = 14   // don't nag until there is something worth losing
export const REMIND_AFTER_DAYS = 30 // nudge when the last backup is older than this (or there is none)

/** Local calendar-day number (DST-safe, same convention as todayDayNum). */
const localDay = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5

/** Whole local calendar days since the last backup; null if never (or the stored value is unreadable). Never negative. */
export function daysSinceBackup(lastBackupAt: string | null | undefined, now: Date): number | null {
  if (!lastBackupAt) return null
  const t = new Date(lastBackupAt)
  if (Number.isNaN(t.getTime())) return null
  return Math.max(0, localDay(now) - localDay(t))
}

export interface BackupStatus { label: string; nudge: boolean }

export function backupStatus(lastBackupAt: string | null | undefined, dayCount: number, now: Date): BackupStatus {
  const d = daysSinceBackup(lastBackupAt, now)
  const label = d === null ? 'Last backup: never' : d === 0 ? 'Last backup: today' : d === 1 ? 'Last backup: yesterday' : `Last backup: ${d} days ago`
  const stale = d === null || d > REMIND_AFTER_DAYS
  return { label, nudge: dayCount >= REMIND_MIN_DAYS && stale }
}
