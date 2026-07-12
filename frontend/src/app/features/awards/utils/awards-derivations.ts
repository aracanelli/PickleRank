import type {
  GroupPlayerDto,
  MatchHistoryEntryDto,
  RankingEntryDto,
  StatAwardDto,
  AwardWinnerRef
} from '@/app/core/models/dto'
import { outcomeFor } from '@/app/features/rankings/utils/match-derivations'

// Pure computation of the frozen "season superlatives" stat awards, run on the
// organizer's client at creation time and stored as a snapshot. IDs are
// GROUP-PLAYER ids throughout (history team ids); each winner also carries the
// global playerId for profile links + avatar seeds.

export interface AwardsInput {
  rankings: RankingEntryDto[]
  matches: MatchHistoryEntryDto[]
  players: GroupPlayerDto[]
  initialRating: number
}

function chronological(matches: MatchHistoryEntryDto[]): MatchHistoryEntryDto[] {
  return [...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

/** Longest run of a single outcome across a player's full (chronological) history. */
function longestStreak(
  matches: MatchHistoryEntryDto[],
  groupPlayerId: string,
  want: 'W' | 'L'
): number {
  let best = 0
  let run = 0
  for (const match of chronological(matches)) {
    const outcome = outcomeFor(match, groupPlayerId)
    if (outcome === null) continue
    if (outcome === want) {
      run++
      best = Math.max(best, run)
    } else {
      run = 0
    }
  }
  return best
}

/**
 * Compute the stat-award snapshot. Returns only awards that have a qualifying
 * winner (min-games guards keep tiny clubs from producing noise).
 */
export function computeStatAwards(input: AwardsInput): StatAwardDto[] {
  const { rankings, matches, players, initialRating } = input
  const awards: StatAwardDto[] = []

  // group-player id -> winner ref (name + global id)
  const refByGpId = new Map<string, AwardWinnerRef>()
  players.forEach((p) =>
    refByGpId.set(p.id, { groupPlayerId: p.id, playerId: p.playerId, displayName: p.displayName })
  )
  const ref = (gpId: string): AwardWinnerRef | undefined => refByGpId.get(gpId)

  // Global-playerId -> group player, for joining rankings (global id) to gp id
  const byGlobal = new Map<string, GroupPlayerDto>()
  players.forEach((p) => byGlobal.set(p.playerId, p))

  const withGames = players.filter((p) => p.gamesPlayed > 0)

  // 🏆 Club Champion — top of the ladder
  const champion = [...rankings]
    .filter((r) => r.gamesPlayed > 0)
    .sort((a, b) => a.rank - b.rank)[0]
  if (champion) {
    const gp = byGlobal.get(champion.playerId)
    if (gp) {
      awards.push({
        key: 'champion',
        emoji: '🏆',
        title: 'Club Champion',
        blurb: 'Top of the ladder when the dust settled.',
        winner: ref(gp.id)!,
        value: Math.round(champion.rating),
        detail: `${champion.wins}W · ${Math.round(champion.winRate * 100)}% win rate`
      })
    }
  }

  // 📈 Most Improved — biggest climb from the starting rating
  const improvers = withGames
    .filter((p) => p.gamesPlayed >= 3)
    .map((p) => ({ p, gain: p.rating - initialRating }))
    .filter((x) => x.gain > 0)
    .sort((a, b) => b.gain - a.gain)
  if (improvers.length) {
    const { p, gain } = improvers[0]
    awards.push({
      key: 'mostImproved',
      emoji: '📈',
      title: 'Most Improved',
      blurb: 'Climbed the furthest from where they started.',
      winner: ref(p.id)!,
      value: Math.round(gain * 100) / 100,
      detail: `${Math.round(initialRating)} → ${Math.round(p.rating)}`
    })
  }

  // 🎯 Most Wins
  const mostWins = [...withGames].filter((p) => p.wins > 0).sort((a, b) => b.wins - a.wins)[0]
  if (mostWins) {
    awards.push({
      key: 'mostWins',
      emoji: '🎯',
      title: 'Most Wins',
      blurb: 'Racked up more victories than anyone.',
      winner: ref(mostWins.id)!,
      value: mostWins.wins,
      detail: `${mostWins.wins}W in ${mostWins.gamesPlayed} games`
    })
  }

  // 🏓 Iron Player — never missed a beat
  const ironPlayer = [...withGames].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0]
  if (ironPlayer) {
    awards.push({
      key: 'ironPlayer',
      emoji: '🏓',
      title: 'Iron Player',
      blurb: 'Showed up and played more games than anyone.',
      winner: ref(ironPlayer.id)!,
      value: ironPlayer.gamesPlayed,
      detail: `${ironPlayer.gamesPlayed} games played`
    })
  }

  // 💯 Sharpshooter — best win rate (needs a real sample)
  const sharp = [...withGames]
    .filter((p) => p.gamesPlayed >= 5)
    .sort((a, b) => b.winRate - a.winRate)[0]
  if (sharp && sharp.winRate > 0) {
    awards.push({
      key: 'sharpshooter',
      emoji: '💯',
      title: 'Sharpshooter',
      blurb: 'The deadliest win rate in the club.',
      winner: ref(sharp.id)!,
      value: Math.round(sharp.winRate * 100),
      detail: `${Math.round(sharp.winRate * 100)}% · ${sharp.wins}-${sharp.losses}-${sharp.ties}`
    })
  }

  // 🔥 Hot Hand — longest win streak
  let hotHand: { gpId: string; len: number } | null = null
  let heartbreak: { gpId: string; len: number } | null = null
  for (const p of withGames) {
    const w = longestStreak(matches, p.id, 'W')
    if (w >= 3 && (!hotHand || w > hotHand.len)) hotHand = { gpId: p.id, len: w }
    const l = longestStreak(matches, p.id, 'L')
    if (l >= 3 && (!heartbreak || l > heartbreak.len)) heartbreak = { gpId: p.id, len: l }
  }
  if (hotHand && ref(hotHand.gpId)) {
    awards.push({
      key: 'hotHand',
      emoji: '🔥',
      title: 'Hot Hand',
      blurb: 'Reeled off the longest win streak of the season.',
      winner: ref(hotHand.gpId)!,
      value: hotHand.len,
      detail: `${hotHand.len} wins in a row`
    })
  }

  // 🤝 Dream Team — best duo by win rate (min games together)
  const pairStats = new Map<string, { a: string; b: string; games: number; wins: number }>()
  for (const m of matches) {
    for (const team of [m.team1Ids, m.team2Ids]) {
      if (!team || team.length < 2) continue
      const outcome = outcomeFor(m, team[0])
      if (outcome === null) continue
      const [a, b] = [...team].sort()
      const key = `${a}|${b}`
      const entry = pairStats.get(key) ?? { a, b, games: 0, wins: 0 }
      entry.games++
      if (outcome === 'W') entry.wins++
      pairStats.set(key, entry)
    }
  }
  const dreamTeam = [...pairStats.values()]
    .filter((d) => d.games >= 3 && ref(d.a) && ref(d.b))
    .map((d) => ({ ...d, rate: d.wins / d.games }))
    .sort((a, b) => b.rate - a.rate || b.games - a.games)[0]
  if (dreamTeam && dreamTeam.wins > 0) {
    awards.push({
      key: 'dreamTeam',
      emoji: '🤝',
      title: 'Dream Team',
      blurb: 'The most unstoppable partnership on the court.',
      winner: ref(dreamTeam.a)!,
      partner: ref(dreamTeam.b)!,
      value: Math.round(dreamTeam.rate * 100),
      detail: `${dreamTeam.wins}-${dreamTeam.games - dreamTeam.wins} together`
    })
  }

  // 🎆 Biggest Upset — lower-rated pair took down a higher-rated one
  let upset: { winners: string[]; gap: number; score?: string } | null = null
  for (const m of matches) {
    if (m.team1Elo == null || m.team2Elo == null) continue
    if (m.result !== 'TEAM1_WIN' && m.result !== 'TEAM2_WIN') continue
    const team1Won = m.result === 'TEAM1_WIN'
    const winnerElo = team1Won ? m.team1Elo : m.team2Elo
    const loserElo = team1Won ? m.team2Elo : m.team1Elo
    const gap = loserElo - winnerElo
    if (gap <= 0) continue
    if (!upset || gap > upset.gap) {
      const winners = team1Won ? m.team1Ids : m.team2Ids
      const s1 = m.scoreTeam1
      const s2 = m.scoreTeam2
      upset = {
        winners: winners ?? [],
        gap,
        score: s1 != null && s2 != null ? `${Math.max(s1, s2)}-${Math.min(s1, s2)}` : undefined
      }
    }
  }
  if (upset && upset.winners.length >= 2 && ref(upset.winners[0]) && ref(upset.winners[1])) {
    awards.push({
      key: 'biggestUpset',
      emoji: '🎆',
      title: 'Biggest Upset',
      blurb: 'Toppled a much higher-rated pair. David, meet Goliath.',
      winner: ref(upset.winners[0])!,
      partner: ref(upset.winners[1])!,
      value: Math.round(upset.gap),
      detail: upset.score ? `Won ${upset.score} as ${Math.round(upset.gap)}-pt underdogs` : undefined
    })
  }

  // 😅 Heartbreak Kid — longest losing streak (a fun consolation trophy)
  if (heartbreak && ref(heartbreak.gpId)) {
    awards.push({
      key: 'heartbreak',
      emoji: '😅',
      title: 'Heartbreak Kid',
      blurb: 'Endured the longest cold streak — it can only get better.',
      winner: ref(heartbreak.gpId)!,
      value: heartbreak.len,
      detail: `${heartbreak.len} tough losses in a row`
    })
  }

  return awards
}
