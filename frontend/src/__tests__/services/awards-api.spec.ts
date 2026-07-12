import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('awardsApi', () => {
  let awardsApi: typeof import('@/app/features/awards/services/awards.api').awardsApi

  beforeEach(async () => {
    vi.resetModules()

    global.fetch = vi.fn()

    vi.doMock('@/app/core/auth/clerk', () => ({
      waitForAuth: vi.fn().mockResolvedValue(undefined),
      getToken: vi.fn().mockResolvedValue('mock-token')
    }))

    const mod = await import('@/app/features/awards/services/awards.api')
    awardsApi = mod.awardsApi
  })

  function mockResponse(body: unknown, status = 200) {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status,
      json: () => Promise.resolve(body)
    })
  }

  function lastCall() {
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    return calls[calls.length - 1]
  }

  it('getAwards issues a GET to the edition endpoint', async () => {
    const edition = {
      id: 'e1',
      title: 'Spring Awards',
      status: 'DRAFT',
      statAwards: [],
      categories: [],
      canVote: false,
      createdAt: '2026-01-01T00:00:00Z'
    }
    mockResponse(edition)

    const result = await awardsApi.getAwards('group-123')
    expect(result).toEqual(edition)

    const [url, init] = lastCall()
    expect(url).toContain('/api/groups/group-123/awards')
    expect(init.method).toBe('GET')
  })

  it('getAwards returns null when no edition exists', async () => {
    mockResponse(null)
    const result = await awardsApi.getAwards('group-123')
    expect(result).toBeNull()
  })

  it('createEdition POSTs the title and stat-award snapshot', async () => {
    const statAwards = [
      {
        key: 'champion',
        emoji: '🏆',
        title: 'Club Champion',
        blurb: 'Top of the ladder.',
        winner: { groupPlayerId: 'gp1', playerId: 'p1', displayName: 'Alice' },
        value: 1234
      }
    ]
    mockResponse({ id: 'e1', title: 'Club Awards', status: 'DRAFT', statAwards, categories: [], canVote: false, createdAt: 'now' })

    await awardsApi.createEdition('group-123', { title: 'Club Awards', statAwards })

    const [url, init] = lastCall()
    expect(url).toContain('/api/groups/group-123/awards')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ title: 'Club Awards', statAwards })
  })

  it('updateEdition PATCHes the status transition', async () => {
    mockResponse({ id: 'e1', status: 'VOTING_OPEN' })

    await awardsApi.updateEdition('group-123', 'e1', { status: 'VOTING_OPEN' })

    const [url, init] = lastCall()
    expect(url).toContain('/api/groups/group-123/awards/e1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ status: 'VOTING_OPEN' })
  })

  it('addCategory POSTs to the edition categories endpoint', async () => {
    mockResponse({ id: 'c1', title: 'Best Comeback' })

    await awardsApi.addCategory('group-123', 'e1', { title: 'Best Comeback', description: 'From the brink' })

    const [url, init] = lastCall()
    expect(url).toContain('/api/groups/group-123/awards/e1/categories')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ title: 'Best Comeback', description: 'From the brink' })
  })

  it('deleteCategory DELETEs the category', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 204 })

    await awardsApi.deleteCategory('group-123', 'c1')

    const [url, init] = lastCall()
    expect(url).toContain('/api/groups/group-123/awards/categories/c1')
    expect(init.method).toBe('DELETE')
  })

  it('vote POSTs the nominee to the vote endpoint', async () => {
    mockResponse({ ok: true, myVote: 'gp9' })

    const result = await awardsApi.vote('group-123', 'c1', 'gp9')
    expect(result).toEqual({ ok: true, myVote: 'gp9' })

    const [url, init] = lastCall()
    expect(url).toContain('/api/groups/group-123/awards/categories/c1/vote')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ nomineeGroupPlayerId: 'gp9' })
  })

  it('deleteEdition DELETEs the edition', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 204 })

    await awardsApi.deleteEdition('group-123', 'e1')

    const [url, init] = lastCall()
    expect(url).toContain('/api/groups/group-123/awards/e1')
    expect(init.method).toBe('DELETE')
  })
})
