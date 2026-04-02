import { describe, it, expect, beforeEach, vi } from 'vitest'

// We can't directly import ApiCache since it's not exported, so we test it
// through the api client. Instead, let's test the cache logic by recreating
// the class in isolation -- OR we can test through the public api.
// Let's test via the exported api client's caching behavior.

// Since api-client.ts uses import.meta.env and has side effects, we mock fetch
// and test the caching behavior through the public interface.

describe('ApiClient cache behavior', () => {
  let apiModule: typeof import('@/app/core/http/api-client')

  beforeEach(async () => {
    vi.resetModules()
    // Mock fetch globally
    global.fetch = vi.fn()

    // Mock the clerk module to avoid real auth
    vi.doMock('@/app/core/auth/clerk', () => ({
      waitForAuth: vi.fn().mockResolvedValue(undefined),
      getToken: vi.fn().mockResolvedValue('mock-token')
    }))

    apiModule = await import('@/app/core/http/api-client')
  })

  it('getCached returns cached data on second call within TTL', async () => {
    const mockData = { rankings: [{ rank: 1, name: 'Player1' }] }
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData)
    })

    const api = apiModule.api
    // First call should fetch
    const result1 = await api.getCached('/api/test-endpoint', 60000)
    expect(result1).toEqual(mockData)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    // Second call should use cache (no additional fetch)
    const result2 = await api.getCached('/api/test-endpoint', 60000)
    expect(result2).toEqual(mockData)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('invalidateCache clears cached entries matching pattern', async () => {
    const mockData = { groups: [] }
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData)
    })

    const api = apiModule.api

    // Populate cache
    await api.getCached('/api/groups/123/rankings')
    expect(global.fetch).toHaveBeenCalledTimes(1)

    // Invalidate
    api.invalidateCache('/api/groups/123')

    // Should fetch again
    await api.getCached('/api/groups/123/rankings')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('handleResponse throws ApiError for non-OK responses', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ detail: 'Group not found' })
    })

    const api = apiModule.api

    await expect(api.get('/api/groups/nonexistent')).rejects.toMatchObject({
      status: 404,
      message: 'Group not found'
    })
  })

  it('handleResponse returns null for 204 No Content', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 204,
      statusText: 'No Content'
    })

    const api = apiModule.api
    const result = await api.delete('/api/events/123')
    expect(result).toBeNull()
  })

  it('post sends JSON body', async () => {
    const responseData = { id: 'new-group', name: 'My Group' }
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve(responseData)
    })

    const api = apiModule.api
    const result = await api.post('/api/groups', { name: 'My Group', sport: 'pickleball' })

    expect(result).toEqual(responseData)
    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(fetchCall[1].method).toBe('POST')
    expect(JSON.parse(fetchCall[1].body)).toEqual({ name: 'My Group', sport: 'pickleball' })
  })
})
