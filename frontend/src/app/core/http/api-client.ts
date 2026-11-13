import { reportReachable } from '@/app/core/offline/network'
import { readPersisted, writePersisted, forgetPersisted, getPersistScope } from '@/app/core/offline/persist'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export interface ApiError {
  status: number
  message: string
  detail?: string
  /** true when no response arrived (offline, unreachable, or no session token while offline) */
  offline?: boolean
}

const offlineError = (): ApiError => ({ status: 0, message: 'No connection. Your changes are saved on this phone.', offline: true })

/**
 * Simple TTL cache for API responses.
 * Reduces redundant network requests for frequently accessed data.
 */
interface CacheEntry<T> {
  data: T
  timestamp: number
}

class ApiCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private defaultTTL = 30000 // 30 seconds

  /**
   * Get a cached value if it exists and hasn't expired.
   */
  get<T>(key: string, ttl: number = this.defaultTTL): T | null {
    const entry = this.cache.get(key)
    if (entry && Date.now() - entry.timestamp < ttl) {
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
   */
  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() })
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
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Clear all cache entries.
   * Call this when auth state changes to prevent user data leakage.
   */
  clear(): void {
    this.cache.clear()
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
      // No connection and Clerk not restored yet: fail fast instead of waiting out waitForAuth.
      if (!this.authStore.session && this.authStore.user && typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw offlineError()
      }
      await this.authStore.waitForAuth()
      const token = await this.authStore.getToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else if (this.authStore.user) {
        // Signed in on this device but Clerk can't mint a token (offline launch or no connection).
        // Sending without a token would 401 and sign the user out mid-event. Nudge Clerk to retry
        // (a captive Wi-Fi never fires an "online" event).
        void import('@/app/core/auth/clerk').then(m => (m as { retryInit?: () => void }).retryInit?.())
        throw offlineError()
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

  /** fetch that turns "no response" into an ApiError with offline: true and tracks reachability. */
  private async send(endpoint: string, init: RequestInit): Promise<Response> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, { credentials: 'include', ...init })
    } catch {
      reportReachable(false)
      throw offlineError()
    }
    reportReachable(true)
    return response
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
        // Clear auth state and cache on 401 to prevent user data leakage
        this.apiCache.clear()
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

  /**
   * GET. Successful responses are kept on the device (per user) so the next visit, or an
   * offline visit, can show them at once. With no connection the last kept copy is returned.
   *
   * @param opts.onCached - called synchronously with the last kept copy (if any) before the
   *   request goes out, so a screen can paint immediately and refresh when the call resolves.
   */
  async get<T>(endpoint: string, opts: { onCached?: (data: T) => void } = {}): Promise<T> {
    if (opts.onCached) {
      const kept = this.peek<T>(endpoint)
      if (kept != null) opts.onCached(kept)
    }
    const forUser = getPersistScope()
    try {
      const headers = await this.getHeaders()
      const response = await this.send(endpoint, { method: 'GET', headers })
      const data = await this.handleResponse<T>(response)
      writePersisted(endpoint, data, forUser)
      return data
    } catch (e) {
      if ((e as ApiError).offline) {
        const kept = readPersisted<T>(endpoint)
        if (kept != null) return kept
      }
      throw e
    }
  }

  /** Last known response for an endpoint (memory, then device), regardless of age. */
  peek<T>(endpoint: string): T | null {
    return this.apiCache.get<T>(endpoint, Number.POSITIVE_INFINITY) ?? readPersisted<T>(endpoint)
  }

  /** Drop the kept copy of an endpoint (it is gone or no longer visible to this user). */
  forget(endpoint: string): void {
    this.apiCache.invalidate(endpoint)
    forgetPersisted(endpoint)
  }

  /** Replace what's cached for an endpoint, e.g. after an optimistic change. */
  setCached<T>(endpoint: string, data: T): void {
    this.apiCache.set(endpoint, data)
    writePersisted(endpoint, data)
  }

  /**
   * GET request with in-memory TTL caching, falling back to the kept copy offline.
   *
   * @param endpoint - API endpoint
   * @param ttl - Cache TTL in milliseconds (default: 30000ms = 30s)
   */
  async getCached<T>(endpoint: string, ttl?: number, opts: { onCached?: (data: T) => void } = {}): Promise<T> {
    const cached = this.apiCache.get<T>(endpoint, ttl)
    if (cached) {
      return cached
    }

    const data = await this.get<T>(endpoint, opts)
    this.apiCache.set(endpoint, data)
    return data
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

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const headers = await this.getHeaders()
    const response = await this.send(endpoint, { method: 'POST', headers, body: data ? JSON.stringify(data) : undefined })
    return this.handleResponse<T>(response)
  }

  async patch<T>(endpoint: string, data: unknown): Promise<T> {
    const headers = await this.getHeaders()
    const response = await this.send(endpoint, { method: 'PATCH', headers, body: JSON.stringify(data) })
    return this.handleResponse<T>(response)
  }

  async put<T>(endpoint: string, data: unknown): Promise<T> {
    const headers = await this.getHeaders()
    const response = await this.send(endpoint, { method: 'PUT', headers, body: JSON.stringify(data) })
    return this.handleResponse<T>(response)
  }

  /** PUT raw bytes (image uploads). The server ignores the content type and decodes the bytes itself. */
  async putBlob<T>(endpoint: string, body: Blob): Promise<T> {
    const headers = { ...(await this.getHeaders()), 'Content-Type': 'application/octet-stream' }
    const response = await this.send(endpoint, { method: 'PUT', headers, body })
    return this.handleResponse<T>(response)
  }

  /** GET bytes with the bearer token, for images that an <img> tag could not authenticate. */
  async getBlob(endpoint: string): Promise<Blob> {
    const headers = await this.getHeaders()
    const response = await this.send(endpoint, { method: 'GET', headers })
    if (!response.ok) await this.handleResponse(response)
    return response.blob()
  }

  /** Any method; used by the outbox to replay queued writes. */
  async request<T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', endpoint: string, data?: unknown, asUser?: string): Promise<T> {
    const headers = await this.getHeaders()
    // a queued write belongs to the user who made it; never send it with another user's token
    if (asUser !== undefined && this.authStore && this.authStore.userId !== asUser) throw offlineError()
    const response = await this.send(endpoint, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) })
    return this.handleResponse<T>(response)
  }

  async delete<T>(endpoint: string): Promise<T> {
    const headers = await this.getHeaders()
    const response = await this.send(endpoint, { method: 'DELETE', headers })
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

