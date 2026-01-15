import { api } from '@/app/core/http/api-client'
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
}

export const groupsApi = {
  async list(): Promise<GroupListResponse> {
    // Cache group list for 5 minutes (invalidated on mutations)
    return api.getCached('/api/groups', 300000)
  },

  async listMemberGroups(): Promise<GroupListResponse> {
    // Cache member groups for 5 minutes (invalidated on mutations)
    return api.getCached('/api/groups/member', 300000)
  },

  async get(groupId: string): Promise<GroupDto> {
    // Cache group details for 5 minutes (invalidated on mutations)
    return api.getCached(`/api/groups/${groupId}`, 300000)
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

  async getPlayers(groupId: string): Promise<GroupPlayerListResponse> {
    // Cache player list for 5 minutes (invalidated on mutations)
    return api.getCached(`/api/groups/${groupId}/players`, 300000)
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

  async getPlayerStats(groupId: string, playerId: string): Promise<PlayerStats> {
    return api.get(`/api/groups/${groupId}/players/${playerId}/stats`)
  },

  async getEventRatingHistory(eventId: string): Promise<Record<string, Array<{ round: number, rating: number, delta?: number, type: string, label: string }>>> {
    return api.get(`/api/events/${eventId}/rating-history`)
  }
}







