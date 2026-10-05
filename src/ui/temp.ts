// Basal temperature input validation (deg C). Pure, so it is testable without a DOM.
export const TEMP_MIN = 34
export const TEMP_MAX = 42
export const TEMP_ERROR = `Enter ${TEMP_MIN}–${TEMP_MAX} °C`

export type TempParse = { kind: 'empty' } | { kind: 'ok'; value: number } | { kind: 'invalid' }

/** Accepts "36.45" or "36,45" (decimal comma). Anything else, or out of range, is invalid. */
export function parseTemp(text: string): TempParse {
  const s = text.trim().replace(',', '.')
  if (s === '') return { kind: 'empty' }
  const v = Number(s)
  if (!Number.isFinite(v) || v < TEMP_MIN || v > TEMP_MAX) return { kind: 'invalid' }
  return { kind: 'ok', value: v }
}
