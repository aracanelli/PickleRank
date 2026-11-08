import { describe, it, expect } from 'vitest'
import type { MatchHistoryEntryDto, RatingHistoryPoint } from '@/app/core/models/dto'
import { computeBadges, playerTitle, type BadgeId } from './badges'

const ME = 'gp_me'
let n = 0
function game(o: Partial<MatchHistoryEntryDto> & { s?: [number, number]; partner?: string; elo?: [number, number] } = {}): MatchHistoryEntryDto {
  const [a, b] = o.s ?? [11, 5]
  n++
  return {
    gameId: `g${n}`, eventId: o.eventId ?? 'ev1', date: o.date ?? `2026-01-${String((n % 28) + 1).padStart(2, '0')}T19:00:00Z`,
    roundIndex: n, courtIndex: 0, team1: [], team2: [],
    team1Ids: [ME, o.partner ?? 'gp_p'], team2Ids: ['gp_x', 'gp_y'],
    scoreTeam1: a, scoreTeam2: b, result: a > b ? 'TEAM1_WIN' : a < b ? 'TEAM2_WIN' : 'TIE',
    team1Elo: o.elo?.[0], team2Elo: o.elo?.[1]
  }
}
const point = (rating: number, delta: number, createdAt: string, eventId = 'e'): RatingHistoryPoint => ({ rating, delta, createdAt, eventId })
const byId = (list: ReturnType<typeof computeBadges>) => Object.fromEntries(list.map(b => [b.id, b])) as Record<BadgeId, (typeof list)[number]>

describe('computeBadges', () => {
  it('starts with nothing earned and progress at zero', () => {
    const b = byId(computeBadges({ matches: [], groupPlayerId: ME }))
    expect(Object.values(b).every(x => !x.earned)).toBe(true)
    expect(b['half-century'].progress).toEqual({ current: 0, target: 50, unit: 'games' })
  })

  it('bagel, giant killer and clutch from scores and ELO', () => {
    const m = [game({ s: [11, 0], date: '2026-01-02T00:00:00Z' }), game({ s: [11, 9], elo: [1000, 1060] }), game({ s: [12, 10] }), game({ s: [11, 9], date: '2026-02-01T00:00:00Z' })]
    const b = byId(computeBadges({ matches: m, groupPlayerId: ME }))
    expect(b.bagel).toMatchObject({ earned: true, earnedAt: '2026-01-02T00:00:00Z' })
    expect(b['giant-killer'].earned).toBe(true)
    expect(b.clutch).toMatchObject({ earned: true, earnedAt: '2026-02-01T00:00:00Z' })
  })

  it('a 49-point gap is not a giant win, and a loss by 2 is not clutch', () => {
    const b = byId(computeBadges({ matches: [game({ elo: [1000, 1049] }), game({ s: [9, 11] })], groupPlayerId: ME }))
    expect(b['giant-killer'].earned).toBe(false)
    expect(b.clutch.progress?.current).toBe(0)
  })

  it('perfect night needs 3+ games, all won, at one event', () => {
    const two = [game({ eventId: 'a' }), game({ eventId: 'a' })]
    expect(byId(computeBadges({ matches: two, groupPlayerId: ME }))['perfect-night'].earned).toBe(false)
    const three = [...two, game({ eventId: 'a' })]
    expect(byId(computeBadges({ matches: three, groupPlayerId: ME }))['perfect-night'].earned).toBe(true)
    const spoiled = [...three, game({ eventId: 'a', s: [5, 11] })]
    expect(byId(computeBadges({ matches: spoiled, groupPlayerId: ME }))['perfect-night'].earned).toBe(false)
  })

  it('hot hand from history or advanced stats', () => {
    const four = Array.from({ length: 4 }, () => game())
    expect(byId(computeBadges({ matches: four, groupPlayerId: ME }))['hot-hand'].progress?.current).toBe(4)
    expect(byId(computeBadges({ matches: four, groupPlayerId: ME, advanced: { longestWinStreak: 6 } as never }))['hot-hand'].earned).toBe(true)
  })

  it('games and events count, capped progress, social partners', () => {
    const m = Array.from({ length: 12 }, (_, i) => game({ eventId: `e${i % 6}`, partner: `gp_${i}` }))
    const b = byId(computeBadges({ matches: m, groupPlayerId: ME, gamesPlayed: 60 }))
    expect(b.regular.earned).toBe(true)
    expect(b['iron-court'].progress).toEqual({ current: 6, target: 20, unit: 'events' })
    expect(b['half-century'].earned).toBe(true)
    expect(b.century.progress?.current).toBe(60)
    expect(b.social.earned).toBe(true)
  })

  it('peak only when the latest event beats every earlier rating', () => {
    const up = [point(1000, 10, '2026-01-01'), point(990, -10, '2026-01-08'), point(1012, 22, '2026-01-15')]
    expect(byId(computeBadges({ matches: [], groupPlayerId: ME, history: up })).peak).toMatchObject({ earned: true, earnedAt: '2026-01-15' })
    const notQuite = [point(1000, 10, '2026-01-01'), point(990, -10, '2026-01-08'), point(999, 9, '2026-01-15')]
    expect(byId(computeBadges({ matches: [], groupPlayerId: ME, history: notQuite })).peak.earned).toBe(false)
  })

  it('ignores games the player was not in', () => {
    const other = { ...game({ s: [11, 0] }), team1Ids: ['a', 'b'] }
    expect(byId(computeBadges({ matches: [other], groupPlayerId: ME })).bagel.earned).toBe(false)
  })
})

describe('playerTitle', () => {
  const now = new Date('2026-03-01T00:00:00Z')
  const many = (k: number, s: [number, number] = [11, 5]) => Array.from({ length: k }, () => game({ s }))

  it('rookie under 10 games', () => {
    expect(playerTitle({ matches: many(3), groupPlayerId: ME, now }).title).toBe('Rookie')
  })
  it('iron lungs when nobody has played more', () => {
    expect(playerTitle({ matches: many(12), groupPlayerId: ME, leagueGamesPlayed: [12, 8], now }).title).toBe('Iron lungs')
  })
  it('rising star on a 30-point month', () => {
    const history = [point(1000, 20, '2026-02-10'), point(1015, 15, '2026-02-20')]
    expect(playerTitle({ matches: many(12), groupPlayerId: ME, leagueGamesPlayed: [40], history, now }).title).toBe('Rising star')
  })
  it('the closer wins most close games', () => {
    const m = [...many(6), ...many(4, [11, 9]), game({ s: [9, 11] })]
    expect(playerTitle({ matches: m, groupPlayerId: ME, leagueGamesPlayed: [40], now }).title).toBe('The closer')
  })
  it('steady eddie on small swings, regular otherwise', () => {
    const steady = [1, -2, 3, -1, 2].map((d, i) => point(1000, d, `2025-0${i + 1}-01`))
    expect(playerTitle({ matches: many(12), groupPlayerId: ME, leagueGamesPlayed: [40], history: steady, now }).title).toBe('Steady Eddie')
    expect(playerTitle({ matches: many(12), groupPlayerId: ME, leagueGamesPlayed: [40], now }).title).toBe('Regular')
  })
})
