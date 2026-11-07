/**
 * Staged corrections to a completed event: score changes, game deletes and player swaps.
 * Nothing is sent until save; the editor shows the staged view on top of the saved games.
 * All functions mutate the Staged object in place so it can live in a Vue reactive().
 */
import type { GameDto } from '@/app/core/models/dto'
import { validatePair } from '@/app/features/events/scoreInput'

export const SLOTS = ['team1P1', 'team1P2', 'team2P1', 'team2P2'] as const
export type Slot = typeof SLOTS[number]
export type Lineup = Record<Slot, string>
export interface Pick { gameId: string; slot: Slot }

export interface Staged {
  /** Raw score text per side, only for games whose text differs from the saved score. */
  scores: Record<string, { s1: string; s2: string }>
  /** Full lineup per game, only for games whose lineup differs from the saved one. */
  swaps: Record<string, Lineup>
  deletes: string[]
  /** Some writes went through but ratings were not recalculated yet. */
  pendingRecalc: boolean
}

export const emptyStaged = (): Staged => ({ scores: {}, swaps: {}, deletes: [], pendingRecalc: false })

export function resetStaged(s: Staged) {
  Object.assign(s, emptyStaged())
}

const text = (n?: number | null) => (n == null ? '' : String(n))

export const lineupOf = (g: GameDto): Lineup => ({
  team1P1: g.team1[0]?.id ?? '',
  team1P2: g.team1[1]?.id ?? '',
  team2P1: g.team2[0]?.id ?? '',
  team2P2: g.team2[1]?.id ?? ''
})

export const currentLineup = (s: Staged, g: GameDto): Lineup => s.swaps[g.id] ?? lineupOf(g)

export const currentScores = (s: Staged, g: GameDto) => s.scores[g.id] ?? { s1: text(g.scoreTeam1), s2: text(g.scoreTeam2) }

export const isDeleted = (s: Staged, gameId: string) => s.deletes.includes(gameId)

/** Names for every player id in the event, so a cross-game swap still shows the right name. */
export function nameMap(games: GameDto[]) {
  const map: Record<string, string> = {}
  for (const g of games) for (const p of [...g.team1, ...g.team2]) map[p.id] = p.displayName
  return map
}

export function stageScore(s: Staged, g: GameDto, side: 1 | 2, raw: string) {
  const next = { ...currentScores(s, g), [side === 1 ? 's1' : 's2']: raw }
  if (next.s1 === text(g.scoreTeam1) && next.s2 === text(g.scoreTeam2)) delete s.scores[g.id]
  else s.scores[g.id] = next
}

function stageLineup(s: Staged, g: GameDto, next: Lineup) {
  const orig = lineupOf(g)
  if (SLOTS.every(k => next[k] === orig[k])) delete s.swaps[g.id]
  else s.swaps[g.id] = next
}

export const SWAP_ROUND_ERROR = 'Players can only be swapped within the same round.'

/**
 * Swap the players at two positions, in one game or across two games of the same round.
 * Returns an error message instead of swapping when the positions are in different rounds.
 */
export function swapPlayers(s: Staged, games: GameDto[], a: Pick, b: Pick): string | null {
  const ga = games.find(g => g.id === a.gameId)
  const gb = games.find(g => g.id === b.gameId)
  if (!ga || !gb) return 'That game is no longer in this event.'
  if (isDeleted(s, ga.id) || isDeleted(s, gb.id)) return 'That game is marked for deletion.'
  if (ga.roundIndex !== gb.roundIndex) return SWAP_ROUND_ERROR
  if (ga.id === gb.id && a.slot === b.slot) return null

  const la = { ...currentLineup(s, ga) }
  const pa = la[a.slot]
  if (ga.id === gb.id) {
    la[a.slot] = la[b.slot]
    la[b.slot] = pa
    stageLineup(s, ga, la)
    return null
  }
  const lb = { ...currentLineup(s, gb) }
  la[a.slot] = lb[b.slot]
  lb[b.slot] = pa
  stageLineup(s, ga, la)
  stageLineup(s, gb, lb)
  return null
}

export function stageDelete(s: Staged, gameId: string) {
  if (!s.deletes.includes(gameId)) s.deletes.push(gameId)
  delete s.scores[gameId]
  delete s.swaps[gameId]
}

export function undoDelete(s: Staged, gameId: string) {
  s.deletes = s.deletes.filter(id => id !== gameId)
}

export function changeCount(s: Staged) {
  return s.deletes.length + Object.keys(s.scores).length + Object.keys(s.swaps).length
}

export const isDirty = (s: Staged) => changeCount(s) > 0 || s.pendingRecalc

/** Score problems per staged game; a correction must leave both sides with a whole number. */
export function scoreErrors(s: Staged) {
  const out: Record<string, { error1?: string; error2?: string }> = {}
  for (const [id, v] of Object.entries(s.scores)) {
    const r = validatePair(v.s1, v.s2)
    if (!r.ok) out[id] = { error1: r.error1, error2: r.error2 }
  }
  return out
}

export interface CorrectionApi {
  deleteGame(gameId: string): Promise<unknown>
  updateScore(gameId: string, body: { scoreTeam1: number; scoreTeam2: number }): Promise<unknown>
  updateGamePlayers(gameId: string, body: Lineup): Promise<unknown>
  recalculate(): Promise<unknown>
}

export interface SaveFailure { gameId: string; kind: 'delete' | 'score' | 'players'; message: string }
export type SaveResult = { ok: true } | { ok: false; failures: SaveFailure[]; recalcError?: string }

const msg = (e: unknown, fallback: string) => (e as { message?: string })?.message || fallback

/**
 * Save order: deletes one at a time (stop at the first failure), then score changes and
 * swaps in parallel (stop if any failed), then one ratings recalculation.
 * Each write that succeeds is removed from the staged set, so a retry only sends what is left.
 */
export async function saveCorrections(s: Staged, api: CorrectionApi): Promise<SaveResult> {
  for (const id of [...s.deletes]) {
    try {
      await api.deleteGame(id)
      undoDelete(s, id)
      s.pendingRecalc = true
    } catch (e) {
      return { ok: false, failures: [{ gameId: id, kind: 'delete', message: msg(e, 'Game not deleted') }] }
    }
  }

  const failures: SaveFailure[] = []
  const scoreJobs = Object.entries(s.scores).map(async ([id, v]) => {
    const body = { scoreTeam1: Number(v.s1), scoreTeam2: Number(v.s2) }
    try {
      await api.updateScore(id, body)
      // keep the entry if it was edited again while saving
      if (s.scores[id] === v) delete s.scores[id]
      s.pendingRecalc = true
    } catch (e) {
      failures.push({ gameId: id, kind: 'score', message: msg(e, 'Score not saved') })
    }
  })
  const swapJobs = Object.entries(s.swaps).map(async ([id, lineup]) => {
    try {
      await api.updateGamePlayers(id, lineup)
      if (s.swaps[id] === lineup) delete s.swaps[id]
      s.pendingRecalc = true
    } catch (e) {
      failures.push({ gameId: id, kind: 'players', message: msg(e, 'Players not swapped') })
    }
  })
  await Promise.all([...scoreJobs, ...swapJobs])
  if (failures.length) return { ok: false, failures }

  if (s.pendingRecalc) {
    try {
      await api.recalculate()
      s.pendingRecalc = false
    } catch (e) {
      return { ok: false, failures: [], recalcError: msg(e, 'Ratings not recalculated') }
    }
  }
  return { ok: true }
}
