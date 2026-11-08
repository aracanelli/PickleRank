import { describe, it, expect } from 'vitest'
import type { EventDto, GameDto } from '@/app/core/models/dto'
import { nightSuperlatives, recapLines, fmtDelta } from './superlatives'

const p = (id: string) => ({ id, displayName: id.toUpperCase() })
let n = 0
function game(court: number, t1: [string, string], t2: [string, string], s1?: number, s2?: number, elo?: [number, number]): GameDto {
  return {
    id: `g${++n}`, roundIndex: 0, courtIndex: court - 1,
    team1: t1.map(p), team2: t2.map(p), scoreTeam1: s1, scoreTeam2: s2,
    team1Elo: elo?.[0], team2Elo: elo?.[1],
    result: s1 == null || s2 == null ? 'UNSET' : s1 > s2 ? 'TEAM1_WIN' : s2 > s1 ? 'TEAM2_WIN' : 'TIE'
  } as GameDto
}
const ev = (games: GameDto[]): EventDto => ({ id: 'e', groupId: 'g', status: 'COMPLETED', courts: 2, rounds: 3, participantCount: 8, games })

describe('nightSuperlatives', () => {
  const games = [
    game(1, ['a', 'b'], ['c', 'd'], 11, 0, [1000, 1050]), // bagel and upset by 50
    game(2, ['e', 'f'], ['g', 'h'], 11, 9, [1100, 1000]),
    game(1, ['a', 'b'], ['e', 'g'], 12, 10, [1000, 1020]), // nail-biter, bigger total than 11-9
    game(2, ['c', 'f'], ['d', 'h'], 4, 11),
    game(1, ['a', 'c'], ['b', 'd'], 11, 7)
  ]
  const s = nightSuperlatives(ev(games))

  it('falls back to most wins for the MVP without rating updates', () => {
    expect(s.mvp?.player.id).toBe('a')
    expect(s.mvp).toMatchObject({ wins: 3, games: 3 })
    expect(s.mvp?.delta).toBeUndefined()
  })

  it('uses the largest rating gain when updates are given', () => {
    const r = nightSuperlatives(ev(games), [
      { playerId: 'a', displayName: 'A', ratingBefore: 1000, ratingAfter: 1010, delta: 10 },
      { playerId: 'h', displayName: 'H', ratingBefore: 1000, ratingAfter: 1018.4, delta: 18.4 }
    ])
    expect(r.mvp).toMatchObject({ player: { id: 'h' }, delta: 18.4, wins: 1, games: 2 })
  })

  it('finds perfect nights of two or more games', () => {
    expect(s.perfect.map(x => x.player.id)).toEqual(['a'])
  })

  it('picks the upset with the biggest gap against the winner', () => {
    expect(s.upset?.gap).toBe(50)
    expect(s.upset?.winners.map(x => x.id)).toEqual(['a', 'b'])
  })

  it('picks the closest game, breaking ties by the higher total', () => {
    expect(s.nailBiter).toMatchObject({ margin: 2, winScore: 12, loseScore: 10 })
  })

  it('collects bagels', () => {
    expect(s.bagels).toHaveLength(1)
    expect(s.bagels[0].loseScore).toBe(0)
  })

  it('names the dynamic duo only with two or more wins together', () => {
    expect(s.duo?.players.map(x => x.id)).toEqual(['a', 'b'])
    expect(s.duo?.wins).toBe(2)
    expect(nightSuperlatives(ev(games.slice(0, 2))).duo).toBeUndefined()
  })

  it('names the court with the most points', () => {
    // court 1: 11 + 22 + 18 = 51; court 2: 20 + 15 = 35
    expect(s.ironCourt).toEqual({ court: 1, points: 51 })
  })

  it('skips what does not apply', () => {
    const r = nightSuperlatives(ev([game(1, ['a', 'b'], ['c', 'd'], 11, 5), game(1, ['a', 'c'], ['b', 'd'])]))
    expect(r.perfect).toEqual([])
    expect(r.upset).toBeUndefined()
    expect(r.nailBiter).toBeUndefined()
    expect(r.bagels).toEqual([])
    expect(r.ironCourt).toBeUndefined()
    expect(r.mvp?.wins).toBe(1)
    expect(nightSuperlatives(ev([])).mvp).toBeUndefined()
  })

  it('turns superlatives into lines of copy in a fixed order', () => {
    const lines = recapLines(s)
    expect(lines.map(l => l.key)).toEqual(['perfect', 'upset', 'nailBiter', 'bagel', 'duo', 'ironCourt'])
    expect(lines[0].line).toBe("A didn't drop a game. 3 for 3.")
    expect(lines[1]).toMatchObject({ score: '11–0', where: 'Court 1, round 1', line: 'A & B beat a team rated 50 higher.' })
    expect(fmtDelta(18.44)).toBe('+18.4')
    expect(fmtDelta(-3)).toBe('−3.0')
  })

  it('ignores negative-only rating movement and falls back to wins', () => {
    const r = nightSuperlatives(ev(games), [{ playerId: 'c', displayName: 'C', ratingBefore: 1000, ratingAfter: 990, delta: -10 }])
    expect(r.mvp?.player.id).toBe('a')
  })
})
