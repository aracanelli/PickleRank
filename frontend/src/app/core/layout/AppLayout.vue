<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { signOut, getClerk, getSessions, switchSession } from '@/app/core/auth/clerk'
import { ClipboardList, Users, LogOut, ChevronDown, Activity, Check, Trophy, ChartBar, LayoutDashboard, Target } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const isMenuOpen = ref(false)
const showAccountSwitcher = ref(false)

// Global bottom nav - extract groupId from any group-related route
const groupId = computed(() => {
  const params = route.params
  if (params.groupId) return params.groupId as string
  // For event pages, we'll need to get it from the route or cache
  return null
})

// Check if current route should show bottom nav (group-related pages, not groups list)
const showBottomNav = computed(() => {
  if (!authStore.isAuthenticated) return false
  if (!groupId.value) return false
  // Don't show on /groups list page
  if (route.path === '/groups') return false
  return true
})

// Cache player ID - use a reactive ref that updates on route changes
const cachedPlayerId = ref<string | null>(null)

// Update cached player ID when route changes
watch(() => groupId.value, (newGroupId) => {
  if (typeof sessionStorage !== 'undefined' && newGroupId) {
    cachedPlayerId.value = sessionStorage.getItem(`myPlayerId_${newGroupId}`)
  } else {
    cachedPlayerId.value = null
  }
}, { immediate: true })

// Determine which nav item is active based on current route
const activeNavItem = computed(() => {
  const path = route.path
  if (path.includes('/rankings')) return 'rankings'
  if (path.includes('/history')) return 'history'
  if (path.includes('/players/')) return 'stats'
  // Check if on group detail page (exact match for /groups/:id pattern)
  if (path.match(/^\/groups\/[^/]+$/)) return 'event'
  return 'dash'
})

// Check if we're on the group detail page (show Event instead of Dash)
const isOnGroupDetail = computed(() => {
  return route.path.match(/^\/groups\/[^/]+$/)
})

// Navigation helpers
function navigateToRankings() {
  if (groupId.value) router.push(`/groups/${groupId.value}/rankings`)
}
function navigateToHistory() {
  if (groupId.value) router.push(`/groups/${groupId.value}/history`)
}
function navigateToStats() {
  if (groupId.value && cachedPlayerId.value) {
    router.push(`/groups/${groupId.value}/players/${cachedPlayerId.value}`)
  }
}
function navigateToDash() {
  if (groupId.value) router.push(`/groups/${groupId.value}`)
}
function navigateToEvent() {
  if (groupId.value) router.push(`/groups/${groupId.value}/events/new`)
}

// Close menus when clicking outside
onMounted(() => {
  const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    // Don't close if clicking on menu-related elements
    if (!target.closest('.user-menu') && 
        !target.closest('.account-switcher') && 
        !target.closest('.menu-toggle') && 
        !target.closest('.nav-mobile')) {
      isMenuOpen.value = false
      showAccountSwitcher.value = false
    }
  }
  document.addEventListener('click', handleClickOutside)

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
  })
})

// Close mobile menu on route change
watch(() => route.path, () => {
  isMenuOpen.value = false
})

const handleSignOut = async () => {
  isMenuOpen.value = false
  await signOut()
}

const handleSwitchAccount = async (sessionId: string) => {
  showAccountSwitcher.value = false
  await switchSession(sessionId)
}

const activeSessions = ref<any[]>([])

// Watch for session changes to update multi-account list
watch(() => authStore.isAuthenticated, () => {
  const clerk = getClerk()
  if (clerk) {
    activeSessions.value = getSessions()
  }
}, { immediate: true })

const navItems = [
  { name: 'Groups', path: '/groups', icon: ClipboardList },
  { name: 'Players', path: '/players', icon: Users },
]
</script>

