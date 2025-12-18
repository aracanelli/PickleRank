const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export interface ApiError {
  status: number
  message: string
  detail?: string
}

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
   * GET request with caching support.
   * Use for frequently accessed, rarely changing data like rankings.
   * 
   * @param endpoint - API endpoint
   * @param ttl - Cache TTL in milliseconds (default: 30000ms = 30s)
   */
  async getCached<T>(endpoint: string, ttl?: number): Promise<T> {
    const cached = this.apiCache.get<T>(endpoint, ttl)
    if (cached) {
      return cached
    }

    const data = await this.get<T>(endpoint)
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

