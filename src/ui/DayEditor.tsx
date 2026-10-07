import { useEffect, useState } from 'react'
import { isoDay, type DayRecord } from '../engine/analyze'
import { parseTemp, TEMP_ERROR } from './temp'
import { Chip } from './Chip'
import { tap } from './haptics'
import { SymptomPicker } from './SymptomPicker'
import { symptomSummary } from '../symptoms'

interface Props { day: number; today: number; log: DayRecord | undefined; onChange: (date: string, next: DayRecord) => void }

export function DayEditor({ day, today, log, onChange }: Props) {
  const date = isoDay(day)
  const [temp, setTemp] = useState('')
  const [tempError, setTempError] = useState(false)
  useEffect(() => {
    setTemp(log?.t != null ? String(log.t) : '')
    setTempError(false)
  }, [date, log?.t])
  // Collapsible sections. `null` = automatic (optional section opens when that day has data); a tap pins the choice.
  const [symPref, setSymPref] = useState<boolean | null>(null)
  const [optPref, setOptPref] = useState<boolean | null>(null)
  const hasOptional = log?.t != null || !!log?.lh
  const symOpen = symPref ?? false
  const optOpen = optPref ?? hasOptional
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
      <div className="lbl daylabel">{new Date(day * 864e5).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}{future && ' (future)'}</div>
      <div className="row">
        <label className="switch"><span>Period</span><input type="checkbox" role="switch" checked={!!log?.p} disabled={future} onChange={(e) => { tap(); set({ p: e.target.checked ? 1 : 0, ...(e.target.checked ? {} : { f: undefined, pe: undefined }) }) }} /><i aria-hidden="true" /></label>
      </div>
      {log?.p ? (
        <div className="row">Flow:
          {([1, 2, 3] as const).map((v) => (
            <Chip key={v} on={log.f === v} onClick={() => set({ f: log.f === v ? undefined : v })}>{['Light', 'Medium', 'Heavy'][v - 1]}</Chip>
          ))}
        </div>
      ) : null}
      <details className="fold" open={symOpen} onToggle={(e) => { if (e.currentTarget.open !== symOpen) setSymPref(e.currentTarget.open) }}>
        <summary><span>Symptoms &amp; mood</span><span className="lbl">{symptomSummary(log?.s, log?.m)}</span></summary>
        <SymptomPicker symptoms={log?.s} mood={log?.m} disabled={future}
          onSymptoms={(next) => set({ s: next.length ? next : undefined })} onMood={(m) => set({ m })} />
      </details>
      <details className="fold" open={optOpen} onToggle={(e) => { if (e.currentTarget.open !== optOpen) setOptPref(e.currentTarget.open) }}>
        <summary><span>Optional: temperature &amp; LH test</span><span className="lbl">{[log?.t != null ? `${log.t} °C` : '', log?.lh ? 'LH positive' : ''].filter(Boolean).join(' · ') || 'Most people skip this'}</span></summary>
        <label className="check">Basal temp (°C) <input inputMode="decimal" value={temp} disabled={future} aria-invalid={tempError} aria-describedby={tempError ? 'temp-err' : undefined}
          onChange={(e) => { setTemp(e.target.value); setTempError(false) }} onBlur={commitTemp} placeholder="36.45" /></label>
        {tempError && <div id="temp-err" role="alert" className="err">{TEMP_ERROR}</div>}
        <label className="switch"><span>Positive LH test</span><input type="checkbox" role="switch" checked={!!log?.lh} disabled={future} onChange={(e) => { tap(); set({ lh: e.target.checked }) }} /><i aria-hidden="true" /></label>
      </details>
    </section>
  )
}
