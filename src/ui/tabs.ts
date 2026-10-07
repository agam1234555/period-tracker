import type { ReactElement } from 'react'
import { IconCalendar, IconInsights, IconMore, IconToday } from './Icons'

export type Tab = 'today' | 'calendar' | 'insights' | 'more'
export const TABS: { id: Tab; label: string; icon: () => ReactElement }[] = [
  { id: 'today', label: 'Today', icon: IconToday },
  { id: 'calendar', label: 'Calendar', icon: IconCalendar },
  { id: 'insights', label: 'Insights', icon: IconInsights },
  { id: 'more', label: 'More', icon: IconMore },
]
