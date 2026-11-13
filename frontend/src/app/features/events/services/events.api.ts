import { api } from '@/app/core/http/api-client'
import { outbox, whenSettled } from '@/app/core/offline/sync'
import { newId } from '@/app/core/offline/network'
import type { OutboxOutcome } from '@/app/core/offline/outbox'
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

/** Outbox key of an event's queued "make the schedule" request. */
export const scheduleKey = (eventId: string) => `event-gen:${eventId}`

export const eventsApi = {
  async list(groupId: string, status?: string, onCached?: (r: EventListResponse) => void): Promise<EventListResponse> {
    const params = status ? `?status=${status}` : ''
    return api.get(`/api/groups/${groupId}/events${params}`, { onCached })
  },

  /** @param onCached - receives the last copy kept on this device first, for an instant paint */
  async get(eventId: string, onCached?: (e: EventDto) => void): Promise<EventDto> {
    return api.get(`/api/events/${eventId}`, { onCached })
  },

  /**
   * Start an event on this device right away (works offline): queue "create" (with an id made
   * here, so the server creates it once even if replayed) and "make the schedule" behind it.
   * Matchmaking runs on the server, so the schedule appears once the queue reaches it.
   */
  createQueued(groupId: string, data: CreateEventRequest): { event: EventDto; schedule: Promise<OutboxOutcome> } {
    const id = newId()
    const event: EventDto = {
      id, groupId, name: data.name, status: 'DRAFT', startsAt: data.startsAt,
      courts: data.courts, rounds: data.rounds, participantCount: data.participantIds.length, games: []
    }
    api.setCached(`/api/events/${id}`, event)
    outbox.enqueue({ key: `event-create:${id}`, method: 'POST', url: `/api/groups/${groupId}/events`, body: { ...data, id }, label: `Create ${data.name || 'event'}` })
    const gen = outbox.enqueue({ key: scheduleKey(id), method: 'POST', url: `/api/events/${id}/generate`, body: { newSeed: false }, label: 'Make the schedule' })
    return { event, schedule: whenSettled(gen) }
  },

  async create(groupId: string, data: CreateEventRequest): Promise<EventDto> {
    return api.post(`/api/groups/${groupId}/events`, data)
  },

  async generate(eventId: string, newSeed: boolean = false): Promise<GenerateResponse> {
    // Reshuffling an event with scores deletes them; the server requires force for that and the
    // UI only reshuffles after the organizer confirmed.
    return api.post(`/api/events/${eventId}/generate`, newSeed ? { newSeed, force: true } : { newSeed })
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







