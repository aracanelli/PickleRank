import type { GroupDto, GroupPlayerDto } from '@/app/core/models/dto'

/**
 * A league organizer is the owner or a linked player with the ORGANIZER role.
 * UI gating only; the backend enforces the same rule on every write.
 */
export function isOrganizerOf(
  group: Pick<GroupDto, 'ownerUserId'> | null | undefined,
  players: Pick<GroupPlayerDto, 'userId' | 'role'>[],
  userId: string | null | undefined
): boolean {
  if (!group || !userId) return false
  if (group.ownerUserId === userId) return true
  return players.some(p => p.userId === userId && p.role === 'ORGANIZER')
}

/** The current user's own group player, if their account is linked in this league. */
export function myGroupPlayer<T extends Pick<GroupPlayerDto, 'userId'>>(players: T[], userId: string | null | undefined): T | null {
  if (!userId) return null
  return players.find(p => p.userId === userId) ?? null
}
