import type { AdvancedStats, MatchHistoryEntryDto, RatingHistoryPoint } from '@/app/core/models/dto'
import { outcomeFor } from '@/app/features/rankings/utils/match-derivations'

/**
 * Collectible badges and a fun "player title", derived purely from one player's
 * match history, rating history and advanced stats.
 * `groupPlayerId` is the GROUP-PLAYER id (history team ids).
 */

export type BadgeId =
  | 'bagel' | 'perfect-night' | 'giant-killer' | 'clutch' | 'hot-hand'
  | 'regular' | 'iron-court' | 'half-century' | 'century' | 'peak' | 'social'

export interface Badge {
  id: BadgeId
  name: string
  /** how it's earned, one line */
  description: string
  earned: boolean
  /** ISO date it was earned, when the history shows it */
  earnedAt?: string
  progress?: { current: number; target: number; unit: string }
}

export interface BadgeInput {
  matches: readonly MatchHistoryEntryDto[]
  groupPlayerId: string
  history?: readonly RatingHistoryPoint[]
  advanced?: AdvancedStats | null
  /** authoritative games count from the player record; history may be partial */
  gamesPlayed?: number
}

/** ELO gap (own team below opponents) that counts as an upset. */
export const GIANT_GAP = 50

interface Game {
  m: MatchHistoryEntryDto
  won: boolean
  own?: number
  opp?: number
  ownElo?: number
  oppElo?: number
  partners: string[]
}

const time = (iso: string) => new Date(iso).getTime()

/** The player's scored games, oldest first, from their side of the net. */
function gamesOf(matches: readonly MatchHistoryEntryDto[], id: string): Game[] {
  const out: Game[] = []
  for (const m of [...matches].sort((a, b) => time(a.date) - time(b.date) || a.roundIndex - b.roundIndex)) {
    const o = outcomeFor(m, id)
    if (o === null) continue
    const t1 = m.team1Ids.includes(id)
    out.push({
      m,
      won: o === 'W',
      own: (t1 ? m.scoreTeam1 : m.scoreTeam2) ?? undefined,
      opp: (t1 ? m.scoreTeam2 : m.scoreTeam1) ?? undefined,
      ownElo: (t1 ? m.team1Elo : m.team2Elo) ?? undefined,
      oppElo: (t1 ? m.team2Elo : m.team1Elo) ?? undefined,
      partners: (t1 ? m.team1Ids : m.team2Ids).filter(x => x !== id)
    })
  }
  return out
}

const isGiantWin = (g: Game) => g.won && g.ownElo != null && g.oppElo != null && g.oppElo - g.ownElo >= GIANT_GAP
const isClutchWin = (g: Game) => g.won && g.own != null && g.opp != null && g.own - g.opp === 2

/** Date the n-th item matching `pred` happened, or undefined. */
function nthDate(games: Game[], n: number, pred: (g: Game) => boolean): string | undefined {
  let c = 0
  for (const g of games) if (pred(g) && ++c === n) return g.m.date
  return undefined
}

function counted(
  id: BadgeId, name: string, description: string, current: number, target: number, unit: string, earnedAt?: string
): Badge {
  const earned = current >= target
  return { id, name, description, earned, earnedAt: earned ? earnedAt : undefined, progress: { current: Math.min(current, target), target, unit } }
}

