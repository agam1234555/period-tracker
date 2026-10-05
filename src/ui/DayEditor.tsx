import { useEffect, useState } from 'react'
import { isoDay, type DayRecord } from '../engine/analyze'
import { parseTemp, TEMP_ERROR } from './temp'
import { Chip } from './Chip'
import { SymptomPicker } from './SymptomPicker'

interface Props { day: number; today: number; log: DayRecord | undefined; onChange: (date: string, next: DayRecord) => void }

export function DayEditor({ day, today, log, onChange }: Props) {
  const date = isoDay(day)
  const [temp, setTemp] = useState('')
  const [tempError, setTempError] = useState(false)
  useEffect(() => {
    setTemp(log?.t != null ? String(log.t) : '')
    setTempError(false)
  }, [date, log?.t])
  const set = (patch: Partial<DayRecord>) => onChange(date, { ...(log ?? {}), ...patch })
  const future = day > today
  // Invalid text stays visible, shows a message, and is never saved.
  const commitTemp = () => {
    const r = parseTemp(temp)
    if (r.kind === 'invalid') return setTempError(true)
    setTempError(false)
    if (r.kind === 'empty') { if (log?.t != null) set({ t: null }) }
    else if (r.value !== log?.t) set({ t: r.value })
  }
  return (
    <section className="card">
      <div className="lbl">{new Date(day * 864e5).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}{future && ' (future)'}</div>
      <div className="row">
        <label><input type="checkbox" checked={!!log?.p} disabled={future} onChange={(e) => set({ p: e.target.checked ? 1 : 0, ...(e.target.checked ? {} : { f: undefined, pe: undefined }) })} /> Period</label>
        <label><input type="checkbox" checked={!!log?.lh} disabled={future} onChange={(e) => set({ lh: e.target.checked })} /> Positive LH test</label>
      </div>
      {log?.p ? (
        <div className="row">Flow:
          {([1, 2, 3] as const).map((v) => (
            <Chip key={v} on={log.f === v} onClick={() => set({ f: log.f === v ? undefined : v })}>{['Light', 'Medium', 'Heavy'][v - 1]}</Chip>
          ))}
        </div>
      ) : null}
      <SymptomPicker symptoms={log?.s} mood={log?.m} disabled={future}
        onSymptoms={(next) => set({ s: next.length ? next : undefined })} onMood={(m) => set({ m })} />
      <label>Basal temp (°C) <input inputMode="decimal" value={temp} disabled={future} aria-invalid={tempError} aria-describedby={tempError ? 'temp-err' : undefined}
        onChange={(e) => { setTemp(e.target.value); setTempError(false) }} onBlur={commitTemp} placeholder="36.45" /></label>
      {tempError && <div id="temp-err" role="alert" className="err">{TEMP_ERROR}</div>}
    </section>
  )
}
