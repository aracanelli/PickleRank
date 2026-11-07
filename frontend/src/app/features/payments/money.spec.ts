import { describe, it, expect } from 'vitest'
import { formatMoney, balanceText, balanceKind, sortBalances, parseAmount, notesError, historyAmount } from './money'
import type { SubBalanceDto } from '@/app/core/models/dto'

const b = (displayName: string, balance: number): SubBalanceDto => ({
  groupPlayerId: displayName, playerId: displayName, displayName, membershipType: 'SUB',
  totalAttendances: 0, totalCharges: 0, totalPayments: 0, balance
})

describe('money', () => {
  it('formats by currency code', () => {
    expect(formatMoney(5, 'USD')).toMatch(/5\.00/)
    expect(formatMoney(5, 'EUR')).toMatch(/€/)
    expect(formatMoney(5, 'GBP')).toMatch(/£/)
  })
  it('falls back for an unknown currency code', () => {
    expect(formatMoney(2.5, 'NOPE!')).toBe('2.50 NOPE!')
  })
  it('describes balances in words', () => {
    expect(balanceText(-5, 'USD')).toMatch(/^Owes .*5\.00$/)
    expect(balanceText(3, 'USD')).toMatch(/3\.00 credit$/)
    expect(balanceText(0, 'USD')).toBe('Paid up')
    expect(balanceKind(-0.001)).toBe('settled')
  })
  it('sorts biggest debt first, then credit, names within ties', () => {
    const out = sortBalances([b('Zed', 0), b('Amy', 4), b('Bo', -10), b('Al', -10), b('Cy', -2)])
    expect(out.map(x => x.displayName)).toEqual(['Al', 'Bo', 'Cy', 'Zed', 'Amy'])
  })
  it('validates amounts', () => {
    expect(parseAmount('12.5')).toEqual({ value: 12.5 })
    expect(parseAmount('$20')).toEqual({ value: 20 })
    expect(parseAmount('')).toHaveProperty('error')
    expect(parseAmount('0')).toHaveProperty('error')
    expect(parseAmount('-3')).toHaveProperty('error')
    expect(parseAmount('1.234')).toHaveProperty('error')
    expect(parseAmount('abc')).toHaveProperty('error')
    expect(parseAmount('10000')).toEqual({ value: 10000 })
    expect(parseAmount('10000.01')).toHaveProperty('error')
  })
  it('limits notes to 500 characters', () => {
    expect(notesError('x'.repeat(500))).toBeUndefined()
    expect(notesError('x'.repeat(501))).toBeTruthy()
  })
  it('signs history amounts in text', () => {
    expect(historyAmount(-5, 'USD')).toMatch(/^−.*5\.00$/)
    expect(historyAmount(10, 'USD')).toMatch(/^\+/)
  })
})
