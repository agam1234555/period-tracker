import type { DayRecord, Days } from '../engine/analyze'
import { isoDay } from '../engine/analyze'
import type { Forecast } from '../engine/forecast'

export interface View { y: number; m: number }
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

interface Props { view: View; days: Days; f: Forecast | null; today: number; sel: number; expected?: number[]; onSel: (d: number) => void; onView: (v: View) => void }

export function Calendar({ view, days, f, today, sel, expected, onSel, onView }: Props) {
  const first = Date.UTC(view.y, view.m, 1) / 864e5
  const dim = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate()
  const lead = (new Date(first * 864e5).getUTCDay() + 6) % 7 // Monday first
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => first + i)]
  const step = (d: number) => { const t = new Date(Date.UTC(view.y, view.m + d, 1)); onView({ y: t.getUTCFullYear(), m: t.getUTCMonth() }) }

  const cls = (n: number) => {
    const r: DayRecord | undefined = days[isoDay(n)]
    const c = ['day']
    if (r?.p) c.push('period')
    else if (expected?.includes(n)) c.push('exp')
    else if (f && n >= f.rangeLo && n <= f.rangeHi && n >= today) c.push('predicted')
    else if (f && n >= f.fertileFrom && n <= f.fertileTo) c.push('fertile')
    if (f && n === f.ovulation) c.push('ov')
    if (n === today) c.push('today')
    if (n === sel) c.push('sel')
    return c.join(' ')
  }

  return (
    <section className="card">
      <div className="nav">
        <button className="link" onClick={() => step(-1)} aria-label="Previous month">‹</button>
        <strong>{MONTHS[view.m]} {view.y}</strong>
        <button className="link" onClick={() => step(1)} aria-label="Next month">›</button>
      </div>
      <div className="grid">
        {['M','T','W','T','F','S','S'].map((d, i) => <div key={i} className="lbl dow">{d}</div>)}
        {cells.map((n, i) => n === null ? <div key={i} /> : (
          <button key={i} className={cls(n)} onClick={() => onSel(n)}>
            {new Date(n * 864e5).getUTCDate()}
            {days[isoDay(n)]?.t != null && <i className="dot" />}
          </button>
        ))}
      </div>
      <div className="lbl legend"><span className="sw period" />Period <span className="sw exp" />Expected <span className="sw predicted" />Predicted <span className="sw fertile" />Fertile <span className="sw ov" />Ovulation</div>
    </section>
  )
}
