import { api } from '@/app/core/http/api-client'
import type {
  SpondConfirmLinksResponse,
  SpondEventListResponse,
  SpondGroupLinkDto,
  SpondGroupListResponse,
  SpondResolveResponse,
  SpondStatusDto,
  SpondAttendeeLinkInput
} from '@/app/core/models/dto'

export const spondApi = {
  async status(): Promise<SpondStatusDto> {
    return api.get('/api/spond/status')
  },

  async connect(email: string, password: string): Promise<SpondStatusDto> {
    return api.post('/api/spond/connect', { email, password })
  },

  async disconnect(): Promise<void> {
    return api.delete('/api/spond/disconnect')
  },

  async listGroups(): Promise<SpondGroupListResponse> {
    return api.get('/api/spond/groups')
  },

  async getGroupLink(groupId: string): Promise<SpondGroupLinkDto> {
    return api.get(`/api/spond/groups/${groupId}/link`)
  },

  async setGroupLink(groupId: string, spondGroupId: string): Promise<SpondGroupLinkDto> {
    return api.put(`/api/spond/groups/${groupId}/link`, { spondGroupId })
  },

  async listEvents(groupId: string): Promise<SpondEventListResponse> {
    return api.get(`/api/spond/groups/${groupId}/events`)
  },

  async resolveEvent(groupId: string, spondEventId: string): Promise<SpondResolveResponse> {
    return api.get(`/api/spond/groups/${groupId}/events/${spondEventId}/resolve`)
  },

  async confirmLinks(
    groupId: string,
    spondEventId: string,
    links: SpondAttendeeLinkInput[]
  ): Promise<SpondConfirmLinksResponse> {
    return api.post(`/api/spond/groups/${groupId}/events/${spondEventId}/confirm`, { links })
  }
}
