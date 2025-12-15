import { createRouter, createWebHistory } from 'vue-router'

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

  // If user is authenticated and trying to go to login, redirect to groups
  if (to.name === 'login' && authStore.isAuthenticated) {
    const redirect = to.query.redirect as string
    return redirect || '/groups'
  }

  // If user is authenticated and on home page, redirect to dashboard
  if (to.name === 'home' && authStore.isAuthenticated) {
    return '/groups'
  }

  return true
})

export default router
