import type {
  AwardDivision,
  AwardWinnerRef,
  GroupPlayerDto,
  MatchHistoryEntryDto,
  RankingEntryDto,
  StatAwardDto
} from '@/app/core/models/dto'

// Pure computation of the frozen "season superlatives" stat awards, run on the
// organizer's client at creation time and stored as a snapshot. IDs are
// GROUP-PLAYER ids throughout (history team ids); each winner also carries the
// global playerId for profile links + avatar seeds.
//
// Awards are computed twice — once over everyone (subs included) and once over
// permanent players only — unless no sub ever played, in which case the two
// pools are identical and only the ALL division is emitted.

export interface AwardsInput {
  rankings: RankingEntryDto[]
  matches: MatchHistoryEntryDto[]
  players: GroupPlayerDto[]
}

/** A game decided by this margin or less counts as a nail-biter. */
const TIGHT_MARGIN = 2

type Outcome = 'W' | 'L' | 'T'

interface PlayerAgg {
  /** Chronological outcomes across the full season. */
  outcomes: Outcome[]
  tightGames: number
  tightWins: number
  underdogWins: number
  underdogGapSum: number
  scoredGames: number
  pointsFor: number
  pointsAgainst: number
  /** One entry per decided game with a partner, chronological. */
  partnerGames: { partnerId: string; won: boolean }[]
}

interface DuoAgg {
  a: string
  b: string
  games: number
  wins: number
}

interface RivalAgg {
  a: string
  b: string
  games: number
  aWins: number
}

interface SeasonAggregates {
  byPlayer: Map<string, PlayerAgg>
  duos: Map<string, DuoAgg>
  rivals: Map<string, RivalAgg>
  biggestUpset: { winners: string[]; gap: number; score?: string } | null
}

