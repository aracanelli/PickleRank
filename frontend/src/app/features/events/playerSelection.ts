import type { GroupPlayerDto } from '@/app/core/models/dto'

export const COURTS_MIN = 1
export const COURTS_MAX = 10
export const ROUNDS_MIN = 1
export const ROUNDS_MAX = 20
export const PLAYERS_PER_COURT = 4

export const clampCourts = (n: number) => Math.min(COURTS_MAX, Math.max(COURTS_MIN, Math.round(n)))
export const clampRounds = (n: number) => Math.min(ROUNDS_MAX, Math.max(ROUNDS_MIN, Math.round(n)))
export const requiredFor = (courts: number) => courts * PLAYERS_PER_COURT

/** Starting point: enough courts for every regular, regulars pre-selected up to the court limit. */
export function initialSelection(players: Pick<GroupPlayerDto, 'id' | 'membershipType'>[]) {
  const regulars = players.filter(p => p.membershipType === 'PERMANENT').map(p => p.id)
  const courts = clampCourts(Math.ceil(regulars.length / PLAYERS_PER_COURT) || 1)
  return { courts, selected: new Set(regulars.slice(0, requiredFor(courts))) }
}

/** Toggle one player. Never exceeds the required count; returns a new Set. */
export function toggle(selected: ReadonlySet<string>, id: string, required: number): Set<string> {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else if (next.size < required) next.add(id)
  return next
}

/** After lowering courts, drop the most recently added players beyond the new limit. */
export function trimTo(selected: ReadonlySet<string>, required: number): Set<string> {
  if (selected.size <= required) return new Set(selected)
  return new Set(Array.from(selected).slice(0, required))
}

export function selectionMessage(selected: number, required: number) {
  if (selected === required) return `${selected} of ${required} players selected. Ready.`
  if (selected < required) {
    const n = required - selected
    return `${selected} of ${required} players selected. Add ${n} more.`
  }
  const n = selected - required
  return `${selected} of ${required} players selected. Remove ${n}.`
}
