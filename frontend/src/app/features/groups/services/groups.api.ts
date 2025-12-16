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
  GroupRole
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
    return api.get('/api/groups')
  },

  async listMemberGroups(): Promise<GroupListResponse> {
    return api.get('/api/groups/member')
  },

  async get(groupId: string): Promise<GroupDto> {
    return api.get(`/api/groups/${groupId}`)
  },

  async create(data: CreateGroupRequest): Promise<GroupDto> {
    return api.post('/api/groups', data)
  },

  async updateSettings(groupId: string, data: UpdateGroupSettingsRequest): Promise<GroupDto> {
    return api.patch(`/api/groups/${groupId}/settings`, data)
  },

  async rename(groupId: string, name: string): Promise<GroupDto> {
    return api.patch(`/api/groups/${groupId}`, { name })
  },

  async getPlayers(groupId: string): Promise<GroupPlayerListResponse> {
    return api.get(`/api/groups/${groupId}/players`)
  },

  async addPlayer(
    groupId: string,
    playerId: string,
    membershipType: MembershipType = 'PERMANENT',
    skillLevel?: SkillLevel,
    role: GroupRole = 'PLAYER'
  ): Promise<GroupPlayerDto> {
    return api.post(`/api/groups/${groupId}/players`, {
      playerId,
      membershipType,
      skillLevel,
      role
    })
  },

  async bulkAddPlayers(groupId: string, data: BulkAddPlayersToGroupRequest): Promise<BulkAddPlayersToGroupResponse> {
    return api.post(`/api/groups/${groupId}/players/bulk`, data)
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
    return api.patch(`/api/groups/${groupId}/players/${groupPlayerId}`, params)
  },

  async removePlayer(groupId: string, groupPlayerId: string): Promise<void> {
    return api.delete(`/api/groups/${groupId}/players/${groupPlayerId}`)
  },

  async recalculateRatings(groupId: string): Promise<{
    eventsRecalculated: number
    playersUpdated: number
    topPlayers: Array<{ displayName: string, rating: number, wins: number, losses: number }>
  }> {
    return api.post(`/api/groups/${groupId}/recalculate-ratings`)
  },

  async archive(groupId: string): Promise<GroupDto> {
    return api.post(`/api/groups/${groupId}/archive`)
  },

  async duplicate(groupId: string): Promise<GroupDto> {
    return api.post(`/api/groups/${groupId}/duplicate`)
  }
}




