import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('rankingsApi', () => {
  let rankingsApi: typeof import('@/app/features/rankings/services/rankings.api').rankingsApi

  beforeEach(async () => {
    vi.resetModules()

    global.fetch = vi.fn()

    vi.doMock('@/app/core/auth/clerk', () => ({
      waitForAuth: vi.fn().mockResolvedValue(undefined),
      getToken: vi.fn().mockResolvedValue('mock-token')
    }))

    const mod = await import('@/app/features/rankings/services/rankings.api')
    rankingsApi = mod.rankingsApi
  })

  it('getRankings calls the correct endpoint', async () => {
    const mockRankings = {
      rankings: [
        { rank: 1, playerId: 'p1', displayName: 'Alice', rating: 1200, gamesPlayed: 10, wins: 7, losses: 3, ties: 0, winRate: 0.7 }
      ]
    }
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockRankings)
    })

    const result = await rankingsApi.getRankings('group-123')
    expect(result).toEqual(mockRankings)

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain('/api/groups/group-123/rankings')
  })

  it('getHistory builds query params correctly', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ matches: [] })
    })

    await rankingsApi.getHistory('group-456', {
      playerId: 'p1',
      from: '2024-01-01',
      relationship: 'teammate'
    })

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('/api/groups/group-456/history')
    expect(url).toContain('playerId=p1')
    expect(url).toContain('from=2024-01-01')
    expect(url).toContain('relationship=teammate')
  })

  it('getHistory works without options', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ matches: [] })
    })

    await rankingsApi.getHistory('group-789')

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('/api/groups/group-789/history')
    expect(url).not.toContain('?')
  })
})
