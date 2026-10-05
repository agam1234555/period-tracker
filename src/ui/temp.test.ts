import { describe, expect, it } from 'vitest'
import { parseTemp, TEMP_ERROR } from './temp'

describe('basal temperature validation', () => {
  it('accepts plausible values, including boundaries and decimal comma', () => {
    expect(parseTemp('36.45')).toEqual({ kind: 'ok', value: 36.45 })
    expect(parseTemp('36,45')).toEqual({ kind: 'ok', value: 36.45 })
    expect(parseTemp(' 34 ')).toEqual({ kind: 'ok', value: 34 })
    expect(parseTemp('42')).toEqual({ kind: 'ok', value: 42 })
  })
  it('treats blank input as clearing the value, not as an error', () => {
    expect(parseTemp('')).toEqual({ kind: 'empty' })
    expect(parseTemp('   ')).toEqual({ kind: 'empty' })
  })
  it('rejects out-of-range values (e.g. Fahrenheit by mistake)', () => {
    for (const t of ['33.9', '42.1', '98.6', '0', '-36']) expect(parseTemp(t)).toEqual({ kind: 'invalid' })
  })
  it('rejects non-numeric and partially numeric text', () => {
    for (const t of ['abc', '36.5abc', '36..5', 'NaN', 'Infinity']) expect(parseTemp(t)).toEqual({ kind: 'invalid' })
  })
  it('message text is the specified one', () => {
    expect(TEMP_ERROR).toBe('Enter 34–42 °C')
  })
})