<template>
  <div class="layout">
    <!-- Header -->
    <header class="header">
      <div class="header-content container">
        <router-link to="/" class="logo">
          <span class="logo-icon"><Activity /></span>
          <span class="logo-text">PickleRank</span>
        </router-link>

        <!-- Desktop Nav -->
        <nav class="nav-desktop" v-if="authStore.isAuthenticated">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="nav-link"
            :class="{ active: route.path.startsWith(item.path) }"
          >
            <component :is="item.icon" class="nav-icon" />
            {{ item.name }}
          </router-link>
        </nav>

        <!-- User Menu -->
        <div class="header-actions">
          <template v-if="authStore.isAuthenticated">
            <div class="user-menu">
              <button class="user-button" @click.stop="isMenuOpen = !isMenuOpen">
                <span class="user-avatar">
                  {{ authStore.userInitials }}
                </span>
                <span class="user-name">{{ authStore.userName }}</span>
                <ChevronDown class="chevron" :class="{ open: isMenuOpen }" />
              </button>
              <div v-if="isMenuOpen" class="dropdown" @click.stop>
                <div class="dropdown-header">
                  <span class="dropdown-email">{{ authStore.userEmail }}</span>
                </div>
                
                <!-- Multi-account switcher -->
                <template v-if="activeSessions.length > 1">
                  <div class="dropdown-divider"></div>
                  <div class="dropdown-label">Switch Account</div>
                  <button
                    v-for="session in activeSessions"
                    :key="session.id"
                    class="dropdown-item account-item"
                    :class="{ active: session.id === authStore.session?.id }"
                    @click="handleSwitchAccount(session.id)"
                  >
                    <span class="account-avatar">
                      {{ session.user?.firstName?.[0] || session.user?.emailAddresses?.[0]?.emailAddress?.[0] || '?' }}
                    </span>
                    <span class="account-name">
                      {{ session.user?.firstName || session.user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'User' }}
                    </span>
                    <Check v-if="session.id === authStore.session?.id" class="active-indicator" />
                  </button>
                </template>
                
                <div class="dropdown-divider"></div>
                <button @click="handleSignOut" class="dropdown-item signout-item">
                  <LogOut class="dropdown-icon" />
                  Sign Out
                </button>
              </div>
            </div>
          </template>
          <template v-else-if="!authStore.isLoading">
            <router-link to="/login" class="btn btn-primary">
              Sign In
            </router-link>
          </template>
          <template v-else>
            <div class="auth-loading">
              <span class="loading-dot"></span>
            </div>
          </template>
        </div>

        <!-- Mobile Menu Toggle -->
        <button 
          class="menu-toggle" 
          @click="isMenuOpen = !isMenuOpen" 
          v-if="authStore.isAuthenticated"
          :class="{ open: isMenuOpen }"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </header>

    <!-- Mobile Nav -->
    <nav class="nav-mobile" :class="{ open: isMenuOpen }" v-if="authStore.isAuthenticated">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="nav-link"
        @click="isMenuOpen = false"
      >
        <component :is="item.icon" class="nav-icon" />
        {{ item.name }}
      </router-link>
      <button @click="handleSignOut" class="nav-link signout">
        <LogOut class="nav-icon" />
        Sign Out
      </button>
    </nav>

    <!-- Main Content -->
    <main class="main">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="footer">
      <div class="container">
        <p>&copy; {{ new Date().getFullYear() }} PickleRank. Built for pickleball enthusiasts.</p>
      </div>
    </footer>

    <!-- Global Mobile Bottom Navigation Bar -->
    <nav class="global-bottom-nav" v-if="showBottomNav">
      <button 
        class="global-nav-item" 
        :class="{ active: activeNavItem === 'rankings' }"
        @click="navigateToRankings"
      >
        <Trophy :size="20" />
        <span>Rankings</span>
      </button>
      <button 
        class="global-nav-item" 
        :class="{ active: activeNavItem === 'history' }"
        @click="navigateToHistory"
      >
        <ChartBar :size="20" />
        <span>History</span>
      </button>
      <button 
        class="global-nav-item" 
        :class="{ active: activeNavItem === 'stats', disabled: !cachedPlayerId }"
        @click="navigateToStats"
      >
        <Activity :size="20" />
        <span>Stats</span>
      </button>
      <!-- Show Event on group detail, Dash on other pages -->
      <button 
        v-if="isOnGroupDetail"
        class="global-nav-item" 
        :class="{ active: activeNavItem === 'event' }"
        @click="navigateToEvent"
      >
        <Target :size="20" />
        <span>Event</span>
      </button>
      <button 
        v-else
        class="global-nav-item" 
        :class="{ active: activeNavItem === 'dash' }"
        @click="navigateToDash"
      >
        <LayoutDashboard :size="20" />
        <span>Dash</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--color-border);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
}

.logo {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-weight: 700;
  font-size: 1.25rem;
  color: var(--color-text-primary);
}

.logo-icon {
  font-size: 1.5rem;
}

.logo-text {
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.nav-desktop {
  display: flex;
  gap: var(--spacing-sm);
}

.nav-link {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-weight: 500;
  transition: all var(--transition-fast);
}

.nav-link:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-hover);
}

