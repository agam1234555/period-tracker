// What to show on a calendar day cell, and its screen-reader label. Pure.
import type { DayRecord } from '../engine/analyze'

export interface Marks { period: boolean; flow: 0 | 1 | 2 | 3; symptoms: number; mood: boolean; temp: boolean; lh: boolean }

export function dayMarks(r: DayRecord | undefined): Marks {
  const flow = r?.p && (r.f === 1 || r.f === 2 || r.f === 3) ? r.f : 0
  return { period: !!r?.p, flow, symptoms: Array.isArray(r?.s) ? r.s.length : 0, mood: r?.m != null, temp: r?.t != null, lh: !!r?.lh }
}

export interface DayContext { today?: boolean; expected?: boolean; predicted?: boolean; fertile?: boolean; ovulation?: boolean }

/** e.g. "Oct 6, today, period, heavy flow, 2 symptoms, mood logged". */
export function dayAriaLabel(dateLabel: string, r: DayRecord | undefined, ctx: DayContext = {}): string {
  const m = dayMarks(r)
  const parts = [dateLabel]
  if (ctx.today) parts.push('today')
  if (m.period) parts.push('period' + (m.flow ? `, ${['light', 'medium', 'heavy'][m.flow - 1]} flow` : ''))
  else if (ctx.expected) parts.push('period expected')
  else if (ctx.predicted) parts.push('predicted period')
  else if (ctx.fertile) parts.push('estimated fertile window')
  if (ctx.ovulation) parts.push('estimated ovulation')
  if (m.symptoms) parts.push(`${m.symptoms} symptom${m.symptoms === 1 ? '' : 's'}`)
  if (m.mood) parts.push('mood logged')
  if (m.temp) parts.push('temperature logged')
  if (m.lh) parts.push('LH test positive')
  return parts.join(', ')
}
