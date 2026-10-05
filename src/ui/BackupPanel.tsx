import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { backupStatus } from '../backupReminder'
import { backupFilename, exportBackup, validateBackup, type BackupSummary } from '../backup'
import { db, getLastBackupAt, loadDays, replaceAllDays, setLastBackupAt } from '../db'
import type { Days } from '../engine/analyze'

type Pending = { days: Days; summary: BackupSummary; currentCount: number }

export function BackupPanel({ onRestored }: { onRestored: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // The clock lives in state (refreshed when the app returns to the foreground) so rendering stays pure.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') setNow(new Date()) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
  // undefined while loading (no nudge flash), null = never backed up
  const lastBackupAt = useLiveQuery(getLastBackupAt, [])
  const dayCount = useLiveQuery(() => db.days.count(), [])
  const status = lastBackupAt === undefined || dayCount === undefined ? null : backupStatus(lastBackupAt, dayCount, now)

  const download = async () => {
    const now = new Date()
    const blob = new Blob([exportBackup(await loadDays(), now)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = backupFilename(now)
    a.click()
    await setLastBackupAt(now.toISOString())
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMsg({ kind: 'ok', text: 'Backup downloaded. Keep it somewhere safe (cloud drive, email to yourself).' })
  }

  const choose = async (file: File | undefined) => {
    setMsg(null)
    setPending(null)
    if (!file) return
    const r = validateBackup(await file.text())
    if (fileRef.current) fileRef.current.value = '' // allow choosing the same file again
    if (!r.ok) return setMsg({ kind: 'err', text: r.error })
    setPending({ days: r.days, summary: r.summary, currentCount: Object.keys(await loadDays()).length })
  }

  const confirm = async () => {
    if (!pending) return
    try {
      await replaceAllDays(pending.days)
      onRestored()
      setMsg({ kind: 'ok', text: `Restored ${pending.summary.count} days.` })
    } catch {
      setMsg({ kind: 'err', text: 'Restore failed. Your existing data was not changed.' })
    }
    setPending(null)
  }

  return (
    <section className="card">
      <div className="lbl">Backup{status && ` · ${status.label}`}</div>
      {status?.nudge && <div role="status" className="warn">Your data lives only on this device. Download a backup so a lost or reset phone doesn’t erase your history.</div>}
      <div className="row">
        <button className="chip" onClick={download}>Download backup</button>
        <button className="chip" onClick={() => fileRef.current?.click()}>Restore from file…</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => choose(e.target.files?.[0])} />
      </div>
      {pending && (
        <div role="alertdialog" aria-label="Confirm restore">
          <p>
            Replace the <strong>{pending.currentCount}</strong> days on this device with <strong>{pending.summary.count}</strong> days from the backup
            ({pending.summary.first} to {pending.summary.last})? Current data will be lost and this can’t be undone.
          </p>
          <div className="row">
            <button className="chip on" onClick={confirm}>Replace</button>
            <button className="chip" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <div role={msg.kind === 'err' ? 'alert' : 'status'} className={msg.kind === 'err' ? 'err' : 'lbl'}>{msg.text}</div>}
    </section>
  )
}
