import { describe, it, expect } from 'vitest'
import { ratingSeries, signed } from './ratingSeries'

describe('ratingSeries', () => {
  it('is empty without history', () => {
    expect(ratingSeries([])).toEqual([])
  })
  it('sorts oldest first and prepends the starting rating', () => {
    const s = ratingSeries([
      { rating: 1030, createdAt: '2026-02-10T20:00:00Z', delta: 10, eventId: 'e2', eventName: 'Week 2' },
      { rating: 1020, createdAt: '2026-02-03T20:00:00Z', delta: 20, eventId: 'e1', eventName: 'Week 1' }
    ])
    expect(s.map(p => p.rating)).toEqual([1000, 1020, 1030])
    expect(s[0].start).toBe(true)
    expect(s[1].eventId).toBe('e1')
    expect(s[2].title.startsWith('Week 2, ')).toBe(true)
  })
})

describe('signed', () => {
  it('formats changes with a sign', () => {
    expect(signed(12.34)).toBe('+12.3')
    expect(signed(-4)).toBe('−4.0')
    expect(signed(0.01)).toBe('0.0')
    expect(signed(-0.04)).toBe('0.0')
  })
})
