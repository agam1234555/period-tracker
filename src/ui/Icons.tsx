// Simple stroke icons for the tab bar (inherit colour from the button).
const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export const IconToday = () => <svg {...base}><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>
export const IconCalendar = () => <svg {...base}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>
export const IconInsights = () => <svg {...base}><path d="M5 20V11M12 20V5M19 20v-7" /></svg>
export const IconMore = () => <svg {...base}><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></svg>
