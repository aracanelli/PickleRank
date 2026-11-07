import type { EventDto, GameDto } from '@/app/core/models/dto'

export const isScored = (g: Pick<GameDto, 'scoreTeam1' | 'scoreTeam2'>) => g.scoreTeam1 != null && g.scoreTeam2 != null

export function gamesByRound(event: Pick<EventDto, 'rounds' | 'games'>): GameDto[][] {
  const rounds: GameDto[][] = Array.from({ length: event.rounds }, () => [])
  for (const g of event.games) rounds[g.roundIndex]?.push(g)
  for (const r of rounds) r.sort((a, b) => a.courtIndex - b.courtIndex)
  return rounds
}

/** The round an organizer should see first: the first one with an unscored court, else the last. */
export function currentRoundIndex(event: Pick<EventDto, 'rounds' | 'games'>): number {
  const rounds = gamesByRound(event)
  const i = rounds.findIndex(r => r.length > 0 && r.some(g => !isScored(g)))
  return i === -1 ? Math.max(0, rounds.length - 1) : i
}

export function progress(event: Pick<EventDto, 'rounds' | 'games'>) {
  const total = event.games.length
  const scored = event.games.filter(isScored).length
  const round = currentRoundIndex(event)
  const roundGames = gamesByRound(event)[round] ?? []
  return {
    total,
    scored,
    remaining: total - scored,
    allScored: total > 0 && scored === total,
    round,
    roundGames,
    roundScored: roundGames.filter(isScored).length
  }
}

export function eventTitle(e: { name?: string | null; startsAt?: string | null }) {
  if (e.name?.trim()) return e.name.trim()
  if (e.startsAt) return `Event on ${formatDay(e.startsAt)}`
  return 'Untitled event'
}

export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
