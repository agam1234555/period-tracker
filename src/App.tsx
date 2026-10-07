import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { loadDays, saveDays } from './db'
import { isoDay, todayDayNum, type DayRecord, type Days } from './engine/analyze'
import { forecast } from './engine/forecast'
import { computeInsights } from './insights'
import { computeHistory } from './history'
import { periodInProgress, type Change } from './periodLogging'
import { ForecastCard } from './ui/ForecastCard'
import { PeriodBar } from './ui/PeriodBar'
import { Calendar, type View } from './ui/Calendar'
import { DayEditor } from './ui/DayEditor'
import { InsightsCard } from './ui/InsightsCard'
import { HistoryCard } from './ui/HistoryCard'
import { BackupPanel } from './ui/BackupPanel'
import { SetupCard } from './ui/SetupCard'
import { Sheet } from './ui/Sheet'
import { TabBar } from './ui/TabBar'
import { TABS, type Tab } from './ui/tabs'
import { subscribeDateRollover } from './ui/today'

const NO_DAYS: Days = {} // stable reference while the first query loads
const longDate = (n: number) => new Date(n * 864e5).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })

export default function App() {
  const [today, setToday] = useState(() => todayDayNum())

  useEffect(() => {
    return subscribeDateRollover(setToday)
  }, [])
  // Live query: any write (including undo) re-renders and recomputes the forecast.
  // `undefined` while the first read is in flight, so existing users never see the setup card flash up.
  const loaded = useLiveQuery(loadDays, [])
  const days: Days = loaded ?? NO_DAYS
  const f = useMemo(() => forecast(days, today), [days, today])
  const insights = useMemo(() => computeInsights(days), [days])
  const history = useMemo(() => computeHistory(days, today), [days, today])
  const ongoing = useMemo(() => periodInProgress(days, today), [days, today])

  const t = new Date(today * 864e5)
  const [tab, setTab] = useState<Tab>('today')
  const [view, setView] = useState<View>({ y: t.getUTCFullYear(), m: t.getUTCMonth() })
  const [sel, setSel] = useState(today)
  const [sheet, setSheet] = useState(false)
  const [setupSkipped, setSetupSkipped] = useState(false)
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
  const closeSheet = useCallback(() => setSheet(false), [])
  const selectTab = (next: Tab) => { setTab(next); setSheet(false); window.scrollTo?.(0, 0) }
  const onDayChange = (date: string, next: DayRecord) => apply([{ date, next }])

  return (
    <>
      <main id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <header className="title">
          <h1>{TABS.find((x) => x.id === tab)!.label}</h1>
          {last && <button className="link" onClick={undo}>Undo</button>}
        </header>

        {tab === 'today' && (
          <>
            {loaded !== undefined && Object.keys(days).length === 0 && !setupSkipped
              ? <SetupCard today={today} onApply={apply} onSkip={() => setSetupSkipped(true)} />
              : <ForecastCard f={f} />}
            <PeriodBar days={days} today={today} sel={today} ongoing={ongoing} onApply={apply} />
            <DayEditor day={today} today={today} log={days[isoDay(today)]} onChange={onDayChange} />
          </>
        )}

        {tab === 'calendar' && (
          <>
            <Calendar view={view} days={days} f={f} today={today} sel={sel} expected={ongoing?.expectedDays} onSel={(d) => { setSel(d); setSheet(true) }} onView={setView} />
            <PeriodBar days={days} today={today} sel={sel} ongoing={ongoing} onApply={apply} />
          </>
        )}

        {tab === 'insights' && (
          <>
            <HistoryCard history={history} />
            <InsightsCard insights={insights} />
          </>
        )}

        {tab === 'more' && (
          <>
            <BackupPanel onRestored={() => setLast(null)} />
            <section className="card">
              <div className="lbl">About</div>
              <p>Everything you log stays on this device. There are no accounts and nothing is sent anywhere.</p>
              <small>Predictions are estimates, not medical advice or contraception.</small>
            </section>
          </>
        )}
      </main>

      <Sheet open={sheet && tab === 'calendar'} title={longDate(sel)} onClose={closeSheet}>
        <DayEditor day={sel} today={today} log={days[isoDay(sel)]} onChange={onDayChange} />
      </Sheet>

      <TabBar tab={tab} onTab={selectTab} />
    </>
  )
}
