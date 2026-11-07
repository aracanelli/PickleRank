import { describe, it, expect } from 'vitest'
import type { MatchHistoryEntryDto } from '@/app/core/models/dto'
import { filtersFromQuery, filtersToQuery, historyOptions, hasFilters, groupByEvent, outcomeFor } from './historyView'

const m = (over: Partial<MatchHistoryEntryDto>): MatchHistoryEntryDto => ({
  gameId: 'g', eventId: 'e1', eventName: 'Week 1', date: '2026-10-01T18:00:00Z', roundIndex: 0, courtIndex: 0,
  team1: ['Ann', 'Bo'], team2: ['Cy', 'Di'], team1Ids: ['a', 'b'], team2Ids: ['c', 'd'],
  scoreTeam1: 11, scoreTeam2: 7, result: 'TEAM1_WIN', ...over
})

describe('history filters', () => {
  it('reads the query, ignoring a second player without a first', () => {
    expect(filtersFromQuery({ secondaryPlayerId: 'x', relationship: 'opponent' })).toEqual({
      eventId: '', playerId: '', secondaryPlayerId: '', relationship: 'opponent'
    })
    expect(filtersFromQuery({ playerId: 'p', secondaryPlayerId: 'x', eventId: 'e', relationship: 'bogus' })).toEqual({
      eventId: 'e', playerId: 'p', secondaryPlayerId: 'x', relationship: 'teammate'
    })
    expect(filtersFromQuery({ playerId: ['p'] }).playerId).toBe('')
  })

  it('writes only meaningful values back', () => {
    expect(filtersToQuery({ eventId: '', playerId: '', secondaryPlayerId: 'x', relationship: 'opponent' })).toEqual({})
    expect(filtersToQuery({ eventId: '', playerId: 'p', secondaryPlayerId: 'p', relationship: 'opponent' })).toEqual({ playerId: 'p' })
    expect(filtersToQuery({ eventId: 'e', playerId: 'p', secondaryPlayerId: 'x', relationship: 'opponent' })).toEqual({
      eventId: 'e', playerId: 'p', secondaryPlayerId: 'x', relationship: 'opponent'
    })
  })

  it('builds api options and detects active filters', () => {
    const f = filtersFromQuery({ playerId: 'p', secondaryPlayerId: 'x' })
    expect(historyOptions(f)).toEqual({ eventId: undefined, playerId: 'p', secondaryPlayerId: 'x', relationship: 'teammate' })
    expect(hasFilters(f)).toBe(true)
    expect(hasFilters(filtersFromQuery({}))).toBe(false)
  })
})

describe('groupByEvent', () => {
  it('groups newest event first with games in round and court order', () => {
    const groups = groupByEvent([
      m({ gameId: 'old', eventId: 'e0', date: '2026-09-01T18:00:00Z' }),
      m({ gameId: 'r1c2', roundIndex: 1, courtIndex: 1 }),
      m({ gameId: 'r0c1', roundIndex: 0, courtIndex: 1 }),
      m({ gameId: 'r1c1', roundIndex: 1, courtIndex: 0 })
    ])
    expect(groups.map(g => g.id)).toEqual(['e1', 'e0'])
    expect(groups[0].matches.map(x => x.gameId)).toEqual(['r0c1', 'r1c1', 'r1c2'])
    expect(groups[0].name).toBe('Week 1')
  })
})

describe('outcomeFor', () => {
  it('reports the filtered player result', () => {
    expect(outcomeFor(m({}), 'Ann')).toBe('won')
    expect(outcomeFor(m({}), 'Cy')).toBe('lost')
    expect(outcomeFor(m({ result: 'TIE' }), 'Cy')).toBe('tied')
    expect(outcomeFor(m({}), 'Zed')).toBeNull()
    expect(outcomeFor(m({}), '')).toBeNull()
    expect(outcomeFor(m({ result: 'UNSET' }), 'Ann')).toBeNull()
  })
})
