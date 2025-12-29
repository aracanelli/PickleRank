const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export interface ApiError {
  status: number
  message: string
  detail?: string
}

/**
 * Simple TTL cache for API responses with periodic cleanup and LRU eviction.
 * Reduces redundant network requests for frequently accessed data.
 */
interface CacheEntry<T> {
  data: T
  timestamp: number
  lastAccessed: number // For LRU eviction
  ttl: number
}

interface ApiCacheOptions {
  /** Default TTL in milliseconds (default: 30000ms = 30s) */
  defaultTTL?: number
  /** Interval for periodic cleanup in milliseconds (default: 60000ms = 60s) */
  cleanupIntervalMs?: number
  /** Maximum number of cache entries (default: 100). Set to 0 for unlimited. */
  maxCacheSize?: number
}

class ApiCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private defaultTTL: number
  private cleanupIntervalId: number | null = null
  private maxCacheSize: number
  /** In-flight promises map for request deduplication */
  private inFlight = new Map<string, Promise<unknown>>()

  constructor(options: ApiCacheOptions = {}) {
    this.defaultTTL = options.defaultTTL ?? 30000 // 30 seconds
    this.maxCacheSize = options.maxCacheSize ?? 100
    const cleanupIntervalMs = options.cleanupIntervalMs ?? 60000 // 60 seconds

    // Start periodic cleanup
    this.startPeriodicCleanup(cleanupIntervalMs)
  }

  /**
   * Start the periodic cleanup interval.
   */
  private startPeriodicCleanup(intervalMs: number): void {
    if (this.cleanupIntervalId !== null) {
      return // Already running
    }

    this.cleanupIntervalId = window.setInterval(() => {
      this.cleanupExpiredEntries()
    }, intervalMs)
  }

  /**
   * Remove all expired entries from the cache.
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= entry.ttl) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Perform LRU eviction when cache exceeds maxCacheSize.
   * Removes the least recently accessed entries.
   */
  private evictLRU(): void {
    if (this.maxCacheSize <= 0 || this.cache.size <= this.maxCacheSize) {
      return
    }

    // Convert to array and sort by lastAccessed (oldest first)
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)

    // Remove oldest entries until we're at maxCacheSize
    const entriesToRemove = this.cache.size - this.maxCacheSize
    for (let i = 0; i < entriesToRemove; i++) {
      this.cache.delete(entries[i][0])
    }
  }

  /**
   * Get a cached value if it exists and hasn't expired.
   * Updates lastAccessed timestamp for LRU tracking.
   */
  get<T>(key: string, ttl: number = this.defaultTTL): T | null {
    const entry = this.cache.get(key)
    if (entry && Date.now() - entry.timestamp < ttl) {
      // Update lastAccessed for LRU tracking
      entry.lastAccessed = Date.now()
      return entry.data as T
    }
    // Clean up expired entry
    if (entry) {
      this.cache.delete(key)
    }
    return null
  }

  /**
   * Store a value in the cache.
   * Performs LRU eviction if cache exceeds maxCacheSize.
   */
  set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    const now = Date.now()
    this.cache.set(key, { data, timestamp: now, lastAccessed: now, ttl })

    // Perform LRU eviction if necessary
    this.evictLRU()
  }

  /**
   * Invalidate cache entries matching a pattern.
   * If no pattern provided, clears entire cache.
   */
  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear()
      return
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Get current cache size (for monitoring/debugging).
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * Get an in-flight promise by key.
   */
  getInFlight<T>(key: string): Promise<T> | undefined {
    return this.inFlight.get(key) as Promise<T> | undefined
  }

  /**
   * Set an in-flight promise for a key.
   */
  setInFlight<T>(key: string, promise: Promise<T>): void {
    this.inFlight.set(key, promise)
  }

  /**
   * Delete an in-flight promise for a key.
   */
  deleteInFlight(key: string): void {
    this.inFlight.delete(key)
  }

  /**
   * Dispose of the cache and clear the cleanup interval.
   * Call this when the API client is being torn down to prevent memory leaks.
   */
  dispose(): void {
    if (this.cleanupIntervalId !== null) {
      window.clearInterval(this.cleanupIntervalId)
      this.cleanupIntervalId = null
    }
    this.cache.clear()
    this.inFlight.clear()
  }
}

