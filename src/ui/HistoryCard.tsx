import { useState } from 'react'
import { barPct, chartBars, MAX_CYCLE, MIN_CYCLE, type CycleRow, type History } from '../history'

const fmt = (n: number) => new Date(n * 864e5).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
const SHOW = 6

function rowText(r: CycleRow): { title: string; sub: string } {
  if (r.inProgress) return { title: `${fmt(r.start)} – now`, sub: `Current cycle, day ${r.dayNumber}` }
  const sub = [`Period ${r.periodLen} day${r.periodLen === 1 ? '' : 's'}`]
  if (r.tag?.kind === 'longer') sub.push(`${r.tag.days} days longer than your usual`)
  if (r.tag?.kind === 'shorter') sub.push(`${r.tag.days} days shorter than your usual`)
  if (r.tag?.kind === 'gap') sub.push(`not counted (usually means missed logging)`)
  return { title: `${fmt(r.start)} – ${fmt((r.end as number) - 1)}`, sub: sub.join(' · ') }
}

export function HistoryCard({ history: h }: { history: History }) {
  const [all, setAll] = useState(false)
  const bars = chartBars(h)

  if (h.rows.length === 0) return <section className="card hist"><div className="lbl">Your cycles</div><p>Log a period to start your history.</p></section>

  const shown = all ? h.rows : h.rows.slice(0, SHOW)
  return (
    <section className="card hist">
      <div className="lbl">Your cycles</div>
      {h.counted === 0 ? (
        <p>Your first completed cycle will appear after your next period starts.</p>
      ) : (
        <>
          <div className="stats">
            <div><b>{Math.round(h.avgCycle as number)}</b><span className="lbl">days average cycle</span></div>
            <div><b>{h.shortest === h.longest ? h.shortest : `${h.shortest}–${h.longest}`}</b><span className="lbl">days range</span></div>
            <div><b>{h.avgPeriod === null ? '–' : Math.round(h.avgPeriod)}</b><span className="lbl">days average period</span></div>
          </div>
          <div className="bars" role="img" aria-label={`Cycle lengths in days, oldest to newest: ${bars.values.join(', ')}`}>
            {bars.values.map((v, i) => (
              <div key={i} className="barcol">
                <span className="lbl">{v}</span>
                <div className="bar" style={{ height: `${barPct(v, bars.top)}%` }} />
              </div>
            ))}
          </div>
          <p className="lbl">Based on your {h.counted} logged cycle{h.counted === 1 ? '' : 's'}. The forecast also blends in typical cycles until you have about 6, so its numbers can differ slightly.</p>
        </>
      )}
      <ul className="cycles">
        {shown.map((r) => {
          const t = rowText(r)
          return (
            <li key={r.start} className={r.counted || r.inProgress ? '' : 'dim'}>
              <div><strong>{t.title}</strong><div className="lbl">{t.sub}</div></div>
              {r.length !== null && <span className="len">{r.length} days</span>}
            </li>
          )
        })}
      </ul>
      {h.rows.length > SHOW && <button className="link" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${h.rows.length}`}</button>}
      <small>Cycles under {MIN_CYCLE} or over {MAX_CYCLE} days are listed but not counted in the averages.</small>
    </section>
  )
}
