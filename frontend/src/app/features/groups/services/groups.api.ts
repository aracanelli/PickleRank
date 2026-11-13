import { api } from '@/app/core/http/api-client'
import { outbox, whenSettled } from '@/app/core/offline/sync'
import { newId } from '@/app/core/offline/network'
import type { OutboxOutcome } from '@/app/core/offline/outbox'
import type {
  GroupDto,
  GroupListResponse,
  GroupSettings,
  GroupPlayerListResponse,
  GroupPlayerDto,
  MembershipType,
  SkillLevel,
  BulkAddPlayersToGroupRequest,
  BulkAddPlayersToGroupResponse,
  GroupRole,
  PlayerStats
} from '@/app/core/models/dto'

export interface CreateGroupRequest {
  name: string
  sport?: string
  settings?: Partial<GroupSettings>
}

export interface UpdateGroupSettingsRequest {
  ratingSystem?: 'SERIOUS_ELO' | 'CATCH_UP' | 'RACS_ELO'
  initialRating?: number
  kFactor?: number
  eloConst?: number
  eloDiff?: number
  noRepeatTeammateInEvent?: boolean
  noRepeatTeammateFromPreviousEvent?: boolean
  noRepeatOpponentInEvent?: boolean
  autoRelaxEloDiff?: boolean
  autoRelaxStep?: number
  autoRelaxMaxEloDiff?: number
  defaultRounds?: number
  paymentSettings?: {
    trackPayments: boolean
    subFeePerAttendance: number
    currency: string
  }
}

/** Mirrors the server's GroupSettings defaults, for a league created before it reaches the server. */
export const DEFAULT_GROUP_SETTINGS: GroupSettings = {
  ratingSystem: 'SERIOUS_ELO',
  initialRating: 1000,
  kFactor: 32,
  eloDiff: 0.05,
  noRepeatTeammateInEvent: true,
  noRepeatTeammateFromPreviousEvent: true,
  noRepeatOpponentInEvent: true,
  autoRelaxEloDiff: true,
  autoRelaxStep: 0.01,
  autoRelaxMaxEloDiff: 0.25,
  defaultRounds: 1
}

