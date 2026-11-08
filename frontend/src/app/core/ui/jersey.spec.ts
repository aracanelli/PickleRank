import { describe, it, expect } from 'vitest'
import { jerseyFor, initialsOf, JERSEY_COUNT } from './jersey'

describe('jersey', () => {
  it('is stable and in range', () => {
    expect(jerseyFor('p1')).toBe(jerseyFor('p1'))
    for (const s of ['a', 'Ana Ruiz', 'gp_123', '']) {
      const j = jerseyFor(s)
      expect(j).toBeGreaterThanOrEqual(1)
      expect(j).toBeLessThanOrEqual(JERSEY_COUNT)
    }
  })
  it('makes initials', () => {
    expect(initialsOf('Ana Ruiz')).toBe('AR')
    expect(initialsOf('Mary Jo de la Cruz')).toBe('MC')
    expect(initialsOf('cher')).toBe('CH')
    expect(initialsOf('  ')).toBe('?')
  })
})
