import { describe, it, expect } from 'vitest'
import { parseScore, validatePair, digitsOnly } from './scoreInput'

describe('scoreInput', () => {
  it('accepts 0 and ties', () => {
    expect(parseScore('0')).toEqual({ value: 0 })
    expect(validatePair('10', '10')).toMatchObject({ ok: true, score1: 10, score2: 10 })
  })
  it('requires both sides', () => {
    expect(validatePair('11', '')).toMatchObject({ ok: false, error2: 'Enter a score' })
  })
  it('rejects decimals, negatives and > 99', () => {
    expect(parseScore('1.5').error).toBe('Use whole numbers only')
    expect(parseScore('-1').error).toBe('Use whole numbers only')
    expect(parseScore('100').error).toBe('Scores go up to 99')
  })
  it('strips non-digits while typing', () => {
    expect(digitsOnly('1a1 ')).toBe('11')
    expect(digitsOnly('123')).toBe('12')
  })
})
