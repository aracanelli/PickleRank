import { api } from '@/app/core/http/api-client'
import type {
  EventDto,
  EventListResponse,
  GenerateResponse,
  SwapResponse,
  CompleteResponse,
  GameDto
} from '@/app/core/models/dto'

export interface CreateEventRequest {
  name?: string
  startsAt?: string
  courts: number
  rounds: number
  participantIds: string[]
}

export interface SwapRequest {
  roundIndex: number
  player1Id: string
  player2Id: string
}

export interface ScoreUpdateRequest {
  scoreTeam1?: number
  scoreTeam2?: number
}

export const eventsApi = {
  async list(groupId: string, status?: string): Promise<EventListResponse> {
    const params = status ? `?status=${status}` : ''
    return api.get(`/api/groups/${groupId}/events${params}`)
  },

  async get(eventId: string): Promise<EventDto> {
    return api.get(`/api/events/${eventId}`)
  },

  async create(groupId: string, data: CreateEventRequest): Promise<EventDto> {
    return api.post(`/api/groups/${groupId}/events`, data)
  },

  async generate(eventId: string, newSeed: boolean = false): Promise<GenerateResponse> {
    return api.post(`/api/events/${eventId}/generate`, { newSeed })
  },

  async swap(eventId: string, data: SwapRequest): Promise<SwapResponse> {
    return api.post(`/api/events/${eventId}/swap`, data)
  },

  async updateScore(gameId: string, data: ScoreUpdateRequest): Promise<GameDto> {
    return api.patch(`/api/games/${gameId}/score`, data)
  },

  async complete(eventId: string, groupId?: string): Promise<CompleteResponse> {
    const result = await api.post<CompleteResponse>(`/api/events/${eventId}/complete`)
    // Invalidate all caches related to rankings/players after event completion
    if (groupId) {
      api.invalidateCache(`/api/groups/${groupId}/players`)
      api.invalidateCache(`/api/groups/${groupId}/rankings`)
    }
    // Also invalidate any pattern matching this group
    api.invalidateCache('/api/groups')
    return result
  },

  async delete(eventId: string): Promise<void> {
    return api.delete(`/api/events/${eventId}`)
  },

  async update(eventId: string, data: { name?: string }): Promise<EventDto> {
    return api.patch(`/api/events/${eventId}`, data)
  },

  async deleteGame(gameId: string): Promise<void> {
    return api.delete(`/api/games/${gameId}`)
  },

  async updateGamePlayers(gameId: string, data: {
    team1P1: string
    team1P2: string
    team2P1: string
    team2P2: string
  }, groupId?: string): Promise<GameDto> {
    const result = await api.patch<GameDto>(`/api/games/${gameId}/players`, data)
    // Player swap can trigger ELO recalculation
    if (groupId) {
      api.invalidateCache(`/api/groups/${groupId}/players`)
      api.invalidateCache(`/api/groups/${groupId}/rankings`)
    }
    return result
  }
}







