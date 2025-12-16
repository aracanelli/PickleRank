import type { Clerk } from '@clerk/clerk-js'

// Re-export the auth store for convenience
export { useAuthStore } from '@/stores/auth'

// Clerk instance type with full API
type ClerkInstance = Clerk & {
  load: (opts?: { signInUrl?: string; signUpUrl?: string }) => Promise<void>
  user: any
  session: any
  client: any
  openSignIn: (opts?: any) => void
  openSignUp: (opts?: any) => void
  openUserProfile: (opts?: any) => void
  signOut: (opts?: { sessionId?: string }) => Promise<void>
  mountSignIn: (el: HTMLElement, opts?: any) => void
  unmountSignIn: (el: HTMLElement) => void
  mountSignUp: (el: HTMLElement, opts?: any) => void
  unmountSignUp: (el: HTMLElement) => void
  addListener: (callback: (resources: any) => void) => () => void
  setActive: (opts: { session: any; organization?: any }) => Promise<void>
}

// Module state
let clerkInstance: ClerkInstance | null = null
let clerkLoaded = false
let clerkLoadPromise: Promise<ClerkInstance | null> | null = null
let authStoreInstance: ReturnType<typeof import('@/stores/auth').useAuthStore> | null = null
let listenerUnsubscribe: (() => void) | null = null

/**
 * Set the auth store reference (called from main.ts after Pinia is initialized)
 */
export function setAuthStore(store: ReturnType<typeof import('@/stores/auth').useAuthStore>) {
  authStoreInstance = store
  // Initialize with cached data immediately
  authStoreInstance.initWithCache()
}

/**
 * Handle Clerk auth state changes
 */
function handleAuthChange(resources: { user: any; session: any; client?: any }) {
  const { user, session } = resources

  if (authStoreInstance) {
    if (user && session) {
      authStoreInstance.setAuth(user, session)
    } else {
      // Only clear if we're actually signed out (not just loading)
      if (clerkLoaded && !user) {
        authStoreInstance.clearAuth()
      }
    }
  }
}

/**
 * Initialize Clerk with proper session management
 */
export async function initClerk(): Promise<ClerkInstance | null> {
  // Return existing promise if already initializing
  if (clerkLoadPromise) {
    return clerkLoadPromise
  }

  clerkLoadPromise = doInitClerk()
  return clerkLoadPromise
}

async function doInitClerk(): Promise<ClerkInstance | null> {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

  if (!publishableKey) {
    console.warn('Clerk publishable key not found. Auth will be disabled.')
    clerkLoaded = true
    if (authStoreInstance) {
      authStoreInstance.setInitialized(true)
    }
    return null
  }

  try {
    if (authStoreInstance) {
      authStoreInstance.setLoading(true)
    }

    const ClerkModule = await import('@clerk/clerk-js')
    const Clerk = ClerkModule.Clerk || ClerkModule.default

    if (!Clerk) {
      console.error('Could not load Clerk module')
      clerkLoaded = true
      if (authStoreInstance) {
        authStoreInstance.setError('Could not load authentication module')
        authStoreInstance.setInitialized(true)
      }
      return null
    }

    clerkInstance = new Clerk(publishableKey) as ClerkInstance

    // Load Clerk - this restores any existing session from cookies
    await clerkInstance.load({
      signInUrl: '/login',
      signUpUrl: '/signup'
    })

    clerkLoaded = true

    // Set initial auth state
    if (authStoreInstance) {
      if (clerkInstance.user && clerkInstance.session) {
        authStoreInstance.setAuth(clerkInstance.user, clerkInstance.session)
      } else {
        // No active session
        authStoreInstance.clearAuth()
      }
      authStoreInstance.setInitialized(true)
    }

    // Set up listener for auth state changes
    listenerUnsubscribe = clerkInstance.addListener(handleAuthChange)

    return clerkInstance
  } catch (error) {
    console.error('Failed to initialize Clerk:', error)
    clerkLoaded = true
    if (authStoreInstance) {
      authStoreInstance.setError('Failed to initialize authentication')
      authStoreInstance.setInitialized(true)
    }
    return null
  }
}

