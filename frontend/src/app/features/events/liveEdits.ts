import type { EventDto, GameDto, PlayerInfo } from '@/app/core/models/dto'

export type Slots = { team1P1: string; team1P2: string; team2P1: string; team2P2: string }

/** Players of one round, alphabetical — the people a swap can choose from. */
export function roundPlayers(games: GameDto[]): PlayerInfo[] {
  const seen = new Map<string, PlayerInfo>()
  for (const g of games) for (const p of [...g.team1, ...g.team2]) if (!seen.has(p.id)) seen.set(p.id, p)
  return [...seen.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/** Everyone in the event, alphabetical — the people a court's teams can be changed to. */
export function eventPlayers(event: Pick<EventDto, 'games'>): PlayerInfo[] {
  return roundPlayers(event.games)
}

/**
 * Validate a team change for one court. Besides the four seats being filled and distinct,
 * a player may not also be playing on another court in the same round.
 */
export function validateTeams(slots: Slots, game: GameDto, round: GameDto[], names: Map<string, string>): string {
  const ids = [slots.team1P1, slots.team1P2, slots.team2P1, slots.team2P2]
  if (ids.some(id => !id)) return 'Choose a player for all four spots.'
  if (new Set(ids).size !== 4) return 'Each spot needs a different player.'
  for (const other of round) {
    if (other.id === game.id) continue
    for (const p of [...other.team1, ...other.team2]) {
      if (ids.includes(p.id)) return `${names.get(p.id) ?? p.displayName} is already on court ${other.courtIndex + 1} this round.`
    }
  }
  return ''
}

/**
 * Merge a fresh server copy into the local event during live sync.
 * Courts the organizer is touching here (saving, unsaved, or open in the sheet) keep the local copy;
 * status only moves forward so a stale read can't undo GENERATED -> IN_PROGRESS.
 */
export function mergeLive(local: EventDto, fresh: EventDto, busy: (gameId: string) => boolean): EventDto {
  const rank = { DRAFT: 0, GENERATED: 1, IN_PROGRESS: 2, COMPLETED: 3 } as const
  const byId = new Map(local.games.map(g => [g.id, g]))
  const games = fresh.games.map(g => (busy(g.id) ? byId.get(g.id) ?? g : g))
  const status = rank[fresh.status] > rank[local.status] ? fresh.status : local.status
  return { ...local, ...fresh, status, games }
}

/** Plain note when matchmaking had to widen the rating gap to find a schedule. */
export function relaxNote(meta?: EventDto['generationMeta']): string {
  if (!meta || !meta.relaxIterations || meta.eloDiffUsed <= meta.eloDiffConfigured) return ''
  const pct = (n: number) => `${Math.round(n * 100)}%`
  return `Teams could differ by up to ${pct(meta.eloDiffUsed)} in rating (your setting is ${pct(meta.eloDiffConfigured)}) so the pairing rules could be met.`
}
