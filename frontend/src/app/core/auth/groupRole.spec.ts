import { describe, it, expect } from 'vitest'
import { isOrganizerOf, myGroupPlayer } from './groupRole'

describe('isOrganizerOf', () => {
  const group = { ownerUserId: 'owner' }
  it('owner is organizer', () => expect(isOrganizerOf(group, [], 'owner')).toBe(true))
  it('linked ORGANIZER player is organizer', () =>
    expect(isOrganizerOf(group, [{ userId: 'u2', role: 'ORGANIZER' }], 'u2')).toBe(true))
  it('linked PLAYER is not', () =>
    expect(isOrganizerOf(group, [{ userId: 'u3', role: 'PLAYER' }], 'u3')).toBe(false))
  it('no user or group is not', () => {
    expect(isOrganizerOf(group, [], null)).toBe(false)
    expect(isOrganizerOf(null, [], 'owner')).toBe(false)
  })
  it('finds my player', () =>
    expect(myGroupPlayer([{ userId: 'a' }, { userId: 'b' }], 'b')).toEqual({ userId: 'b' }))
})