/**
 * Get the Clerk instance
 */
export function getClerk(): ClerkInstance | null {
  return clerkInstance
}

/**
 * Check if user is authenticated (synchronous check)
 * For reactive state, use the auth store's isAuthenticated computed
 */
export function isAuthenticated(): boolean {
  if (authStoreInstance) {
    return authStoreInstance.isAuthenticated
  }
  return clerkInstance?.user != null && clerkInstance?.session != null
}

/**
 * Get current user
 * For reactive state, use the auth store's user ref
 */
export function getUser() {
  if (authStoreInstance) {
    return authStoreInstance.user
  }
  return clerkInstance?.user
}

/**
 * Wait for Clerk to be fully loaded and session restored
 */
export async function waitForAuth(): Promise<void> {
  // If auth store is available, use its wait method
  if (authStoreInstance) {
    await authStoreInstance.waitForAuth()
    return
  }

  // Fallback: Poll until Clerk is loaded
  const maxWait = 10000 // 10 seconds
  const startTime = Date.now()

  while (!clerkLoaded && (Date.now() - startTime) < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

/**
 * Get auth token with retry logic for race conditions
 */
export async function getToken(): Promise<string | null> {
  await waitForAuth()

  // Use auth store if available
  if (authStoreInstance) {
    return authStoreInstance.getToken()
  }

  if (!clerkInstance) {
    return null
  }

  // If user exists but session not ready, wait for it
  const maxAttempts = 20 // 20 * 150ms = 3 seconds max

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const session = clerkInstance.session

    if (session) {
      try {
        const token = await session.getToken()
        if (token) {
          return token
        }
      } catch (error) {
        if (attempt === maxAttempts - 1) {
          console.error('Failed to get token after retries:', error)
        }
      }
    }

    // If no user at all, they're not authenticated
    if (!clerkInstance.user) {
      return null
    }

    // Wait a bit for session to be established
    await new Promise(resolve => setTimeout(resolve, 150))
  }

  console.warn('Could not get auth token - session may not be ready')
  return null
}

/**
 * Open sign in modal
 */
export async function signIn() {
  if (!clerkInstance) return
  clerkInstance.openSignIn({})
}

/**
 * Open sign up modal
 */
export async function signUp() {
  if (!clerkInstance) return
  clerkInstance.openSignUp({})
}

/**
 * Sign out current user
 */
export async function signOut() {
  if (!clerkInstance) return

  try {
    await clerkInstance.signOut()
    if (authStoreInstance) {
      authStoreInstance.clearAuth()
    }
    window.location.href = '/'
  } catch (error) {
    console.error('Sign out error:', error)
    // Force clear state and redirect anyway
    if (authStoreInstance) {
      authStoreInstance.clearAuth()
    }
    window.location.href = '/'
  }
}

/**
 * Sign out specific session (for multi-account support)
 */
export async function signOutSession(sessionId: string) {
  if (!clerkInstance) return

  try {
    await clerkInstance.signOut({ sessionId })
  } catch (error) {
    console.error('Sign out session error:', error)
  }
}

/**
 * Switch to a different session (multi-account support)
 */
export async function switchSession(sessionId: string) {
  if (!clerkInstance?.client) return

  try {
    const sessions = clerkInstance.client.sessions || []
    const targetSession = sessions.find((s: any) => s.id === sessionId)

    if (targetSession) {
      await clerkInstance.setActive({ session: targetSession })
    }
  } catch (error) {
    console.error('Switch session error:', error)
  }
}

/**
 * Get all active sessions (multi-account support)
 */
export function getSessions(): any[] {
  if (!clerkInstance?.client) return []
  return clerkInstance.client.sessions || []
}

/**
 * Cleanup function for app teardown
 */
export function destroyClerk() {
  if (listenerUnsubscribe) {
    listenerUnsubscribe()
    listenerUnsubscribe = null
  }
  clerkInstance = null
  clerkLoaded = false
  clerkLoadPromise = null
  authStoreInstance = null
}
