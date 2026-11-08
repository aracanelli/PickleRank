/**
 * The night's box score: superlatives derived from a finished event.
 * Pure: give it the event (and the rating updates when you have them) and it says who stood out.
 * Anything that doesn't apply tonight is left out rather than forced.
 */
import type { EventDto, GameDto, PlayerInfo, RatingUpdateDto } from '@/app/core/models/dto'

export interface Decided {
  game: GameDto
  winners: PlayerInfo[]
  losers: PlayerInfo[]
  winScore: number
  loseScore: number
}

export interface NightSuperlatives {
  /** biggest rating gain; without rating updates, most wins */
  mvp?: { player: PlayerInfo; delta?: number; wins: number; games: number }
  /** won every game, at least two */
  perfect: { player: PlayerInfo; wins: number }[]
  /** a win against the biggest pre-game rating gap */
  upset?: Decided & { gap: number }
  /** smallest winning margin (2 or less), ties broken by the higher total */
  nailBiter?: Decided & { margin: number }
  /** every game the losers scored 0 */
  bagels: Decided[]
  /** pair with the most wins together, at least two */
  duo?: { players: [PlayerInfo, PlayerInfo]; wins: number }
  /** court that hosted the most points, when there was more than one court */
  ironCourt?: { court: number; points: number }
}

const NAIL_BITER_MAX_MARGIN = 2

export function decide(g: GameDto): Decided | null {
  const a = g.scoreTeam1, b = g.scoreTeam2
  if (a == null || b == null || a === b) return null
  return a > b
    ? { game: g, winners: g.team1, losers: g.team2, winScore: a, loseScore: b }
    : { game: g, winners: g.team2, losers: g.team1, winScore: b, loseScore: a }
}

const byName = (a: PlayerInfo, b: PlayerInfo) => a.displayName.localeCompare(b.displayName)

