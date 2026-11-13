import { api } from '@/app/core/http/api-client'
import type { RankingsResponse, MatchHistoryResponse } from '@/app/core/models/dto'

export const rankingsApi = {
  async getRankings(groupId: string, onCached?: (r: RankingsResponse) => void): Promise<RankingsResponse> {
    // Cache rankings for 5 minutes (invalidated when events complete)
    return api.getCached(`/api/groups/${groupId}/rankings`, 300000, { onCached })
  },

  async getHistory(
    groupId: string,
    options?: {
      from?: string;
      to?: string;
      playerId?: string;
      eventId?: string;
      secondaryPlayerId?: string;
      relationship?: 'teammate' | 'opponent';
      limit?: number;
    },
    onCached?: (r: MatchHistoryResponse) => void
  ): Promise<MatchHistoryResponse> {
    const params = new URLSearchParams()
    if (options?.from) params.set('from', options.from)
    if (options?.to) params.set('to', options.to)
    if (options?.playerId) params.set('playerId', options.playerId)
    if (options?.eventId) params.set('eventId', options.eventId)
    if (options?.secondaryPlayerId) params.set('secondaryPlayerId', options.secondaryPlayerId)
    if (options?.relationship) params.set('relationship', options.relationship)
    if (options?.limit) params.set('limit', String(options.limit))

    const query = params.toString()
    return api.get(`/api/groups/${groupId}/history${query ? `?${query}` : ''}`, { onCached })
  }
}