export const groupsApi = {
  async list(onCached?: (r: GroupListResponse) => void): Promise<GroupListResponse> {
    // Cache group list for 5 minutes (invalidated on mutations)
    return api.getCached('/api/groups', 300000, { onCached })
  },

  async listMemberGroups(onCached?: (r: GroupListResponse) => void): Promise<GroupListResponse> {
    // Cache member groups for 5 minutes (invalidated on mutations)
    return api.getCached('/api/groups/member', 300000, { onCached })
  },

  async get(groupId: string, onCached?: (g: GroupDto) => void): Promise<GroupDto> {
    // Cache group details for 5 minutes (invalidated on mutations)
    return api.getCached(`/api/groups/${groupId}`, 300000, { onCached })
  },

  /**
   * Create a league on this device right away (works offline). The id is made here, so the
   * league can be opened and used at once; the outbox creates it on the server (idempotently,
   * by that id) as soon as there is a connection.
   */
  createQueued(name: string, ownerUserId: string): { group: GroupDto; settled: Promise<OutboxOutcome> } {
    const id = newId()
    const group: GroupDto = {
      id, ownerUserId, name, sport: 'pickleball',
      settings: { ...DEFAULT_GROUP_SETTINGS },
      createdAt: new Date().toISOString()
    }
    api.setCached(`/api/groups/${id}`, group)
    api.setCached(`/api/groups/${id}/players`, { players: [] })
    const list = api.peek<GroupListResponse>('/api/groups')
    api.setCached<GroupListResponse>('/api/groups', {
      groups: [{ id, name, sport: group.sport, playerCount: 0, createdAt: group.createdAt }, ...(list?.groups ?? [])]
    })
    const op = outbox.enqueue({ key: `group-create:${id}`, method: 'POST', url: '/api/groups', body: { id, name }, label: `Create ${name}` })
    return { group, settled: whenSettled(op) }
  },

  async create(data: CreateGroupRequest): Promise<GroupDto> {
    const result = await api.post<GroupDto>('/api/groups', data)
    api.invalidateCache('/api/groups')
    return result
  },

  async updateSettings(groupId: string, data: UpdateGroupSettingsRequest): Promise<GroupDto> {
    const result = await api.patch<GroupDto>(`/api/groups/${groupId}/settings`, data)
    api.invalidateCache(`/api/groups/${groupId}`)
    return result
  },

  async rename(groupId: string, name: string): Promise<GroupDto> {
    const result = await api.patch<GroupDto>(`/api/groups/${groupId}`, { name })
    api.invalidateCache('/api/groups')
    api.invalidateCache(`/api/groups/${groupId}`)
    return result
  },

  async getPlayers(groupId: string, onCached?: (r: GroupPlayerListResponse) => void): Promise<GroupPlayerListResponse> {
    // Cache player list for 5 minutes (invalidated on mutations)
    return api.getCached(`/api/groups/${groupId}/players`, 300000, { onCached })
  },

  async addPlayer(
    groupId: string,
    playerId: string,
    membershipType: MembershipType = 'PERMANENT',
    skillLevel?: SkillLevel,
    role: GroupRole = 'PLAYER'
  ): Promise<GroupPlayerDto> {
    const result = await api.post<GroupPlayerDto>(`/api/groups/${groupId}/players`, {
      playerId,
      membershipType,
      skillLevel,
      role
    })
    api.invalidateCache(`/api/groups/${groupId}/players`)
    return result
  },

  async bulkAddPlayers(groupId: string, data: BulkAddPlayersToGroupRequest): Promise<BulkAddPlayersToGroupResponse> {
    const result = await api.post<BulkAddPlayersToGroupResponse>(`/api/groups/${groupId}/players/bulk`, data)
    api.invalidateCache(`/api/groups/${groupId}/players`)
    return result
  },

  async updateGroupPlayer(
    groupId: string,
    groupPlayerId: string,
    params: {
      membershipType?: MembershipType
      skillLevel?: SkillLevel
      role?: GroupRole
    }
  ): Promise<GroupPlayerDto> {
    const result = await api.patch<GroupPlayerDto>(`/api/groups/${groupId}/players/${groupPlayerId}`, params)
    api.invalidateCache(`/api/groups/${groupId}/players`)
    return result
  },

  async removePlayer(groupId: string, groupPlayerId: string): Promise<void> {
    await api.delete(`/api/groups/${groupId}/players/${groupPlayerId}`)
    api.invalidateCache(`/api/groups/${groupId}/players`)
  },

  async recalculateRatings(groupId: string): Promise<{
    eventsRecalculated: number
    playersUpdated: number
    topPlayers: Array<{ displayName: string, rating: number, wins: number, losses: number }>
  }> {
    const result = await api.post<{
      eventsRecalculated: number
      playersUpdated: number
      topPlayers: Array<{ displayName: string, rating: number, wins: number, losses: number }>
    }>(`/api/groups/${groupId}/recalculate-ratings`)
    // Invalidate all group-related caches after recalculation
    api.invalidateCache(`/api/groups/${groupId}`)
    return result
  },

  async archive(groupId: string): Promise<GroupDto> {
    const result = await api.post<GroupDto>(`/api/groups/${groupId}/archive`)
    api.invalidateCache('/api/groups')
    api.invalidateCache(`/api/groups/${groupId}`)
    return result
  },


  async duplicate(groupId: string): Promise<GroupDto> {
    const result = await api.post<GroupDto>(`/api/groups/${groupId}/duplicate`)
    api.invalidateCache('/api/groups')
    return result
  },

  async getPlayerStats(groupId: string, playerId: string, onCached?: (s: PlayerStats) => void): Promise<PlayerStats> {
    return api.get(`/api/groups/${groupId}/players/${playerId}/stats`, { onCached })
  },

  async getEventRatingHistory(eventId: string): Promise<Record<string, Array<{ round: number, rating: number, delta?: number, type: string, label: string }>>> {
    return api.get(`/api/events/${eventId}/rating-history`)
  }
}







