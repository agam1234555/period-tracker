import { useState } from 'react'
import type { Days } from '../engine/analyze'
import { tap } from './haptics'
import { endPeriod, startPeriod, type Change, type InProgress } from '../periodLogging'

const fmt = (n: number) => new Date(n * 864e5).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

interface Props { days: Days; today: number; sel: number; ongoing: InProgress | null; onApply: (changes: Change[]) => void }

export function PeriodBar({ days, today, sel, ongoing, onApply }: Props) {
  const [error, setError] = useState<string | null>(null)

  const end = (day: number) => {
    tap(14)
    const r = endPeriod(days, day)
    if (!r.ok) return setError(r.error)
    setError(null)
    onApply(r.changes)
  }
  const start = () => {
    tap(14)
    setError(null)
    onApply(startPeriod(days, sel))
  }

  if (ongoing) {
    const canEndSel = sel !== today && sel >= ongoing.start && sel < today
    return (
      <section className="card pbar">
        <div className="lbl">Period in progress</div>
        <div className="big">Day {ongoing.dayNumber}</div>
        <p className="lbl">
          {ongoing.expectedDays.length > 0
            ? `Usually about ${ongoing.expectedLen} days. Dashed days on the calendar are expected, not saved.`
            : `Past your usual ${ongoing.expectedLen} days. Tap below when it ends.`}
        </p>
        <div className="stack">
          <button className="primary" onClick={() => end(today)}>Period ended today</button>
          {canEndSel && <button className="secondary" onClick={() => end(sel)}>It ended on {fmt(sel)}</button>}
        </div>
        {error && <div role="alert" className="err">{error}</div>}
      </section>
    )
  }
  const future = sel > today
  return (
    <section className="card pbar">
      <button className="primary" disabled={future} onClick={start}>
        {sel === today ? 'Period started today' : `Period started ${fmt(sel)}`}
      </button>
      {future && <p className="lbl">Pick today or an earlier day on the calendar.</p>}
      {error && <div role="alert" className="err">{error}</div>}
    </section>
  )
}