function chronological(matches: MatchHistoryEntryDto[]): MatchHistoryEntryDto[] {
  return [...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

function longestRun(outcomes: Outcome[], want: Outcome): number {
  let best = 0
  let run = 0
  for (const outcome of outcomes) {
    if (outcome === want) {
      run++
      best = Math.max(best, run)
    } else {
      run = 0
    }
  }
  return best
}

/** Decided-game (ties excluded) win rate; null when no decided games. */
function decidedRate(outcomes: Outcome[]): number | null {
  const decided = outcomes.filter((o) => o !== 'T')
  if (decided.length === 0) return null
  return decided.filter((o) => o === 'W').length / decided.length
}

/** One pass over the full match history building every per-player / per-pair stat. */
function buildAggregates(matches: MatchHistoryEntryDto[]): SeasonAggregates {
  const byPlayer = new Map<string, PlayerAgg>()
  const duos = new Map<string, DuoAgg>()
  const rivals = new Map<string, RivalAgg>()
  let biggestUpset: SeasonAggregates['biggestUpset'] = null

  const aggFor = (id: string): PlayerAgg => {
    let agg = byPlayer.get(id)
    if (!agg) {
      agg = {
        outcomes: [],
        tightGames: 0,
        tightWins: 0,
        underdogWins: 0,
        underdogGapSum: 0,
        scoredGames: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        partnerGames: []
      }
      byPlayer.set(id, agg)
    }
    return agg
  }

  for (const m of chronological(matches)) {
    const decided = m.result === 'TEAM1_WIN' || m.result === 'TEAM2_WIN'
    if (!decided && m.result !== 'TIE') continue
    const hasScores = m.scoreTeam1 != null && m.scoreTeam2 != null
    const margin = hasScores ? Math.abs(m.scoreTeam1! - m.scoreTeam2!) : null
    const team1Won = m.result === 'TEAM1_WIN'

    for (const side of [1, 2] as const) {
      const team = (side === 1 ? m.team1Ids : m.team2Ids) ?? []
      if (team.length === 0) continue
      const won = decided && team1Won === (side === 1)
      const outcome: Outcome = !decided ? 'T' : won ? 'W' : 'L'
      const ownScore = side === 1 ? m.scoreTeam1 : m.scoreTeam2
      const oppScore = side === 1 ? m.scoreTeam2 : m.scoreTeam1
      const ownElo = side === 1 ? m.team1Elo : m.team2Elo
      const oppElo = side === 1 ? m.team2Elo : m.team1Elo

      for (const id of team) {
        const agg = aggFor(id)
        agg.outcomes.push(outcome)
        if (hasScores) {
          agg.scoredGames++
          agg.pointsFor += ownScore!
          agg.pointsAgainst += oppScore!
        }
        if (decided && margin !== null && margin <= TIGHT_MARGIN) {
          agg.tightGames++
          if (won) agg.tightWins++
        }
        if (won && ownElo != null && oppElo != null && oppElo > ownElo) {
          agg.underdogWins++
          agg.underdogGapSum += oppElo - ownElo
        }
        if (decided && team.length >= 2) {
          const partnerId = team.find((t) => t !== id)
          if (partnerId) agg.partnerGames.push({ partnerId, won })
        }
      }

      if (decided && team.length >= 2) {
        const [a, b] = [...team].sort()
        const key = `${a}|${b}`
        const duo = duos.get(key) ?? { a, b, games: 0, wins: 0 }
        duo.games++
        if (won) duo.wins++
        duos.set(key, duo)
      }
    }

    // Cross-net stats (rivalries + single-game upsets), once per decided match.
    if (decided && m.team1Ids?.length && m.team2Ids?.length) {
      for (const p1 of m.team1Ids) {
        for (const p2 of m.team2Ids) {
          const [a, b] = [p1, p2].sort()
          const key = `${a}|${b}`
          const rival = rivals.get(key) ?? { a, b, games: 0, aWins: 0 }
          rival.games++
          if (m.team1Ids.includes(a) === team1Won) rival.aWins++
          rivals.set(key, rival)
        }
      }
      if (m.team1Elo != null && m.team2Elo != null) {
        const winnerElo = team1Won ? m.team1Elo : m.team2Elo
        const loserElo = team1Won ? m.team2Elo : m.team1Elo
        const gap = loserElo - winnerElo
        if (gap > 0 && (!biggestUpset || gap > biggestUpset.gap)) {
          const s1 = m.scoreTeam1
          const s2 = m.scoreTeam2
          biggestUpset = {
            winners: (team1Won ? m.team1Ids : m.team2Ids) ?? [],
            gap,
            score: s1 != null && s2 != null ? `${Math.max(s1, s2)}-${Math.min(s1, s2)}` : undefined
          }
        }
      }
    }
  }

  return { byPlayer, duos, rivals, biggestUpset }
}

/** Compute the award slate for one player pool (division). */
function computeDivision(
  division: AwardDivision,
  eligible: GroupPlayerDto[],
  rankings: RankingEntryDto[],
  season: SeasonAggregates
): StatAwardDto[] {
  const awards: StatAwardDto[] = []

  // group-player id -> winner ref (name + global id). Only eligible players get
  // a ref, so the `ref(...)` guards below quietly exclude the other pool.
  const refByGpId = new Map<string, AwardWinnerRef>()
  eligible.forEach((p) =>
    refByGpId.set(p.id, { groupPlayerId: p.id, playerId: p.playerId, displayName: p.displayName })
  )
  const ref = (gpId: string): AwardWinnerRef | undefined => refByGpId.get(gpId)

  // Global-playerId -> group player, for joining rankings (global id) to gp id
  const byGlobal = new Map<string, GroupPlayerDto>()
  eligible.forEach((p) => byGlobal.set(p.playerId, p))

  const withGames = eligible.filter((p) => p.gamesPlayed > 0)
  const aggOf = (gpId: string) => season.byPlayer.get(gpId)

  // 🏆 Club Champion — best-ranked eligible player
  const champion = [...rankings]
    .filter((r) => r.gamesPlayed > 0)
    .sort((a, b) => a.rank - b.rank)
    .find((r) => byGlobal.has(r.playerId))
  if (champion) {
    const gp = byGlobal.get(champion.playerId)!
    awards.push({
      key: 'champion',
      emoji: '🏆',
      title: 'Club Champion',
      blurb: 'Top of the ladder when the dust settled.',
      winner: ref(gp.id)!,
      value: Math.round(champion.rating),
      detail: `${champion.wins}W · ${Math.round(champion.winRate * 100)}% win rate`,
      division
    })
  }

  // 🚀 Second Wind — biggest win-rate surge from their early games to their
  // late ones. (Replaces "Most Improved": everyone starts at the same rating,
  // so final-rating climb just re-crowns the champion.)
  let surge: { gpId: string; lift: number; early: number; late: number } | null = null
  for (const p of withGames) {
    const agg = aggOf(p.id)
    if (!agg) continue
    const decided = agg.outcomes.filter((o) => o !== 'T')
    const half = Math.floor(decided.length / 2)
    if (half < 3) continue
    const rate = (xs: Outcome[]) => xs.filter((o) => o === 'W').length / xs.length
    const early = rate(decided.slice(0, half))
    const late = rate(decided.slice(half))
    const lift = late - early
    if (lift > 0 && (!surge || lift > surge.lift)) surge = { gpId: p.id, lift, early, late }
  }
  if (surge && ref(surge.gpId)) {
    awards.push({
      key: 'secondWind',
      emoji: '🚀',
      title: 'Second Wind',
      blurb: 'Flipped the script — biggest win-rate surge from their first half to their second.',
      winner: ref(surge.gpId)!,
      value: Math.round(surge.lift * 100),
      detail: `${Math.round(surge.early * 100)}% → ${Math.round(surge.late * 100)}% win rate`,
      division
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
      detail: `${mostWins.wins}W in ${mostWins.gamesPlayed} games`,
      division
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
      detail: `${Math.round(sharp.winRate * 100)}% · ${sharp.wins}-${sharp.losses}-${sharp.ties}`,
      division
    })
  }

  // 🔥 Hot Hand / 😅 Heartbreak Kid — longest win / loss streaks
  let hotHand: { gpId: string; len: number } | null = null
  let heartbreak: { gpId: string; len: number } | null = null
  for (const p of withGames) {
    const agg = aggOf(p.id)
    if (!agg) continue
    const w = longestRun(agg.outcomes, 'W')
    if (w >= 3 && (!hotHand || w > hotHand.len)) hotHand = { gpId: p.id, len: w }
    const l = longestRun(agg.outcomes, 'L')
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
      detail: `${hotHand.len} wins in a row`,
      division
    })
  }

  // 🧊 Ice in the Veins — best record in games decided by ≤2 points
  const clutch = withGames
    .map((p) => ({ p, agg: aggOf(p.id) }))
    .filter((x) => x.agg && x.agg.tightGames >= 3 && x.agg.tightWins * 2 > x.agg.tightGames)
    .map((x) => ({ ...x, rate: x.agg!.tightWins / x.agg!.tightGames }))
    .sort((a, b) => b.rate - a.rate || b.agg!.tightGames - a.agg!.tightGames)[0]
  if (clutch) {
    awards.push({
      key: 'iceVeins',
      emoji: '🧊',
      title: 'Ice in the Veins',
      blurb: `Owns the tight ones — best record in games decided by ${TIGHT_MARGIN} points or less.`,
      winner: ref(clutch.p.id)!,
      value: Math.round(clutch.rate * 100),
      detail: `${clutch.agg!.tightWins}-${clutch.agg!.tightGames - clutch.agg!.tightWins} in nail-biters`,
      division
    })
  }

  // 🗡️ Giant Slayer — most wins as the lower-rated team
  const slayer = withGames
    .map((p) => ({ p, agg: aggOf(p.id) }))
    .filter((x) => x.agg && x.agg.underdogWins >= 2)
    .sort(
      (a, b) =>
        b.agg!.underdogWins - a.agg!.underdogWins || b.agg!.underdogGapSum - a.agg!.underdogGapSum
    )[0]
  if (slayer) {
    awards.push({
      key: 'giantSlayer',
      emoji: '🗡️',
      title: 'Giant Slayer',
      blurb: 'Kept beating teams rated above them.',
      winner: ref(slayer.p.id)!,
      value: slayer.agg!.underdogWins,
      detail: `Avg +${Math.round(slayer.agg!.underdogGapSum / slayer.agg!.underdogWins)} pts against the odds`,
      division
    })
  }

  // 💥 Wrecking Ball — biggest average scoring margin
  const wrecker = withGames
    .map((p) => ({ p, agg: aggOf(p.id) }))
    .filter((x) => x.agg && x.agg.scoredGames >= 5)
    .map((x) => ({ ...x, diff: (x.agg!.pointsFor - x.agg!.pointsAgainst) / x.agg!.scoredGames }))
    .filter((x) => x.diff > 0)
    .sort((a, b) => b.diff - a.diff)[0]
  if (wrecker) {
    const diff = Math.round(wrecker.diff * 10) / 10
    awards.push({
      key: 'wreckingBall',
      emoji: '💥',
      title: 'Wrecking Ball',
      blurb: 'Blows games open — biggest average scoring margin in the club.',
      winner: ref(wrecker.p.id)!,
      value: diff,
      detail: `Outscores opponents by ${diff} a game`,
      division
    })
  }

  // 🧱 The Wall — fewest points allowed per game
  const wall = withGames
    .map((p) => ({ p, agg: aggOf(p.id) }))
    .filter((x) => x.agg && x.agg.scoredGames >= 5)
    .map((x) => ({ ...x, allowed: x.agg!.pointsAgainst / x.agg!.scoredGames }))
    .sort((a, b) => a.allowed - b.allowed)[0]
  if (wall) {
    const allowed = Math.round(wall.allowed * 10) / 10
    awards.push({
      key: 'theWall',
      emoji: '🧱',
      title: 'The Wall',
      blurb: 'Hardest player to score on, night after night.',
      winner: ref(wall.p.id)!,
      value: allowed,
      detail: `Opponents average just ${allowed} points`,
      division
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
      detail: `${ironPlayer.gamesPlayed} games played`,
      division
    })
  }

  // 🍀 Lucky Charm — teammates outperform their season norm when paired with them
  let charm: { gpId: string; lift: number; partners: number } | null = null
  for (const p of withGames) {
    const agg = aggOf(p.id)
    if (!agg || agg.partnerGames.length < 5) continue
    const partners = new Set(agg.partnerGames.map((g) => g.partnerId))
    if (partners.size < 2) continue
    let sum = 0
    let n = 0
    for (const g of agg.partnerGames) {
      const base = decidedRate(season.byPlayer.get(g.partnerId)?.outcomes ?? [])
      if (base === null) continue
      sum += (g.won ? 1 : 0) - base
      n++
    }
    if (n === 0) continue
    const lift = sum / n
    if (Math.round(lift * 100) >= 3 && (!charm || lift > charm.lift)) {
      charm = { gpId: p.id, lift, partners: partners.size }
    }
  }
  if (charm && ref(charm.gpId)) {
    awards.push({
      key: 'luckyCharm',
      emoji: '🍀',
      title: 'Lucky Charm',
      blurb: 'Teammates win more than they usually do whenever they pair up.',
      winner: ref(charm.gpId)!,
      value: Math.round(charm.lift * 100),
      detail: `Partners play +${Math.round(charm.lift * 100)}% above their norm, across ${charm.partners} partners`,
      division
    })
  }

  // 🤝 Dream Team — best duo by win rate (min games together)
  const dreamTeam = [...season.duos.values()]
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
      detail: `${dreamTeam.wins}-${dreamTeam.games - dreamTeam.wins} together`,
      division
    })
  }

  // 🥊 Blood Feud — the two players who met across the net the most
  const feud = [...season.rivals.values()]
    .filter((r) => r.games >= 4 && ref(r.a) && ref(r.b))
    .sort((a, b) => b.games - a.games)[0]
  if (feud) {
    const bWins = feud.games - feud.aWins
    const leader = feud.aWins >= bWins ? feud.a : feud.b
    const other = leader === feud.a ? feud.b : feud.a
    const leadW = Math.max(feud.aWins, bWins)
    const leadL = Math.min(feud.aWins, bWins)
    awards.push({
      key: 'bloodFeud',
      emoji: '🥊',
      title: 'Blood Feud',
      blurb: 'The defining rivalry — nobody faced off across the net more.',
      winner: ref(leader)!,
      partner: ref(other)!,
      value: feud.games,
      detail:
        leadW === leadL
          ? `Dead even at ${leadW}-${leadL}`
          : `${ref(leader)!.displayName} leads ${leadW}-${leadL}`,
      division
    })
  }

  // 🎆 Biggest Upset — lower-rated pair took down a higher-rated one
  const upset = season.biggestUpset
  if (upset && upset.winners.length >= 2 && ref(upset.winners[0]) && ref(upset.winners[1])) {
    awards.push({
      key: 'biggestUpset',
      emoji: '🎆',
      title: 'Biggest Upset',
      blurb: 'Toppled a much higher-rated pair. David, meet Goliath.',
      winner: ref(upset.winners[0])!,
      partner: ref(upset.winners[1])!,
      value: Math.round(upset.gap),
      detail: upset.score ? `Won ${upset.score} as ${Math.round(upset.gap)}-pt underdogs` : undefined,
      division
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
      detail: `${heartbreak.len} tough losses in a row`,
      division
    })
  }

  return awards
}

/**
 * Compute the stat-award snapshot. Returns only awards that have a qualifying
 * winner (min-games guards keep tiny clubs from producing noise). When any sub
 * has played, the slate is computed twice: an ALL division (everyone) and a
 * PERMANENT division (regulars only).
 */
export function computeStatAwards(input: AwardsInput): StatAwardDto[] {
  const { rankings, matches, players } = input
  const season = buildAggregates(matches)
  const all = computeDivision('ALL', players, rankings, season)
  const subsPlayed = players.some((p) => p.membershipType !== 'PERMANENT' && p.gamesPlayed > 0)
  if (!subsPlayed) return all
  const permanent = players.filter((p) => p.membershipType === 'PERMANENT')
  return [...all, ...computeDivision('PERMANENT', permanent, rankings, season)]
}
