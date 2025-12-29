import { createRouter, createWebHistory } from 'vue-router'

/**
 * Sanitizes a redirect path to prevent open redirect attacks.
 * Only allows internal paths that:
 * - Are a non-empty string
 * - Start with a single "/" (not "//")
 * - Do not contain "://" (protocol schemes)
 * - Do not contain domain-like patterns
 * 
 * @param redirect - The redirect value from query parameters
 * @returns A safe internal path, or '/groups' as fallback
 */
export function isValidRedirect(redirect: unknown): string {
  const fallback = '/groups'

  // Must be a non-empty string
  if (typeof redirect !== 'string' || !redirect) {
    return fallback
  }

  // Trim whitespace
  const trimmed = redirect.trim()

  // Must start with a single "/" (not "//" which could be protocol-relative)
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback
  }

  // Must not contain "://" anywhere (blocks http://, https://, javascript:, etc.)
  if (trimmed.includes('://')) {
    return fallback
  }

  // Block any backslash characters (could be used for path traversal or URL manipulation)
  if (trimmed.includes('\\')) {
    return fallback
  }

  // Extract just the pathname portion (strip query strings and hashes for validation)
  // but allow them in the final result if the path is valid
  const pathMatch = trimmed.match(/^(\/[^?#]*)/)
  if (!pathMatch) {
    return fallback
  }

  const pathname = pathMatch[1]

  // Ensure the path doesn't contain encoded characters that could bypass checks
  // Decode and re-check for dangerous patterns
  try {
    const decoded = decodeURIComponent(pathname)
    if (decoded.includes('://') || decoded.startsWith('//') || decoded.includes('\\')) {
      return fallback
    }
  } catch {
    // If decoding fails, the URL is malformed - reject it
    return fallback
  }

  // Path is safe - return the original trimmed value (preserves query/hash if present)
  return trimmed
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/app/features/home/views/HomePage.vue')
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/app/features/auth/views/LoginPage.vue')
    },
    {
      path: '/signup',
      name: 'signup',
      component: () => import('@/app/features/auth/views/SignUpPage.vue')
    },
    {
      path: '/groups',
      name: 'groups',
      component: () => import('@/app/features/groups/views/GroupsPage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/groups/:groupId',
      name: 'group-detail',
      component: () => import('@/app/features/groups/views/GroupDetailPage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/groups/:groupId/settings',
      name: 'group-settings',
      component: () => import('@/app/features/groups/views/GroupSettingsPage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/groups/:groupId/players/manage',
      name: 'manage-players',
      component: () => import('@/app/features/groups/views/ManagePlayersPage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/groups/:groupId/players/:playerId',
      name: 'player-profile',
      component: () => import('@/app/features/players/views/PlayerProfilePage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/players',
      name: 'players',
      component: () => import('@/app/features/players/views/PlayersPage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/groups/:groupId/events/new',
      name: 'create-event',
      component: () => import('@/app/features/events/views/CreateEventPage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/events/:eventId',
      name: 'event-detail',
      component: () => import('@/app/features/events/views/EventDetailPage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/groups/:groupId/rankings',
      name: 'rankings',
      component: () => import('@/app/features/rankings/views/RankingsPage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/groups/:groupId/history',
      name: 'history',
      component: () => import('@/app/features/rankings/views/HistoryPage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/link-player',
      name: 'link-player',
      component: () => import('@/app/features/players/views/LinkPlayerPage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/app/features/home/views/NotFoundPage.vue')
    }
  ]
})

// Navigation guard - uses the auth store with proper session waiting
router.beforeEach(async (to, _from) => {
  // Dynamically import to avoid circular dependencies
  const { useAuthStore } = await import('@/stores/auth')
  const authStore = useAuthStore()

  // Wait for auth to be fully initialized (including session restoration)
  await authStore.waitForAuth()

  if (to.meta.requiresAuth) {
    // Check reactive auth state
    if (!authStore.isAuthenticated) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }

    // Verify we can get a valid token (session is actually valid)
    try {
      const token = await authStore.getToken()
      if (!token) {
        // Session might be expired, redirect to login
        console.warn('No valid token available, redirecting to login')
        return { name: 'login', query: { redirect: to.fullPath } }
      }
    } catch (error) {
      console.error('Error getting token:', error)
      return { name: 'login', query: { redirect: to.fullPath } }
    }
  }

  // If user is authenticated and trying to go to login or signup, redirect to groups
  if ((to.name === 'login' || to.name === 'signup') && authStore.isAuthenticated) {
    return isValidRedirect(to.query.redirect)
  }

  // If user is authenticated and on home page, redirect to dashboard
  if (to.name === 'home' && authStore.isAuthenticated) {
    return '/groups'
  }

  return true
})

export default router
