import type { MatchHistoryEntryDto, RankingEntryDto } from '@/app/core/models/dto'
import { outcomeFor, sortNewestFirst, type Outcome } from '@/app/features/rankings/utils/match-derivations'

// "League pulse" moments for league home. Pure derivations over recent history.
// Team ids on history entries are GROUP-PLAYER ids; rankings use GLOBAL player ids.

const isScored = (m: MatchHistoryEntryDto) => m.result === 'TEAM1_WIN' || m.result === 'TEAM2_WIN' || m.result === 'TIE'
const pairKey = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x])

export interface Rivalry {
  /** group player ids, sorted */
  a: string
  b: string
  aWins: number
  bWins: number
  ties: number
  meetings: number
}

/** Two players who keep meeting across the net with a record within one game. Most meetings wins. */
export function rivalry(matches: MatchHistoryEntryDto[], minMeetings = 2): Rivalry | null {
  const pairs = new Map<string, Rivalry>()
  for (const m of matches) {
    if (!isScored(m)) continue
    for (const x of m.team1Ids ?? []) {
      for (const y of m.team2Ids ?? []) {
        const [a, b] = pairKey(x, y)
        const key = `${a}|${b}`
        const r = pairs.get(key) ?? { a, b, aWins: 0, bWins: 0, ties: 0, meetings: 0 }
        r.meetings++
        const o = outcomeFor(m, a)
        if (o === 'W') r.aWins++
        else if (o === 'L') r.bWins++
        else r.ties++
        pairs.set(key, r)
      }
    }
  }
  const gap = (r: Rivalry) => Math.abs(r.aWins - r.bWins)
  const close = [...pairs.values()].filter(r => r.meetings >= minMeetings && gap(r) <= 1)
  close.sort((x, y) => y.meetings - x.meetings || gap(x) - gap(y))
  return close[0] ?? null
}

export interface Duo {
  a: string
  b: string
  wins: number
  games: number
}

/** Best partnership by win rate (ties count as not won); needs a winning record and `minGames` together. */
export function dynamicDuo(matches: MatchHistoryEntryDto[], minGames = 3): Duo | null {
  const duos = new Map<string, Duo>()
  for (const m of matches) {
    if (!isScored(m)) continue
    for (const team of [m.team1Ids ?? [], m.team2Ids ?? []]) {
      if (team.length !== 2) continue
      const [a, b] = pairKey(team[0], team[1])
      const key = `${a}|${b}`
      const d = duos.get(key) ?? { a, b, wins: 0, games: 0 }
      d.games++
      if (outcomeFor(m, a) === 'W') d.wins++
      duos.set(key, d)
    }
  }
  const rate = (d: Duo) => d.wins / d.games
  const good = [...duos.values()].filter(d => d.games >= minGames && rate(d) > 0.5)
  good.sort((x, y) => rate(y) - rate(x) || y.games - x.games)
  return good[0] ?? null
}

export const MILESTONES = [10, 25, 50, 100, 250]

export interface Milestone {
  /** global player id */
  playerId: string
  name: string
  target: number
  /** 0 means they are sitting exactly on it */
  toGo: number
}

/** Players at or close to a round number of games played. Closest first. */
export function milestones(rankings: RankingEntryDto[], within = 3, limit = 2): Milestone[] {
  const out: Milestone[] = []
  for (const r of rankings) {
    const target = MILESTONES.find(t => t >= r.gamesPlayed)
    if (target && target - r.gamesPlayed <= within) {
      out.push({ playerId: r.playerId, name: r.displayName, target, toGo: target - r.gamesPlayed })
    }
  }
  out.sort((x, y) => x.toGo - y.toGo || y.target - x.target)
  return out.slice(0, limit)
}

/** The closest finished game (margin of 3 or less) in the week before the newest game; higher totals break ties. */
export function gameOfTheWeek(matches: MatchHistoryEntryDto[], maxMargin = 3): MatchHistoryEntryDto | null {
  const withScores = matches.filter(m => isScored(m) && m.scoreTeam1 != null && m.scoreTeam2 != null)
  if (!withScores.length) return null
  const newest = Math.max(...withScores.map(m => new Date(m.date).getTime()))
  const week = withScores.filter(m => newest - new Date(m.date).getTime() <= 7 * 24 * 60 * 60 * 1000)
  const margin = (m: MatchHistoryEntryDto) => Math.abs(m.scoreTeam1! - m.scoreTeam2!)
  const total = (m: MatchHistoryEntryDto) => m.scoreTeam1! + m.scoreTeam2!
  const close = sortNewestFirst(week).filter(m => margin(m) <= maxMargin)
  // stable sort keeps newest first among equals
  close.sort((x, y) => margin(x) - margin(y) || total(y) - total(x))
  return close[0] ?? null
}

/** Last `n` results for one player, newest first. */
export function formFor(matches: MatchHistoryEntryDto[], groupPlayerId: string, n = 5): Outcome[] {
  const out: Outcome[] = []
  for (const m of sortNewestFirst(matches)) {
    const o = outcomeFor(m, groupPlayerId)
    if (o) out.push(o)
    if (out.length === n) break
  }
  return out
}
