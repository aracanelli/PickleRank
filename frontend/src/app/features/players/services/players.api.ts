import { api } from '@/app/core/http/api-client'
import type { PlayerDto, PlayerListResponse } from '@/app/core/models/dto'

export interface CreatePlayerRequest {
  displayName: string
  notes?: string
}

export interface UpdatePlayerRequest {
  displayName?: string
  notes?: string
}

export interface BulkCreatePlayersRequest {
  names: string[]
}

export interface BulkCreatePlayersResponse {
  created: PlayerDto[]
  skipped: string[]
  errors: string[]
}

export const playersApi = {
  async list(search?: string): Promise<PlayerListResponse> {
    const params = search ? `?search=${encodeURIComponent(search)}` : ''
    return api.get(`/api/players${params}`)
  },

  async get(playerId: string): Promise<PlayerDto> {
    return api.get(`/api/players/${playerId}`)
  },

  async create(data: CreatePlayerRequest): Promise<PlayerDto> {
    return api.post('/api/players', data)
  },

  async update(playerId: string, data: UpdatePlayerRequest): Promise<PlayerDto> {
    return api.patch(`/api/players/${playerId}`, data)
  },

  async bulkCreate(data: BulkCreatePlayersRequest): Promise<BulkCreatePlayersResponse> {
    return api.post('/api/players/bulk', data)
  }
}




