import { api } from '@/app/core/http/api-client'
import type { RankingsResponse, MatchHistoryResponse } from '@/app/core/models/dto'

export const rankingsApi = {
  async getRankings(groupId: string): Promise<RankingsResponse> {
    // Cache rankings for 60 seconds - data changes infrequently
    return api.getCached(`/api/groups/${groupId}/rankings`, 60000)
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
    }
  ): Promise<MatchHistoryResponse> {
    const params = new URLSearchParams()
    if (options?.from) params.set('from', options.from)
    if (options?.to) params.set('to', options.to)
    if (options?.playerId) params.set('playerId', options.playerId)
    if (options?.eventId) params.set('eventId', options.eventId)
    if (options?.secondaryPlayerId) params.set('secondaryPlayerId', options.secondaryPlayerId)
    if (options?.relationship) params.set('relationship', options.relationship)

    const query = params.toString()
    return api.get(`/api/groups/${groupId}/history${query ? `?${query}` : ''}`)
  }
}




