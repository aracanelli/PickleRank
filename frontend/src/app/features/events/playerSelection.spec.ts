import { describe, it, expect } from 'vitest'
import { initialSelection, toggle, trimTo, clampCourts, clampRounds, selectionMessage } from './playerSelection'

const p = (id: string, membershipType: 'PERMANENT' | 'SUB' = 'PERMANENT') => ({ id, membershipType })

describe('playerSelection', () => {
  it('auto-selects regulars capped at courts*4', () => {
    const players = [...'abcdefghij'].map(c => p(c)).concat([p('s1', 'SUB')])
    const { courts, selected } = initialSelection(players)
    expect(courts).toBe(3)
    expect(selected.size).toBe(10)
    expect(selected.has('s1')).toBe(false)
  })
  it('caps courts at 10 with a huge roster', () => {
    const players = Array.from({ length: 50 }, (_, i) => p(`p${i}`))
    const { courts, selected } = initialSelection(players)
    expect(courts).toBe(10)
    expect(selected.size).toBe(40)
  })
  it('empty roster gives one court', () => {
    expect(initialSelection([]).courts).toBe(1)
  })
  it('toggle never exceeds the required count and does not mutate', () => {
    const s = new Set(['a', 'b', 'c', 'd'])
    const n = toggle(s, 'e', 4)
    expect(n.size).toBe(4)
    expect(n.has('e')).toBe(false)
    const m = toggle(s, 'a', 4)
    expect(m.has('a')).toBe(false)
    expect(s.has('a')).toBe(true)
  })
  it('trims when courts drop', () => {
    expect(trimTo(new Set(['a', 'b', 'c', 'd', 'e', 'f']), 4)).toEqual(new Set(['a', 'b', 'c', 'd']))
  })
  it('clamps courts 1–10 and rounds 1–20', () => {
    expect(clampCourts(0)).toBe(1)
    expect(clampCourts(11)).toBe(10)
    expect(clampRounds(0)).toBe(1)
    expect(clampRounds(25)).toBe(20)
  })
  it('messages', () => {
    expect(selectionMessage(6, 8)).toBe('6 of 8 players selected. Add 2 more.')
    expect(selectionMessage(8, 8)).toBe('8 of 8 players selected. Ready.')
  })
})