export function computeBadges(input: BadgeInput): Badge[] {
  const games = gamesOf(input.matches, input.groupPlayerId)
  const history = [...(input.history ?? [])].sort((a, b) => time(a.createdAt) - time(b.createdAt))

  // bagel: opponents held to zero
  const bagel = games.find(g => g.won && g.opp === 0)

  // perfect night: won every game at one event, at least 3 games
  const byEvent = new Map<string, Game[]>()
  for (const g of games) byEvent.set(g.m.eventId, [...(byEvent.get(g.m.eventId) ?? []), g])
  const perfect = [...byEvent.values()].find(list => list.length >= 3 && list.every(g => g.won))

  const giant = games.find(isGiantWin)
  const clutch = games.filter(isClutchWin).length

  // longest win streak and when it first reached 5 (ties break a streak)
  let run = 0, best = 0
  let hotAt: string | undefined
  for (const g of games) {
    run = g.won ? run + 1 : 0
    best = Math.max(best, run)
    if (run === 5 && !hotAt) hotAt = g.m.date
  }
  best = Math.max(best, input.advanced?.longestWinStreak ?? 0)

  // events played: whichever source knows more
  const eventDates = [...byEvent.values()].map(list => list[0].m.date) // map keeps first-seen (oldest) order
  const ratedEvents = history.filter(h => h.eventId)
  const events = Math.max(byEvent.size, ratedEvents.length)
  const eventAt = (n: number) => eventDates[n - 1] ?? ratedEvents[n - 1]?.createdAt

  const played = Math.max(input.gamesPlayed ?? 0, games.length)
  const gameAt = (n: number) => games[n - 1]?.m.date

  // peak: the latest event set a new personal best
  const last = history[history.length - 1]
  const priorBest = Math.max(...history.slice(0, -1).map(h => h.rating), last ? last.rating - (last.delta ?? 0) : -Infinity)
  const peak = !!last && history.length >= 2 && (last.delta ?? 0) > 0 && last.rating > priorBest

  const partners = new Set<string>()
  let socialAt: string | undefined
  for (const g of games) {
    for (const p of g.partners) partners.add(p)
    if (partners.size >= 10 && !socialAt) socialAt = g.m.date
  }

  return [
    { id: 'bagel', name: 'Bagel baker', description: 'Win a game without the other team scoring.', earned: !!bagel, earnedAt: bagel?.m.date },
    { id: 'perfect-night', name: 'Perfect night', description: 'Win every game at one event, at least 3 games.', earned: !!perfect, earnedAt: perfect?.[0].m.date },
    { id: 'giant-killer', name: 'Giant killer', description: `Win against a team rated ${GIANT_GAP} or more above yours.`, earned: !!giant, earnedAt: giant?.m.date },
    counted('clutch', 'Clutch', 'Win 3 games by exactly 2 points.', clutch, 3, 'two-point wins', nthDate(games, 3, isClutchWin)),
    counted('hot-hand', 'Hot hand', 'Win 5 games in a row.', best, 5, 'wins in a row', hotAt),
    counted('regular', 'Regular', 'Play 5 events.', events, 5, 'events', eventAt(5)),
    counted('iron-court', 'Iron court', 'Play 20 events.', events, 20, 'events', eventAt(20)),
    counted('half-century', 'Half century', 'Play 50 games.', played, 50, 'games', gameAt(50)),
    counted('century', 'Century', 'Play 100 games.', played, 100, 'games', gameAt(100)),
    { id: 'peak', name: 'Peak', description: 'Reach a new personal best rating at your latest event.', earned: peak, earnedAt: peak ? last.createdAt : undefined },
    counted('social', 'Social butterfly', 'Partner with 10 different players.', partners.size, 10, 'partners', socialAt)
  ]
}

// ---------------------------------------------------------------- titles

export interface PlayerTitle {
  title: string
  /** why, in plain words, shown under the title */
  reason: string
}

export interface TitleInput extends BadgeInput {
  /** games played by everyone in the league, to spot the most active player */
  leagueGamesPlayed?: readonly number[]
  now?: Date
}

const DAY = 86_400_000

/** One nickname from the player's stats, first match wins. */
export function playerTitle(input: TitleInput): PlayerTitle {
  const games = gamesOf(input.matches, input.groupPlayerId)
  const played = Math.max(input.gamesPlayed ?? 0, games.length)
  if (played < 10) return { title: 'Rookie', reason: 'Fewer than 10 games so far' }

  const most = Math.max(0, ...(input.leagueGamesPlayed ?? []))
  if (input.leagueGamesPlayed?.length && played >= most) return { title: 'Iron lungs', reason: 'Most games played in the league' }

  const now = (input.now ?? new Date()).getTime()
  const gain = (input.history ?? []).filter(h => now - time(h.createdAt) <= 30 * DAY).reduce((s, h) => s + (h.delta ?? 0), 0)
  if (gain >= 30) return { title: 'Rising star', reason: `Up ${Math.round(gain)} in the last 30 days` }

  const giants = games.filter(isGiantWin).length
  if (giants >= 3) return { title: 'Giant killer', reason: `${giants} wins against higher-rated teams` }

  const close = games.filter(g => g.own != null && g.opp != null && Math.abs(g.own - g.opp) <= 2 && g.own !== g.opp)
  const closeWins = close.filter(g => g.won).length
  if (close.length >= 4 && closeWins / close.length >= 0.6) return { title: 'The closer', reason: `Won ${closeWins} of ${close.length} games decided by 2 or less` }

  const deltas = (input.history ?? []).map(h => h.delta ?? 0)
  if (deltas.length >= 5) {
    const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length
    const sd = Math.sqrt(deltas.reduce((s, d) => s + (d - mean) ** 2, 0) / deltas.length)
    if (sd < 5) return { title: 'Steady Eddie', reason: 'Rating barely moves from event to event' }
  }

  return { title: 'Regular', reason: `${played} games and counting` }
}
