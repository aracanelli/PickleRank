import type { MatchHistoryEntryDto, RankingEntryDto } from '@/app/core/models/dto'
import { outcomeFor, type Outcome } from '@/app/features/rankings/utils/match-derivations'

// "Last week" = the league's most recent event with scored games (leagues meet weekly).
// Team ids on history entries are GROUP-PLAYER ids; rankings use GLOBAL player ids.

const isScored = (m: MatchHistoryEntryDto) =>
  (m.result === 'TEAM1_WIN' || m.result === 'TEAM2_WIN' || m.result === 'TIE') && m.scoreTeam1 != null && m.scoreTeam2 != null
const playOrder = (a: MatchHistoryEntryDto, b: MatchHistoryEntryDto) => a.roundIndex - b.roundIndex || a.courtIndex - b.courtIndex

export interface Night {
  eventId: string
  eventName?: string
  date: string
  /** scored games in play order */
  games: MatchHistoryEntryDto[]
}

export function lastNight(matches: MatchHistoryEntryDto[]): Night | null {
  const scored = matches.filter(isScored)
  if (!scored.length) return null
  const newest = scored.reduce((x, y) => (new Date(y.date).getTime() > new Date(x.date).getTime() ? y : x))
  const games = scored.filter(m => m.eventId === newest.eventId).sort(playOrder)
  return { eventId: newest.eventId, eventName: newest.eventName, date: newest.date, games }
}

/** One player's results in that night's play order (first game first). Empty if they sat out. */
export function nightForm(night: Night | null, groupPlayerId: string): Outcome[] {
  if (!night) return []
  return night.games.map(m => outcomeFor(m, groupPlayerId)).filter((o): o is Outcome => !!o)
}

const margin = (m: MatchHistoryEntryDto) => Math.abs(m.scoreTeam1! - m.scoreTeam2!)
const nameOf = (m: MatchHistoryEntryDto, id: string) => {
  const i1 = m.team1Ids.indexOf(id)
  if (i1 >= 0) return m.team1[i1]
  return m.team2[m.team2Ids.indexOf(id)]
}

export interface PlayerNight {
  id: string
  name: string
  wins: number
  losses: number
  ties: number
  pointDiff: number
}

function perPlayer(night: Night): PlayerNight[] {
  const map = new Map<string, PlayerNight>()
  for (const m of night.games) {
    for (const id of [...m.team1Ids, ...m.team2Ids]) {
      const p = map.get(id) ?? { id, name: nameOf(m, id), wins: 0, losses: 0, ties: 0, pointDiff: 0 }
      const o = outcomeFor(m, id)
      if (o === 'W') p.wins++
      else if (o === 'L') p.losses++
      else if (o === 'T') p.ties++
      const mine = m.team1Ids.includes(id) ? m.scoreTeam1! - m.scoreTeam2! : m.scoreTeam2! - m.scoreTeam1!
      p.pointDiff += mine
      map.set(id, p)
    }
  }
  return [...map.values()]
}

export interface NightStats {
  games: number
  players: number
  points: number
  /** margin of 2 or less */
  nailBiters: number
  closest: MatchHistoryEntryDto | null
  blowout: MatchHistoryEntryDto | null
  /** most wins, then best point difference */
  mvp: PlayerNight | null
  /** won every game, at least 2 games */
  perfect: PlayerNight[]
}

export function nightStats(night: Night | null): NightStats | null {
  if (!night || !night.games.length) return null
  const g = night.games
  const people = perPlayer(night)
  const byMargin = [...g].sort((a, b) => margin(a) - margin(b))
  const ranked = [...people].sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff)
  return {
    games: g.length,
    players: people.length,
    points: g.reduce((s, m) => s + m.scoreTeam1! + m.scoreTeam2!, 0),
    nailBiters: g.filter(m => margin(m) <= 2).length,
    closest: byMargin[0],
    blowout: margin(byMargin[byMargin.length - 1]) >= 5 ? byMargin[byMargin.length - 1] : null,
    mvp: ranked[0]?.wins ? ranked[0] : null,
    perfect: people.filter(p => p.wins >= 2 && !p.losses && !p.ties)
  }
}

export interface MyNight extends PlayerNight {
  form: Outcome[]
  /** partner you won the most with that night */
  bestPartner: { name: string; wins: number; games: number } | null
}

export function myNight(night: Night | null, groupPlayerId: string): MyNight | null {
  if (!night) return null
  const me = perPlayer(night).find(p => p.id === groupPlayerId)
  if (!me) return null
  const partners = new Map<string, { name: string; wins: number; games: number }>()
  for (const m of night.games) {
    const team = m.team1Ids.includes(groupPlayerId) ? m.team1Ids : m.team2Ids.includes(groupPlayerId) ? m.team2Ids : null
    if (!team) continue
    for (const id of team) {
      if (id === groupPlayerId) continue
      const p = partners.get(id) ?? { name: nameOf(m, id), wins: 0, games: 0 }
      p.games++
      if (outcomeFor(m, groupPlayerId) === 'W') p.wins++
      partners.set(id, p)
    }
  }
  const best = [...partners.values()].filter(p => p.wins > 0).sort((a, b) => b.wins - a.wins || a.games - b.games)[0] ?? null
  return { ...me, form: nightForm(night, groupPlayerId), bestPartner: best }
}

export interface Chase {
  /** the player directly above, or below when you are first */
  name: string
  rank: number
  /** rating points, rounded up, always positive */
  points: number
  leading: boolean
}

/** Who you are chasing (or holding off when you are #1). Rankings must be sorted by rank. */
export function chase(rankings: RankingEntryDto[], myPlayerId: string): Chase | null {
  const i = rankings.findIndex(r => r.playerId === myPlayerId)
  if (i < 0) return null
  const me = rankings[i]
  if (i === 0) {
    const next = rankings[1]
    return next ? { name: next.displayName, rank: next.rank, points: Math.max(1, Math.ceil(me.rating - next.rating)), leading: true } : null
  }
  const above = rankings[i - 1]
  return { name: above.displayName, rank: above.rank, points: Math.max(1, Math.ceil(above.rating - me.rating)), leading: false }
}
