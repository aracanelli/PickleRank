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

  async complete(eventId: string): Promise<CompleteResponse> {
    return api.post(`/api/events/${eventId}/complete`)
  },

  async delete(eventId: string): Promise<void> {
    return api.delete(`/api/events/${eventId}`)
  }
}



