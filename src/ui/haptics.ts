// Tiny tap feedback. Works on Android browsers/PWAs (Vibration API); silently does nothing elsewhere (iOS, desktop, tests).
export function tap(ms = 8): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms)
  } catch { /* some browsers throw when vibration is blocked */ }
}