export function nightSuperlatives(event: EventDto, updates: RatingUpdateDto[] = []): NightSuperlatives {
  const scored = event.games.filter(g => g.scoreTeam1 != null && g.scoreTeam2 != null)
  const decided = scored.map(decide).filter((d): d is Decided => !!d)

  // per-player tallies
  const stats = new Map<string, { player: PlayerInfo; wins: number; games: number; diff: number }>()
  for (const g of scored) {
    for (const [team, own, opp] of [[g.team1, g.scoreTeam1!, g.scoreTeam2!], [g.team2, g.scoreTeam2!, g.scoreTeam1!]] as const) {
      for (const p of team) {
        const s = stats.get(p.id) ?? { player: p, wins: 0, games: 0, diff: 0 }
        s.games++
        s.diff += own - opp
        if (own > opp) s.wins++
        stats.set(p.id, s)
      }
    }
  }
  const tally = [...stats.values()]

  const out: NightSuperlatives = { perfect: [], bagels: [] }

  // MVP
  const gainer = [...updates].sort((a, b) => b.delta - a.delta)[0]
  if (gainer && gainer.delta > 0) {
    const s = stats.get(gainer.playerId)
    out.mvp = { player: { id: gainer.playerId, displayName: gainer.displayName }, delta: gainer.delta, wins: s?.wins ?? 0, games: s?.games ?? 0 }
  } else {
    const best = [...tally].sort((a, b) => b.wins - a.wins || b.diff - a.diff || byName(a.player, b.player))[0]
    if (best && best.wins > 0) out.mvp = { player: best.player, wins: best.wins, games: best.games }
  }

  out.perfect = tally
    .filter(s => s.games >= 2 && s.wins === s.games)
    .sort((a, b) => b.wins - a.wins || byName(a.player, b.player))
    .map(s => ({ player: s.player, wins: s.wins }))

  // upset: winners were rated lower going in
  for (const d of decided) {
    const { team1Elo, team2Elo } = d.game
    if (team1Elo == null || team2Elo == null) continue
    const winElo = d.winners === d.game.team1 ? team1Elo : team2Elo
    const loseElo = d.winners === d.game.team1 ? team2Elo : team1Elo
    const gap = loseElo - winElo
    if (gap > 0 && (!out.upset || gap > out.upset.gap)) out.upset = { ...d, gap }
  }

  for (const d of decided) {
    const margin = d.winScore - d.loseScore
    if (margin > NAIL_BITER_MAX_MARGIN) continue
    const best = out.nailBiter
    if (!best || margin < best.margin || (margin === best.margin && d.winScore + d.loseScore > best.winScore + best.loseScore)) {
      out.nailBiter = { ...d, margin }
    }
  }

  out.bagels = decided.filter(d => d.loseScore === 0)

  // dynamic duo
  const pairs = new Map<string, { players: [PlayerInfo, PlayerInfo]; wins: number; diff: number }>()
  for (const d of decided) {
    if (d.winners.length !== 2) continue
    const players = [...d.winners].sort((a, b) => a.id.localeCompare(b.id)) as [PlayerInfo, PlayerInfo]
    const key = players.map(p => p.id).join('|')
    const pr = pairs.get(key) ?? { players, wins: 0, diff: 0 }
    pr.wins++
    pr.diff += d.winScore - d.loseScore
    pairs.set(key, pr)
  }
  const duo = [...pairs.values()].sort((a, b) => b.wins - a.wins || b.diff - a.diff)[0]
  if (duo && duo.wins >= 2) out.duo = { players: duo.players, wins: duo.wins }

  // iron court
  const courts = new Map<number, number>()
  for (const g of scored) courts.set(g.courtIndex, (courts.get(g.courtIndex) ?? 0) + g.scoreTeam1! + g.scoreTeam2!)
  if (courts.size > 1) {
    const [idx, points] = [...courts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
    if (points > 0) out.ironCourt = { court: idx + 1, points }
  }

  return out
}

export type RecapKey = 'perfect' | 'upset' | 'nailBiter' | 'bagel' | 'duo' | 'ironCourt'
export interface RecapLine { key: RecapKey; title: string; line: string; score?: string; where?: string }

const pair = (ps: PlayerInfo[]) => ps.map(x => x.displayName).join(' & ')
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const scoreOf = (d: Decided) => `${d.winScore}–${d.loseScore}`
const whereOf = (d: Decided) => `Court ${d.game.courtIndex + 1}, round ${d.game.roundIndex + 1}`
export const fmtDelta = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`

/** The superlatives as short lines of copy, in the order the recap shows them. Shared by the page and the image. */
export function recapLines(s: NightSuperlatives): RecapLine[] {
  const out: RecapLine[] = []
  if (s.perfect.length) {
    const w = s.perfect[0].wins
    out.push({
      key: 'perfect', title: 'Perfect night',
      line: s.perfect.length > 3
        ? `${s.perfect.length} players didn't drop a game.`
        : `${list(s.perfect.map(x => x.player.displayName))} didn't drop a game${s.perfect.length === 1 ? `. ${w} for ${w}.` : '.'}`
    })
  }
  if (s.upset) out.push({ key: 'upset', title: 'Upset of the night', line: `${pair(s.upset.winners)} beat a team rated ${Math.round(s.upset.gap)} higher.`, score: scoreOf(s.upset), where: whereOf(s.upset) })
  if (s.nailBiter) out.push({ key: 'nailBiter', title: 'Nail-biter', line: `${pair(s.nailBiter.winners)} edged ${pair(s.nailBiter.losers)} by ${s.nailBiter.margin}.`, score: scoreOf(s.nailBiter), where: whereOf(s.nailBiter) })
  if (s.bagels.length) {
    const b = s.bagels[0]
    out.push({
      key: 'bagel', title: s.bagels.length === 1 ? 'Bagel' : `${s.bagels.length} bagels`,
      line: s.bagels.length === 1 ? `${pair(b.winners)} served one up, fresh out of the oven.` : `${pair(b.winners)} served the first one.`,
      score: scoreOf(b), where: whereOf(b)
    })
  }
  if (s.duo) out.push({ key: 'duo', title: 'Dynamic duo', line: `${s.duo.players[0].displayName} and ${s.duo.players[1].displayName} won ${s.duo.wins} together.` })
  if (s.ironCourt) out.push({ key: 'ironCourt', title: 'Iron court', line: `Court ${s.ironCourt.court} put up ${s.ironCourt.points} points, the most of the night.` })
  return out
}
