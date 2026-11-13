import { createRouter, createWebHistory } from 'vue-router'
import { getSafeRedirect } from '@/app/core/auth/redirectUtils'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    /** 'league' shows the league tabs, 'home' the Leagues/Players tabs; anything else is a focused screen without tabs */
    chrome?: 'league' | 'home'
  }
}

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
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
      meta: { requiresAuth: true, chrome: 'home' }
    },
    {
      path: '/groups/:groupId',
      name: 'group-detail',
      component: () => import('@/app/features/groups/views/GroupDetailPage.vue'),
      meta: { requiresAuth: true, chrome: 'league' }
    },
    {
      path: '/groups/:groupId/settings',
      name: 'group-settings',
      component: () => import('@/app/features/groups/views/GroupSettingsPage.vue'),
      meta: { requiresAuth: true, chrome: 'league' }
    },
    {
      path: '/groups/:groupId/players/manage',
      name: 'manage-players',
      component: () => import('@/app/features/groups/views/ManagePlayersPage.vue'),
      meta: { requiresAuth: true, chrome: 'league' }
    },
    {
      path: '/groups/:groupId/players/:playerId',
      name: 'player-profile',
      component: () => import('@/app/features/players/views/PlayerProfilePage.vue'),
      meta: { requiresAuth: true, chrome: 'league' }
    },
    {
      path: '/players',
      name: 'players',
      component: () => import('@/app/features/players/views/PlayersPage.vue'),
      meta: { requiresAuth: true, chrome: 'home' }
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
      meta: { requiresAuth: true, chrome: 'league' }
    },
    {
      path: '/groups/:groupId/history',
      name: 'history',
      component: () => import('@/app/features/rankings/views/HistoryPage.vue'),
      meta: { requiresAuth: true, chrome: 'league' }
    },
    {
      path: '/groups/:groupId/payments',
      name: 'payments',
      component: () => import('@/app/features/payments/views/PaymentsPage.vue'),
      meta: { requiresAuth: true, chrome: 'league' }
    },
    {
      path: '/groups/:groupId/awards',
      name: 'awards',
      component: () => import('@/app/features/awards/views/AwardsPage.vue'),
      meta: { requiresAuth: true, chrome: 'league' }
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

  // A session cached on this device lets navigation proceed at once (and offline);
  // otherwise wait for Clerk to restore one.
  if (!authStore.provisional) await authStore.waitForAuth()

  // No per-navigation token check: it cost a Clerk round trip on every screen change and,
  // offline, bounced organizers to the login page mid-event. An expired session surfaces as
  // a 401 from the API, which clears auth.
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // If user is authenticated and trying to go to login or signup, redirect to groups
  if ((to.name === 'login' || to.name === 'signup') && authStore.isAuthenticated) {
    return getSafeRedirect(to.query.redirect)
  }

  // If user is authenticated and on home page, redirect to dashboard
  if (to.name === 'home' && authStore.isAuthenticated) {
    return '/groups'
  }

  return true
})

export default router
