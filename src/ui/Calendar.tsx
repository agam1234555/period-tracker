import type { DayRecord, Days } from '../engine/analyze'
import { isoDay } from '../engine/analyze'
import { useRef } from 'react'
import { dayAriaLabel, dayMarks } from './dayMarks'
import { swipeMonth } from './swipe'
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

  const touch = useRef<{ x: number; y: number } | null>(null)

  const cls = (n: number) => {
    const r: DayRecord | undefined = days[isoDay(n)]
    const c = ['day']
    if (r?.p) { c.push('period'); const fl = dayMarks(r).flow; if (fl) c.push('fl' + fl) }
    else if (expected?.includes(n)) c.push('exp')
    else if (f && n >= f.rangeLo && n <= f.rangeHi && n >= today) c.push('predicted')
    else if (f && n >= f.fertileFrom && n <= f.fertileTo) c.push('fertile')
    if (f && n === f.ovulation) c.push('ov')
    if (n === today) c.push('today')
    if (n === sel) c.push('sel')
    return c.join(' ')
  }

  const label = (n: number) => dayAriaLabel(
    new Date(n * 864e5).toLocaleDateString(undefined, { month: 'long', day: 'numeric', timeZone: 'UTC' }),
    days[isoDay(n)],
    {
      today: n === today,
      expected: !!expected?.includes(n),
      predicted: !!f && n >= f.rangeLo && n <= f.rangeHi && n >= today,
      fertile: !!f && n >= f.fertileFrom && n <= f.fertileTo,
      ovulation: !!f && n === f.ovulation,
    },
  )

  return (
    <section className="card cal">
      <div className="nav">
        <button className="link" onClick={() => step(-1)} aria-label="Previous month">‹</button>
        <strong>{MONTHS[view.m]} {view.y}</strong>
        <button className="link" onClick={() => step(1)} aria-label="Next month">›</button>
      </div>
      <div className="grid"
        onTouchStart={(e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY } }}
        onTouchEnd={(e) => {
          const s0 = touch.current; touch.current = null
          if (!s0) return
          const t = e.changedTouches[0]
          const dir = swipeMonth(t.clientX - s0.x, t.clientY - s0.y)
          if (dir) step(dir)
        }}>
        {['M','T','W','T','F','S','S'].map((d, i) => <div key={i} className="lbl dow">{d}</div>)}
        {cells.map((n, i) => n === null ? <div key={i} /> : (
          <button key={i} className={cls(n)} onClick={() => onSel(n)} aria-pressed={n === sel} aria-label={label(n)}>
            {new Date(n * 864e5).getUTCDate()}
            {(() => {
              const m = dayMarks(days[isoDay(n)])
              return (m.symptoms > 0 || m.mood || m.temp) && (
                <span className="marks" aria-hidden="true">
                  {m.symptoms > 0 && <i className="mk s" />}
                  {m.mood && <i className="mk m" />}
                  {m.temp && <i className="mk t" />}
                </span>
              )
            })()}
          </button>
        ))}
      </div>
      <div className="lbl legend">
        <span className="lg-item"><i className="sw period" />Period</span>
        <span className="lg-item"><i className="sw exp" />Expected</span>
        <span className="lg-item"><i className="sw predicted" />Predicted</span>
        <span className="lg-item"><i className="sw fertile" />Fertile</span>
        <span className="lg-item"><i className="sw ov" />Ovulation</span>
      </div>
      <div className="lbl legend">
        <span className="lg-item"><i className="mk s" />Symptoms</span>
        <span className="lg-item"><i className="mk m" />Mood</span>
        <span className="lg-item"><i className="mk t" />Temperature</span>
      </div>
      <div className="lbl">Darker red on a period day means heavier flow.</div>
    </section>
  )
}
