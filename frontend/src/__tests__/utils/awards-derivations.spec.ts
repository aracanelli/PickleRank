import { describe, it, expect } from 'vitest'
import type {
  GroupPlayerDto,
  MatchHistoryEntryDto,
  RankingEntryDto
} from '@/app/core/models/dto'
import { computeStatAwards } from '@/app/features/awards/utils/awards-derivations'

// group-player id = `gp{n}`, global player id = `p{n}`
function player(n: number, over: Partial<GroupPlayerDto> = {}): GroupPlayerDto {
  return {
    id: `gp${n}`,
    playerId: `p${n}`,
    groupId: 'g1',
    displayName: `Player ${n}`,
    membershipType: 'PERMANENT',
    role: 'PLAYER',
    rating: 1000,
    gamesPlayed: 10,
    wins: 5,
    losses: 5,
    ties: 0,
    winRate: 0.5,
    ...over
  }
}

function ranking(n: number, rank: number, over: Partial<RankingEntryDto> = {}): RankingEntryDto {
  return {
    rank,
    playerId: `p${n}`,
    displayName: `Player ${n}`,
    rating: 1000,
    gamesPlayed: 10,
    wins: 5,
    losses: 5,
    ties: 0,
    winRate: 0.5,
    ...over
  }
}

let seq = 0
function match(over: Partial<MatchHistoryEntryDto> = {}): MatchHistoryEntryDto {
  seq++
  return {
    gameId: `m${seq}`,
    eventId: 'e1',
    date: `2026-07-${String((seq % 27) + 1).padStart(2, '0')}T19:00:00Z`,
    roundIndex: 0,
    courtIndex: 0,
    team1: ['A', 'B'],
    team2: ['C', 'D'],
    team1Ids: ['gp1', 'gp2'],
    team2Ids: ['gp3', 'gp4'],
    scoreTeam1: 11,
    scoreTeam2: 7,
    result: 'TEAM1_WIN',
    ...over
  }
}

describe('computeStatAwards', () => {
  it('names the ladder leader Club Champion', () => {
    const players = [player(1, { rating: 1200 }), player(2), player(3)]
    const rankings = [
      ranking(1, 1, { rating: 1200, wins: 12, winRate: 0.7 }),
      ranking(2, 2),
      ranking(3, 3)
    ]
    const awards = computeStatAwards({ rankings, matches: [], players, initialRating: 1000 })
    const champ = awards.find((a) => a.key === 'champion')
    expect(champ).toBeDefined()
    expect(champ!.winner.groupPlayerId).toBe('gp1')
    expect(champ!.winner.playerId).toBe('p1')
    expect(champ!.value).toBe(1200)
  })

  it('awards Most Improved by climb from the initial rating (min 3 games)', () => {
    const players = [
      player(1, { rating: 1150, gamesPlayed: 8 }), // +150
      player(2, { rating: 1300, gamesPlayed: 2 }), // bigger climb but too few games
      player(3, { rating: 1050, gamesPlayed: 8 })
    ]
    const awards = computeStatAwards({
      rankings: [ranking(1, 1)],
      matches: [],
      players,
      initialRating: 1000
    })
    const improved = awards.find((a) => a.key === 'mostImproved')
    expect(improved!.winner.groupPlayerId).toBe('gp1')
    expect(improved!.value).toBe(150)
  })

  it('finds the longest win streak (Hot Hand) and loss streak (Heartbreak) over full history', () => {
    const players = [player(1), player(3)]
    // gp1 on team1 wins 3 straight, then loses 1
    const matches = [
      match({ date: '2026-07-01T19:00:00Z', result: 'TEAM1_WIN' }),
      match({ date: '2026-07-02T19:00:00Z', result: 'TEAM1_WIN' }),
      match({ date: '2026-07-03T19:00:00Z', result: 'TEAM1_WIN' }),
      match({ date: '2026-07-04T19:00:00Z', result: 'TEAM2_WIN' })
    ]
    const awards = computeStatAwards({
      rankings: [ranking(1, 1)],
      matches,
      players,
      initialRating: 1000
    })
    const hot = awards.find((a) => a.key === 'hotHand')
    expect(hot!.winner.groupPlayerId).toBe('gp1')
    expect(hot!.value).toBe(3)
    // gp3 (team2) lost 3 straight then won → heartbreak length 3
    const cold = awards.find((a) => a.key === 'heartbreak')
    expect(cold!.winner.groupPlayerId).toBe('gp3')
    expect(cold!.value).toBe(3)
  })

  it('crowns the best duo as Dream Team with a partner', () => {
    const players = [player(1), player(2), player(3), player(4)]
    const matches = [
      match({ result: 'TEAM1_WIN' }),
      match({ result: 'TEAM1_WIN' }),
      match({ result: 'TEAM1_WIN' })
    ]
    const awards = computeStatAwards({
      rankings: [ranking(1, 1)],
      matches,
      players,
      initialRating: 1000
    })
    const duo = awards.find((a) => a.key === 'dreamTeam')
    expect(duo).toBeDefined()
    expect([duo!.winner.groupPlayerId, duo!.partner!.groupPlayerId].sort()).toEqual(['gp1', 'gp2'])
    expect(duo!.value).toBe(100) // 3-0 together
  })

  it('detects the Biggest Upset by team-Elo gap', () => {
    const players = [player(1), player(2), player(3), player(4)]
    // team2 (gp3/gp4) much higher rated but loses → upset winners gp1/gp2
    const matches = [
      match({ result: 'TEAM1_WIN', team1Elo: 950, team2Elo: 1250, scoreTeam1: 11, scoreTeam2: 9 })
    ]
    const awards = computeStatAwards({
      rankings: [ranking(1, 1)],
      matches,
      players,
      initialRating: 1000
    })
    const upset = awards.find((a) => a.key === 'biggestUpset')
    expect(upset).toBeDefined()
    expect([upset!.winner.groupPlayerId, upset!.partner!.groupPlayerId].sort()).toEqual([
      'gp1',
      'gp2'
    ])
    expect(upset!.value).toBe(300)
  })

  it('omits awards with no qualifying winner', () => {
    // Everyone has zero games → only nothing qualifies
    const players = [player(1, { gamesPlayed: 0, wins: 0 })]
    const awards = computeStatAwards({
      rankings: [],
      matches: [],
      players,
      initialRating: 1000
    })
    expect(awards).toEqual([])
  })
})
