// IndexedDB storage via Dexie. All data stays on the device.
import Dexie, { type EntityTable } from 'dexie'
import type { DayRecord, Days } from './engine/analyze'

export interface DayRow extends DayRecord {
  date: string // 'YYYY-MM-DD' (primary key)
}
export interface MetaRow {
  key: string
  value: unknown
}

export const db = new Dexie('cycle') as Dexie & {
  days: EntityTable<DayRow, 'date'>
  meta: EntityTable<MetaRow, 'key'>
}
db.version(1).stores({ days: 'date', meta: 'key' })

export async function loadDays(): Promise<Days> {
  const out: Days = {}
  for (const { date, ...rest } of await db.days.toArray()) out[date] = rest
  return out
}

const clean = (rec: DayRecord) =>
  Object.fromEntries(Object.entries(rec).filter(([, v]) => v !== undefined && v !== null && v !== false && v !== 0 && v !== '' && !(Array.isArray(v) && v.length === 0)))

/** Save several days in ONE transaction (all or nothing). An empty record deletes that day's row. */
export async function saveDays(changes: { date: string; next: DayRecord }[]): Promise<void> {
  await db.transaction('rw', db.days, async () => {
    for (const { date, next } of changes) {
      const c = clean(next)
      if (Object.keys(c).length === 0) await db.days.delete(date)
      else await db.days.put({ ...c, date })
    }
  })
}

/** Save one day. An empty record (no fields set) deletes the row. */
export const saveDay = (date: string, rec: DayRecord): Promise<void> => saveDays([{ date, next: rec }])

/** Replace ALL stored days with `days`. One transaction: if anything fails, the old data is kept. */
export async function replaceAllDays(days: Days): Promise<void> {
  const rows: DayRow[] = Object.entries(days).map(([date, rec]) => ({ ...rec, date }))
  await db.transaction('rw', db.days, async () => {
    await db.days.clear()
    await db.days.bulkPut(rows)
  })
}

const LAST_BACKUP_KEY = 'lastBackupAt'
/** ISO timestamp of the last successful backup DOWNLOAD (restores do not count), or null. */
export async function getLastBackupAt(): Promise<string | null> {
  const row = await db.meta.get(LAST_BACKUP_KEY)
  return typeof row?.value === 'string' ? row.value : null
}
export async function setLastBackupAt(iso: string): Promise<void> {
  await db.meta.put({ key: LAST_BACKUP_KEY, value: iso })
}
