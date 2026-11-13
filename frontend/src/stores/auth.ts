import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

// Types for Clerk user
interface ClerkUser {
  id: string
  firstName: string | null
  lastName: string | null
  fullName: string | null
  emailAddresses: Array<{ emailAddress: string }>
  imageUrl: string | null
  primaryEmailAddress?: { emailAddress: string }
}

interface ClerkSession {
  id: string
  userId: string
  status: string
  getToken: () => Promise<string | null>
}

// Session cache structure
interface CachedSession {
  userId: string
  email: string
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
  timestamp: number
}

// Storage keys
const SESSION_CACHE_KEY = 'picklerank_session_cache'
const MULTI_SESSION_KEY = 'picklerank_sessions'
// Long enough to open the app offline after a couple of weeks off; the server still checks real tokens.
const SESSION_CACHE_DURATION = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * Auth Store - Manages authentication state with Clerk
 * 
 * Features:
 * - Reactive auth state
 * - Session caching in localStorage
 * - Multi-account support
 * - Automatic session restoration
 */
export const useAuthStore = defineStore('auth', () => {
  // State
  const user = ref<ClerkUser | null>(null)
  const session = ref<ClerkSession | null>(null)
  const isLoading = ref(true)
  const isInitialized = ref(false)
  const error = ref<string | null>(null)
  const cachedSessions = ref<CachedSession[]>([])
  // Signed in on this device per the cached session, not yet confirmed by Clerk (still loading,
  // or offline). Lets the app open straight away and work offline; Clerk replaces or clears it.
  const provisional = ref(false)

  // Computed
  const isAuthenticated = computed(() => !!user.value && (!!session.value || provisional.value))
  const userId = computed(() => user.value?.id || null)
  const userEmail = computed(() => 
    user.value?.primaryEmailAddress?.emailAddress || 
    user.value?.emailAddresses?.[0]?.emailAddress || 
    null
  )
  const userName = computed(() => 
    user.value?.fullName || 
    user.value?.firstName || 
    userEmail.value?.split('@')[0] || 
    'User'
  )
  const userInitials = computed(() => {
    if (user.value?.firstName) {
      const first = user.value.firstName[0] || ''
      const last = user.value.lastName?.[0] || ''
      return (first + last).toUpperCase() || '?'
    }
    return userEmail.value?.[0]?.toUpperCase() || '?'
  })

  // Load cached sessions from localStorage
  function loadCachedSessions(): CachedSession[] {
    try {
      const stored = localStorage.getItem(MULTI_SESSION_KEY)
      if (stored) {
        const sessions: CachedSession[] = JSON.parse(stored)
        // Filter out expired sessions
        const now = Date.now()
        return sessions.filter(s => (now - s.timestamp) < SESSION_CACHE_DURATION)
      }
    } catch (e) {
      console.warn('Failed to load cached sessions:', e)
    }
    return []
  }

  // Save session to cache
  function cacheCurrentSession() {
    if (!user.value || !session.value) return

    const sessionData: CachedSession = {
      userId: user.value.id,
      email: userEmail.value || '',
      firstName: user.value.firstName,
      lastName: user.value.lastName,
      imageUrl: user.value.imageUrl,
      timestamp: Date.now()
    }

    try {
      // Save single session cache
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(sessionData))

      // Update multi-session cache
      const sessions = loadCachedSessions()
      const existingIndex = sessions.findIndex(s => s.userId === sessionData.userId)
      if (existingIndex >= 0) {
        sessions[existingIndex] = sessionData
      } else {
        sessions.push(sessionData)
      }
      // Keep only last 5 sessions
      const trimmedSessions = sessions.slice(-5)
      localStorage.setItem(MULTI_SESSION_KEY, JSON.stringify(trimmedSessions))
      cachedSessions.value = trimmedSessions
    } catch (e) {
      console.warn('Failed to cache session:', e)
    }
  }

  // Load cached session (for quick UI display while Clerk initializes)
  function loadCachedSession(): CachedSession | null {
    try {
      const stored = localStorage.getItem(SESSION_CACHE_KEY)
      if (stored) {
        const cached: CachedSession = JSON.parse(stored)
        // Check if not expired
        if ((Date.now() - cached.timestamp) < SESSION_CACHE_DURATION) {
          return cached
        }
      }
    } catch (e) {
      console.warn('Failed to load cached session:', e)
    }
    return null
  }

  // Clear session cache
  function clearSessionCache() {
    try {
      localStorage.removeItem(SESSION_CACHE_KEY)
      // Don't clear multi-session cache on sign out - keep for account switching
    } catch (e) {
      console.warn('Failed to clear session cache:', e)
    }
  }

  // Remove a specific session from cache
  function removeCachedSession(userId: string) {
    try {
      const sessions = loadCachedSessions()
      const filtered = sessions.filter(s => s.userId !== userId)
      localStorage.setItem(MULTI_SESSION_KEY, JSON.stringify(filtered))
      cachedSessions.value = filtered
    } catch (e) {
      console.warn('Failed to remove cached session:', e)
    }
  }

  // Set user and session (called from clerk.ts)
  function setAuth(clerkUser: ClerkUser | null, clerkSession: ClerkSession | null) {
    user.value = clerkUser
    session.value = clerkSession
    provisional.value = false
    error.value = null

    if (clerkUser && clerkSession) {
      cacheCurrentSession()
    }
  }

  // Clear auth state
  function clearAuth() {
    user.value = null
    session.value = null
    provisional.value = false
    clearSessionCache()
  }

  // Set loading state
  function setLoading(loading: boolean) {
    isLoading.value = loading
  }

  // Set initialized
  function setInitialized(initialized: boolean) {
    isInitialized.value = initialized
    if (initialized) {
      isLoading.value = false
    }
  }

  // Set error
  function setError(errorMessage: string | null) {
    error.value = errorMessage
  }

  // Get session token with retry logic
  async function getToken(): Promise<string | null> {
    if (!session.value) {
      return null
    }

    const maxRetries = 10
    const retryDelay = 100

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const token = await session.value.getToken()
        if (token) {
          return token
        }
      } catch (e) {
        if (attempt === maxRetries - 1) {
          console.error('Failed to get token after retries:', e)
        }
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay))
    }

    return null
  }

  // Sign-out or account switch: drop cached API responses and per-account session keys
  // so one account's leagues and scores never show under another.
  watch(userId, async (next, prev) => {
    if (!prev || next === prev) return
    const { api } = await import('@/app/core/http/api-client')
    api.invalidateCache()
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (key === 'lastGroupId' || key.startsWith('myPlayerId_') || key.startsWith('picklerank:')) {
          sessionStorage.removeItem(key)
        }
      }
    } catch { /* storage unavailable */ }
  })

  // Wait for auth to be ready
  function waitForAuth(): Promise<void> {
    return new Promise((resolve) => {
      if (isInitialized.value) {
        resolve()
        return
      }

      const unwatch = watch(isInitialized, (initialized) => {
        if (initialized) {
          unwatch()
          resolve()
        }
      })

      // Timeout after 10 seconds
      setTimeout(() => {
        unwatch()
        resolve()
      }, 10000)
    })
  }

  // Initialize with cached data for faster UI
  function initWithCache() {
    cachedSessions.value = loadCachedSessions()
    const cached = loadCachedSession()
    if (cached) {
      // Set a placeholder user from cache (will be replaced when Clerk loads)
      user.value = {
        id: cached.userId,
        firstName: cached.firstName,
        lastName: cached.lastName,
        fullName: cached.firstName && cached.lastName 
          ? `${cached.firstName} ${cached.lastName}` 
          : cached.firstName,
        emailAddresses: cached.email ? [{ emailAddress: cached.email }] : [],
        imageUrl: cached.imageUrl
      }
      provisional.value = true
    }
  }

  return {
    // State
    user,
    session,
    isLoading,
    isInitialized,
    provisional,
    error,
    cachedSessions,

    // Computed
    isAuthenticated,
    userId,
    userEmail,
    userName,
    userInitials,

    // Actions
    setAuth,
    clearAuth,
    setLoading,
    setInitialized,
    setError,
    getToken,
    waitForAuth,
    initWithCache,
    loadCachedSessions,
    removeCachedSession,
    cacheCurrentSession
  }
})






