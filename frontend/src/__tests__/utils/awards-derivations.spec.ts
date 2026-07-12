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
    date: `2026-06-${String((seq % 27) + 1).padStart(2, '0')}T19:00:00Z`,
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

/** n dated matches so chronological order is explicit. */
function dated(overs: Partial<MatchHistoryEntryDto>[]): MatchHistoryEntryDto[] {
  return overs.map((over, i) =>
    match({ date: `2026-06-${String(i + 1).padStart(2, '0')}T19:00:00Z`, ...over })
  )
}

describe('computeStatAwards', () => {
  it('names the ladder leader Club Champion', () => {
    const players = [player(1, { rating: 1200 }), player(2), player(3)]
    const rankings = [
      ranking(1, 1, { rating: 1200, wins: 12, winRate: 0.7 }),
      ranking(2, 2),
      ranking(3, 3)
    ]
    const awards = computeStatAwards({ rankings, matches: [], players })
    const champ = awards.find((a) => a.key === 'champion')
    expect(champ).toBeDefined()
    expect(champ!.winner.groupPlayerId).toBe('gp1')
    expect(champ!.winner.playerId).toBe('p1')
    expect(champ!.value).toBe(1200)
  })

  it('replaces Most Improved with Second Wind (biggest early→late win-rate surge)', () => {
    const players = [player(1), player(2), player(3), player(4)]
    // gp1/gp2 lose their first 3, then win their last 3 → 0% → 100%
    const matches = dated([
      { result: 'TEAM2_WIN' },
      { result: 'TEAM2_WIN' },
      { result: 'TEAM2_WIN' },
      { result: 'TEAM1_WIN' },
      { result: 'TEAM1_WIN' },
      { result: 'TEAM1_WIN' }
    ])
    const awards = computeStatAwards({ rankings: [ranking(1, 1)], matches, players })
    expect(awards.find((a) => a.key === 'mostImproved')).toBeUndefined()
    const surge = awards.find((a) => a.key === 'secondWind')
    expect(surge).toBeDefined()
    expect(surge!.winner.groupPlayerId).toBe('gp1')
    expect(surge!.value).toBe(100)
    expect(surge!.detail).toBe('0% → 100% win rate')
  })

  it('needs at least 3 games in each half for Second Wind', () => {
    const players = [player(1), player(3)]
    // Only 4 decided games → halves of 2 → no award
    const matches = dated([
      { result: 'TEAM2_WIN' },
      { result: 'TEAM2_WIN' },
      { result: 'TEAM1_WIN' },
      { result: 'TEAM1_WIN' }
    ])
    const awards = computeStatAwards({ rankings: [], matches, players })
    expect(awards.find((a) => a.key === 'secondWind')).toBeUndefined()
  })

  it('finds the longest win streak (Hot Hand) and loss streak (Heartbreak) over full history', () => {
    const players = [player(1), player(3)]
    // gp1 on team1 wins 3 straight, then loses 1
    const matches = dated([
      { result: 'TEAM1_WIN' },
      { result: 'TEAM1_WIN' },
      { result: 'TEAM1_WIN' },
      { result: 'TEAM2_WIN' }
    ])
    const awards = computeStatAwards({ rankings: [ranking(1, 1)], matches, players })
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
    const awards = computeStatAwards({ rankings: [ranking(1, 1)], matches, players })
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
    const awards = computeStatAwards({ rankings: [ranking(1, 1)], matches, players })
    const upset = awards.find((a) => a.key === 'biggestUpset')
    expect(upset).toBeDefined()
    expect([upset!.winner.groupPlayerId, upset!.partner!.groupPlayerId].sort()).toEqual([
      'gp1',
      'gp2'
    ])
    expect(upset!.value).toBe(300)
  })

  it('awards Ice in the Veins for the best record in tight games', () => {
    const players = [player(1), player(2), player(3), player(4)]
    // gp1/gp2 go 3-0 in 2-point games; the blowout does not count as tight
    const matches = [
      match({ result: 'TEAM1_WIN', scoreTeam1: 11, scoreTeam2: 9 }),
      match({ result: 'TEAM1_WIN', scoreTeam1: 12, scoreTeam2: 10 }),
      match({ result: 'TEAM1_WIN', scoreTeam1: 11, scoreTeam2: 9 }),
      match({ result: 'TEAM2_WIN', scoreTeam1: 2, scoreTeam2: 11 })
    ]
    const awards = computeStatAwards({ rankings: [], matches, players })
    const clutch = awards.find((a) => a.key === 'iceVeins')
    expect(clutch).toBeDefined()
    expect(clutch!.winner.groupPlayerId).toBe('gp1')
    expect(clutch!.value).toBe(100) // 3-0 in nail-biters
  })

  it('awards Giant Slayer for repeat underdog wins', () => {
    const players = [player(1), player(2), player(3), player(4)]
    const matches = [
      match({ result: 'TEAM1_WIN', team1Elo: 950, team2Elo: 1100 }),
      match({ result: 'TEAM1_WIN', team1Elo: 960, team2Elo: 1010 }),
      // Favored win doesn't count
      match({ result: 'TEAM1_WIN', team1Elo: 1100, team2Elo: 900 })
    ]
    const awards = computeStatAwards({ rankings: [], matches, players })
    const slayer = awards.find((a) => a.key === 'giantSlayer')
    expect(slayer).toBeDefined()
    expect(slayer!.winner.groupPlayerId).toBe('gp1')
    expect(slayer!.value).toBe(2)
  })

  it('awards The Wall (fewest points allowed) and Wrecking Ball (biggest margin)', () => {
    const players = [player(1), player(2), player(3), player(4)]
    const matches = dated(
      Array.from({ length: 5 }, () => ({
        result: 'TEAM1_WIN' as const,
        scoreTeam1: 11,
        scoreTeam2: 5
      }))
    )
    const awards = computeStatAwards({ rankings: [], matches, players })
    const wall = awards.find((a) => a.key === 'theWall')
    expect(wall!.winner.groupPlayerId).toBe('gp1')
    expect(wall!.value).toBe(5) // opponents average 5 points
    const wrecker = awards.find((a) => a.key === 'wreckingBall')
    expect(wrecker!.winner.groupPlayerId).toBe('gp1')
    expect(wrecker!.value).toBe(6) // +6 average margin
  })

  it('awards Lucky Charm to the player whose partners overperform', () => {
    const players = [player(1), player(2), player(3), player(4), player(5)]
    const matches = dated([
      // gp1 + gp2 win 3
      { team1Ids: ['gp1', 'gp2'], result: 'TEAM1_WIN' },
      { team1Ids: ['gp1', 'gp2'], result: 'TEAM1_WIN' },
      { team1Ids: ['gp1', 'gp2'], result: 'TEAM1_WIN' },
      // gp1 + gp5 win 2
      { team1Ids: ['gp1', 'gp5'], result: 'TEAM1_WIN' },
      { team1Ids: ['gp1', 'gp5'], result: 'TEAM1_WIN' },
      // gp2 + gp5 lose without gp1 → their overall rates drop below 100%
      { team1Ids: ['gp2', 'gp5'], result: 'TEAM2_WIN' }
    ])
    const awards = computeStatAwards({ rankings: [], matches, players })
    const charm = awards.find((a) => a.key === 'luckyCharm')
    expect(charm).toBeDefined()
    expect(charm!.winner.groupPlayerId).toBe('gp1')
    // Partners' lift: 3 games × (1 − 0.75) + 2 games × (1 − 2/3) = 1.4167 / 5 → +28%
    expect(charm!.value).toBe(28)
  })

  it('awards Blood Feud to the most-played rivalry with the series leader first', () => {
    const players = [player(1), player(2), player(3), player(4)]
    const matches = dated([
      { result: 'TEAM1_WIN' },
      { result: 'TEAM1_WIN' },
      { result: 'TEAM1_WIN' },
      { result: 'TEAM2_WIN' }
    ])
    const awards = computeStatAwards({ rankings: [], matches, players })
    const feud = awards.find((a) => a.key === 'bloodFeud')
    expect(feud).toBeDefined()
    expect(feud!.value).toBe(4) // met 4 times
    expect(feud!.winner.groupPlayerId).toBe('gp1') // leads the series 3-1
    expect(feud!.detail).toContain('leads 3-1')
  })

  it('splits awards into ALL and PERMANENT divisions when a sub has played', () => {
    const players = [
      player(1, { rating: 1100 }),
      player(2, { membershipType: 'SUB', rating: 1300 }),
      player(3)
    ]
    const rankings = [
      ranking(2, 1, { rating: 1300 }),
      ranking(1, 2, { rating: 1100 }),
      ranking(3, 3)
    ]
    const awards = computeStatAwards({ rankings, matches: [], players })
    const champs = awards.filter((a) => a.key === 'champion')
    expect(champs).toHaveLength(2)
    const openChamp = champs.find((a) => a.division === 'ALL')
    const regularsChamp = champs.find((a) => a.division === 'PERMANENT')
    expect(openChamp!.winner.groupPlayerId).toBe('gp2') // sub tops the open pool
    expect(regularsChamp!.winner.groupPlayerId).toBe('gp1') // best regular
  })

  it('emits a single ALL division when no sub ever played', () => {
    const players = [player(1), player(2), player(3, { membershipType: 'SUB', gamesPlayed: 0 })]
    const awards = computeStatAwards({ rankings: [ranking(1, 1)], matches: [], players })
    expect(awards.length).toBeGreaterThan(0)
    expect(awards.every((a) => a.division === 'ALL')).toBe(true)
  })

  it('omits awards with no qualifying winner', () => {
    // Everyone has zero games → nothing qualifies
    const players = [player(1, { gamesPlayed: 0, wins: 0 })]
    const awards = computeStatAwards({ rankings: [], matches: [], players })
    expect(awards).toEqual([])
  })
})
