import { useState } from 'react'
import { isoDay } from '../engine/analyze'
import type { Change } from '../periodLogging'
import { SETUP_DEFAULT_LEN, setupChanges, validateSetup } from '../setup'
import { Chip } from './Chip'
import { tap } from './haptics'

const LENGTHS = [3, 4, 5, 6, 7, 8] as const
const LABELS = ['Most recent period started', 'The one before that (optional)', 'And the one before that (optional)']

interface Props { today: number; onApply: (changes: Change[]) => void; onSkip: () => void }

export function SetupCard({ today, onApply, onSkip }: Props) {
  const [dates, setDates] = useState(['', '', ''])
  const [len, setLen] = useState<number>(SETUP_DEFAULT_LEN)
  const [error, setError] = useState<string | null>(null)
  const max = isoDay(today)

  const submit = () => {
    const r = validateSetup(dates, len, today)
    if (!r.ok) return setError(r.error)
    setError(null)
    tap(14)
    onApply(setupChanges(r.starts, len, today))
  }

  return (
    <section className="card setup">
      <div className="big">Get your forecast started</div>
      <p>Add when your last periods started. The more you add, the better the first forecast. You can skip this and log as you go.</p>
      {LABELS.map((label, i) => (
        <label key={label} className="field">
          <span className="lbl">{label}</span>
          <input type="date" max={max} value={dates[i]} onChange={(e) => { setDates(dates.map((d, k) => (k === i ? e.target.value : d))); setError(null) }} />
        </label>
      ))}
      <div className="lbl">Usual period length (days)</div>
      <div className="group" role="radiogroup" aria-label="Usual period length">
        {LENGTHS.map((n) => <Chip key={n} role="radio" on={len === n} onClick={() => setLen(n)}>{n}</Chip>)}
      </div>
      {error && <div role="alert" className="err">{error}</div>}
      <div className="pbar">
        <div className="stack">
          <button className="primary" onClick={submit}>Create my forecast</button>
          <button className="secondary" onClick={onSkip}>Skip for now</button>
        </div>
      </div>
    </section>
  )
}
