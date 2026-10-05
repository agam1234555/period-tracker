import { todayDayNum } from '../engine/analyze'

/** Milliseconds remaining until the next local midnight, with a small 50ms buffer. */
export function msUntilMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 50)
  return Math.max(50, next.getTime() - now.getTime())
}

/**
 * Subscribes to calendar date rollover via:
 * 1. Timer scheduled to fire at local midnight.
 * 2. 'visibilitychange' event when the app/tab becomes visible again after being in background.
 */
export function subscribeDateRollover(
  onChange: (today: number) => void,
  getNow: () => Date = () => new Date(),
): () => void {
  let currentToday = todayDayNum(getNow())

  const check = () => {
    const nextToday = todayDayNum(getNow())
    if (nextToday !== currentToday) {
      currentToday = nextToday
      onChange(nextToday)
    }
  }

  const onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      check()
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
  }

  let timer: ReturnType<typeof setTimeout>
  const schedule = () => {
    const ms = msUntilMidnight(getNow())
    timer = setTimeout(() => {
      check()
      schedule()
    }, ms)
  }
  schedule()

  return () => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility)
    }
    clearTimeout(timer)
  }
}
