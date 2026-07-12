import { api } from '@/app/core/http/api-client'
import type {
  AwardEditionDto,
  AwardCategoryDto,
  StatAwardDto,
  AwardEditionStatus
} from '@/app/core/models/dto'

export interface CreateEditionRequest {
  title: string
  statAwards: StatAwardDto[]
}

export interface UpdateEditionRequest {
  title?: string
  status?: AwardEditionStatus
}

export interface AddCategoryRequest {
  title: string
  description?: string
}

export interface VoteResponse {
  ok: boolean
  myVote: string
}

export const awardsApi = {
  /** Latest awards edition for the group, or null when none exists yet. */
  async getAwards(groupId: string): Promise<AwardEditionDto | null> {
    return api.get<AwardEditionDto | null>(`/api/groups/${groupId}/awards`)
  },

  /** Create a DRAFT edition with a frozen stat-award snapshot. */
  async createEdition(groupId: string, data: CreateEditionRequest): Promise<AwardEditionDto> {
    const result = await api.post<AwardEditionDto>(`/api/groups/${groupId}/awards`, data)
    api.invalidateCache(`/api/groups/${groupId}/awards`)
    return result
  },

  /** Update title and/or advance the edition's status. */
  async updateEdition(
    groupId: string,
    editionId: string,
    data: UpdateEditionRequest
  ): Promise<AwardEditionDto> {
    const result = await api.patch<AwardEditionDto>(
      `/api/groups/${groupId}/awards/${editionId}`,
      data
    )
    api.invalidateCache(`/api/groups/${groupId}/awards`)
    return result
  },

  /** Add a voting category to a DRAFT edition. */
  async addCategory(
    groupId: string,
    editionId: string,
    data: AddCategoryRequest
  ): Promise<AwardCategoryDto> {
    const result = await api.post<AwardCategoryDto>(
      `/api/groups/${groupId}/awards/${editionId}/categories`,
      data
    )
    api.invalidateCache(`/api/groups/${groupId}/awards`)
    return result
  },

  /** Remove a voting category. */
  async deleteCategory(groupId: string, categoryId: string): Promise<void> {
    await api.delete(`/api/groups/${groupId}/awards/categories/${categoryId}`)
    api.invalidateCache(`/api/groups/${groupId}/awards`)
  },

  /** Cast (or change) the caller's vote in a category. */
  async vote(groupId: string, categoryId: string, nomineeGroupPlayerId: string): Promise<VoteResponse> {
    const result = await api.post<VoteResponse>(
      `/api/groups/${groupId}/awards/categories/${categoryId}/vote`,
      { nomineeGroupPlayerId }
    )
    api.invalidateCache(`/api/groups/${groupId}/awards`)
    return result
  },

  /** Delete the whole edition. */
  async deleteEdition(groupId: string, editionId: string): Promise<void> {
    await api.delete(`/api/groups/${groupId}/awards/${editionId}`)
    api.invalidateCache(`/api/groups/${groupId}/awards`)
  }
}