class ApiClient {
  private baseUrl: string
  private authStore: ReturnType<typeof import('@/stores/auth').useAuthStore> | null = null
  private apiCache = new ApiCache()

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  /**
   * Initialize the auth store reference.
   * This must be called after Pinia is set up.
   */
  setAuthStore(store: ReturnType<typeof import('@/stores/auth').useAuthStore>) {
    this.authStore = store
  }

  private async getHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    }

    // Get token from auth store if available
    if (this.authStore) {
      await this.authStore.waitForAuth()
      const token = await this.authStore.getToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    } else {
      // Fallback to direct clerk import (for backwards compatibility)
      const { waitForAuth, getToken } = await import('@/app/core/auth/clerk')
      await waitForAuth()
      const token = await getToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    }

    return headers
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error: ApiError = {
        status: response.status,
        message: response.statusText
      }

      try {
        const data = await response.json()
        error.detail = data.detail || data.message
        error.message = error.detail || error.message
      } catch {
        // Response might not be JSON
      }

      // If unauthorized, might need to refresh or re-auth
      if (response.status === 401) {
        error.message = 'Please sign in to continue'
        // Clear auth state on 401
        if (this.authStore) {
          this.authStore.clearAuth()
        }
      }

      throw error
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null as T
    }

    return response.json()
  }

  async get<T>(endpoint: string): Promise<T> {
    const headers = await this.getHeaders()
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers,
      credentials: 'include' // Include cookies for session management
    })
    return this.handleResponse<T>(response)
  }

  /**
   * GET request with caching support and request deduplication.
   * 
   * **SECURITY CONSIDERATIONS:**
   * - Cache keys incorporate the current user ID (when authenticated) to prevent
   *   cross-user data leaks. Anonymous requests use 'anon' as the user context.
   * - By default, caching is disabled unless the endpoint is explicitly whitelisted
   *   in `safeToCache` or `requireUserScope: false` is passed in options.
   * - User-specific endpoints (e.g., /me, /profile) should NEVER be cached with
   *   `requireUserScope: false` as this could leak data between users.
   * 
   * **REQUEST DEDUPLICATION:**
   * - Concurrent calls for the same cache key will share a single network request,
   *   preventing redundant parallel fetches.
   * 
   * @param endpoint - API endpoint
   * @param options - Caching options
   * @param options.ttl - Cache TTL in milliseconds (default: 30000ms = 30s)
   * @param options.requireUserScope - If true (default), cache key includes user ID.
   *   Set to false ONLY for truly public/anonymous endpoints.
   * @param options.safeToCache - Explicit opt-in to enable caching. Required unless
   *   endpoint matches a known safe pattern.
   * 
   * @example
   * // Cache a user-scoped endpoint (safe - includes user ID in cache key)
   * await api.getCached('/groups/123/rankings', { safeToCache: true })
   * 
   * // Cache a public endpoint (no user context needed)
   * await api.getCached('/public/config', { requireUserScope: false, safeToCache: true })
   */
  async getCached<T>(
    endpoint: string,
    options: {
      ttl?: number
      /** If true (default), cache key includes user ID for security */
      requireUserScope?: boolean
      /** Explicit opt-in to enable caching for this endpoint */
      safeToCache?: boolean
    } = {}
  ): Promise<T> {
    const { ttl, requireUserScope = true, safeToCache = false } = options

    // Known safe endpoint patterns that can be cached without explicit opt-in
    const SAFE_ENDPOINT_PATTERNS = [
      /^\/groups\/[^/]+\/rankings$/,     // Group rankings (scoped by group ID)
      /^\/groups\/[^/]+\/leaderboard$/,  // Group leaderboards
      /^\/public\//,                      // Public endpoints
      /^\/config$/,                       // App configuration
    ]

    const isSafeEndpoint = safeToCache || SAFE_ENDPOINT_PATTERNS.some(pattern => pattern.test(endpoint))

    if (!isSafeEndpoint) {
      // Endpoint not whitelisted for caching, fall back to regular GET
      return this.get<T>(endpoint)
    }

    // Build cache key with user context for security
    const userContext = await this.getCacheUserContext()
    const cacheKey = requireUserScope
      ? `${userContext}:${endpoint}`
      : `anon:${endpoint}`

    // Check cache first
    const cached = this.apiCache.get<T>(cacheKey, ttl)
    if (cached) {
      return cached
    }

    // Check for in-flight request (request deduplication)
    const inFlightPromise = this.apiCache.getInFlight<T>(cacheKey)
    if (inFlightPromise) {
      return inFlightPromise
    }

    // Create and track the in-flight request
    const fetchPromise = this.get<T>(endpoint)
      .then(data => {
        this.apiCache.set(cacheKey, data, ttl)
        return data
      })
      .finally(() => {
        this.apiCache.deleteInFlight(cacheKey)
      })

    this.apiCache.setInFlight(cacheKey, fetchPromise)
    return fetchPromise
  }

  /**
   * Get a stable user context string for cache key generation.
   * Returns the user ID if authenticated, 'anon' otherwise.
   * @private
   */
  private async getCacheUserContext(): Promise<string> {
    if (this.authStore) {
      await this.authStore.waitForAuth()
      const userId = this.authStore.userId
      return userId || 'anon'
    }

    // Fallback to clerk import
    try {
      const { waitForAuth, getUser } = await import('@/app/core/auth/clerk')
      await waitForAuth()
      const user = getUser()
      return user?.id || 'anon'
    } catch {
      return 'anon'
    }
  }

  /**
   * Invalidate cached API responses.
   * Call after mutations that affect cached data.
   * 
   * @param pattern - Optional pattern to match cache keys (e.g., '/groups/123')
   */
  invalidateCache(pattern?: string): void {
    this.apiCache.invalidate(pattern)
  }

  /**
   * Dispose of the API client and clean up resources.
   * Call this when tearing down the client to prevent memory leaks.
   */
  dispose(): void {
    this.apiCache.dispose()
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const headers = await this.getHeaders()
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: data ? JSON.stringify(data) : undefined
    })
    return this.handleResponse<T>(response)
  }

  async patch<T>(endpoint: string, data: unknown): Promise<T> {
    const headers = await this.getHeaders()
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify(data)
    })
    return this.handleResponse<T>(response)
  }

  /**
   * PATCH request with keepalive option.
   * Use this for critical saves during page unload/navigation to ensure
   * the request completes even if the page is being closed.
   * Note: keepalive requests have a 64KB body size limit.
   */
  async patchWithKeepalive<T>(endpoint: string, data: unknown): Promise<T> {
    const headers = await this.getHeaders()
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
      keepalive: true
    })
    return this.handleResponse<T>(response)
  }

  async put<T>(endpoint: string, data: unknown): Promise<T> {
    const headers = await this.getHeaders()
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers,
      credentials: 'include',
      body: JSON.stringify(data)
    })
    return this.handleResponse<T>(response)
  }

  async delete<T>(endpoint: string): Promise<T> {
    const headers = await this.getHeaders()
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers,
      credentials: 'include'
    })
    return this.handleResponse<T>(response)
  }
}

export const api = new ApiClient(API_BASE_URL)

/**
 * Initialize the API client with the auth store.
 * Call this after Pinia is set up.
 */
export function initApiClient(store: ReturnType<typeof import('@/stores/auth').useAuthStore>) {
  api.setAuthStore(store)
}