.nav-link.active {
  color: var(--color-primary);
  background: rgba(16, 185, 129, 0.1);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.user-menu {
  position: relative;
}

.user-button {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.user-button:hover {
  border-color: var(--color-border-light);
}

.user-avatar {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-full);
  font-weight: 600;
  font-size: 0.875rem;
}

.user-name {
  font-weight: 500;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  font-size: 0.625rem;
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
}

.chevron.open {
  transform: rotate(180deg);
}

.dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: slideUp var(--transition-fast);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dropdown-header {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.dropdown-email {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.dropdown-divider {
  height: 1px;
  background: var(--color-border);
  margin: var(--spacing-xs) 0;
}

.dropdown-label {
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: none;
  border: none;
  text-align: left;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.dropdown-item:hover {
  background: var(--color-bg-hover);
}

.dropdown-icon {
  font-size: 1rem;
}

.account-item {
  font-size: 0.875rem;
}

.account-item.active {
  background: rgba(16, 185, 129, 0.1);
}

.account-avatar {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 600;
}

.account-name {
  flex: 1;
}

.active-indicator {
  color: var(--color-primary);
  font-weight: 600;
}

.signout-item {
  color: var(--color-error);
}

.signout-item:hover {
  background: rgba(239, 68, 68, 0.1);
}

.auth-loading {
  padding: var(--spacing-sm) var(--spacing-md);
}

.loading-dot {
  display: block;
  width: 8px;
  height: 8px;
  background: var(--color-primary);
  border-radius: 50%;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-md);
  font-weight: 500;
  transition: all var(--transition-fast);
  border: none;
  cursor: pointer;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
  box-shadow: var(--shadow-glow);
}

.menu-toggle {
  display: none;
  flex-direction: column;
  gap: 4px;
  padding: var(--spacing-sm);
  background: none;
  border: none;
  cursor: pointer;
}

.menu-toggle span {
  display: block;
  width: 20px;
  height: 2px;
  background: var(--color-text-primary);
  transition: all var(--transition-fast);
}

.menu-toggle.open span:nth-child(1) {
  transform: rotate(45deg) translateY(6px);
}

.menu-toggle.open span:nth-child(2) {
  opacity: 0;
}

.menu-toggle.open span:nth-child(3) {
  transform: rotate(-45deg) translateY(-6px);
}

.nav-mobile {
  display: none;
  flex-direction: column;
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.nav-mobile.open {
  display: flex;
}

.nav-mobile .nav-link {
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
}

.nav-mobile .signout {
  color: var(--color-error);
  margin-top: var(--spacing-md);
  border-top: 1px solid var(--color-border);
  padding-top: var(--spacing-lg);
}

.main {
  flex: 1;
  padding: var(--spacing-xl) 0;
}

.footer {
  padding: var(--spacing-xl) 0;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

@media (max-width: 768px) {
  .nav-desktop {
    display: none;
  }

  .user-menu {
    display: none;
  }

  .menu-toggle {
    display: flex;
  }

  /* Global Mobile Bottom Navigation */
  .main {
    padding-bottom: 100px; /* Space for bottom nav */
  }

  .footer {
    display: none; /* Hide footer on mobile when bottom nav is visible */
  }
}

/* Global Bottom Navigation Bar - Desktop hidden */
.global-bottom-nav {
  display: none;
}

@media (max-width: 768px) {
  .global-bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100vw;
    background: rgba(30, 30, 35, 0.95);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    justify-content: space-around;
    padding: 12px 16px;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
    z-index: 9999;
    box-shadow: 0 -4px 20px rgba(0,0,0,0.3);
  }

  .global-nav-item {
    background: none;
    border: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: rgba(255, 255, 255, 0.7);
    padding: 4px 12px;
    border-radius: 12px;
    transition: all 0.2s ease;
    min-width: 60px;
    flex: 1;
    cursor: pointer;
  }

  .global-nav-item span {
    font-size: 0.625rem;
    font-weight: 500;
    text-transform: uppercase;
  }

  .global-nav-item.active {
    color: var(--color-primary);
  }

  .global-nav-item:active:not(:disabled) {
    transform: scale(0.95);
    background: rgba(16, 185, 129, 0.1);
  }

  .global-nav-item:disabled,
  .global-nav-item.disabled {
    opacity: 0.4;
    pointer-events: none;
    cursor: not-allowed;
  }
}
</style>
