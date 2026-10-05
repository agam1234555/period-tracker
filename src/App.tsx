import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { loadDays, saveDays } from './db'
import { isoDay, todayDayNum, type DayRecord, type Days } from './engine/analyze'
import { forecast } from './engine/forecast'
import { computeInsights } from './insights'
import { periodInProgress, type Change } from './periodLogging'
import { ForecastCard } from './ui/ForecastCard'
import { PeriodBar } from './ui/PeriodBar'
import { Calendar, type View } from './ui/Calendar'
import { DayEditor } from './ui/DayEditor'
import { InsightsCard } from './ui/InsightsCard'
import { BackupPanel } from './ui/BackupPanel'
import { subscribeDateRollover } from './ui/today'

const NO_DAYS: Days = {} // stable reference while the first query loads

export default function App() {
  const [today, setToday] = useState(() => todayDayNum())

  useEffect(() => {
    return subscribeDateRollover(setToday)
  }, [])
  // Live query: any write (including undo) re-renders and recomputes the forecast.
  const days: Days = useLiveQuery(loadDays, [], NO_DAYS)
  const f = useMemo(() => forecast(days, today), [days, today])
  const insights = useMemo(() => computeInsights(days), [days])
  const ongoing = useMemo(() => periodInProgress(days, today), [days, today])

  const t = new Date(today * 864e5)
  const [view, setView] = useState<View>({ y: t.getUTCFullYear(), m: t.getUTCMonth() })
  const [sel, setSel] = useState(today)
  // One-level undo; a single action can touch several days (e.g. "Period ended"), so it stores them all.
  const [last, setLast] = useState<Change[] | null>(null)

  const apply = async (changes: Change[]) => {
    if (!changes.length) return
    setLast(changes.map((c) => ({ date: c.date, next: (days[c.date] ?? {}) as DayRecord })))
    await saveDays(changes)
  }
  const undo = async () => {
    if (!last) return
    await saveDays(last) // an empty record deletes the row
    setLast(null)
  }

  return (
    <main>
      <header>
        <h1>Cycle</h1>
        <span className="lbl">{last ? <button className="link" onClick={undo}>Undo last change</button> : 'On this device only'}</span>
      </header>
      <ForecastCard f={f} />
      <PeriodBar days={days} today={today} sel={sel} ongoing={ongoing} onApply={apply} />
      <Calendar view={view} days={days} f={f} today={today} sel={sel} expected={ongoing?.expectedDays} onSel={setSel} onView={setView} />
      <DayEditor day={sel} today={today} log={days[isoDay(sel)]} onChange={(date, next) => apply([{ date, next }])} />
      <InsightsCard insights={insights} />
      <BackupPanel onRestored={() => setLast(null)} />
    </main>
  )
}
