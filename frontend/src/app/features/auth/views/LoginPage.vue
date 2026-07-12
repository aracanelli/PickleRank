<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Activity } from 'lucide-vue-next'
import { getClerk } from '@/app/core/auth/clerk'
import { getClerkAppearance } from '@/app/core/auth/clerk-appearance'
import { getSafeRedirect } from '@/app/core/auth/redirectUtils'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const themeStore = useThemeStore()

const clerkAvailable = ref(true)
const authContainer = ref<HTMLElement>()
let mounted = false

// Redirect as soon as authentication happens
watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) router.push(getSafeRedirect(route.query.redirect))
  },
  { immediate: true }
)

function mountClerk() {
  const clerk = getClerk()
  if (!clerk || !authContainer.value) return
  clerk.mountSignIn(authContainer.value, {
    fallbackRedirectUrl: getSafeRedirect(route.query.redirect),
    signUpFallbackRedirectUrl: '/groups',
    appearance: getClerkAppearance(themeStore.resolved)
  })
  mounted = true
}

function unmountClerk() {
  const clerk = getClerk()
  if (clerk && authContainer.value && mounted) {
    clerk.unmountSignIn(authContainer.value)
    mounted = false
  }
}

// Clerk captures appearance at mount: remount when the theme flips
watch(
  () => themeStore.resolved,
  () => {
    if (!mounted) return
    unmountClerk()
    mountClerk()
  }
)

onMounted(async () => {
  if (authStore.isAuthenticated) {
    router.push(getSafeRedirect(route.query.redirect))
    return
  }
  await authStore.waitForAuth()
  if (authStore.isAuthenticated) {
    router.push(getSafeRedirect(route.query.redirect))
    return
  }
  if (!getClerk()) {
    clerkAvailable.value = false
    return
  }
  mountClerk()
})

onUnmounted(unmountClerk)
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center bg-surface-page px-4 py-10 pt-safe pb-safe">
    <RouterLink to="/" class="display-wide mb-6 flex items-center gap-2 text-2xl text-ink">
      <Activity class="size-7 text-accent-text" aria-hidden="true" />
      PickleRank
    </RouterLink>

    <div class="w-full max-w-md">
      <div class="kitchen-line mb-4" />
      <div class="rounded-[20px] border border-line bg-surface-1 p-6">
        <div v-if="clerkAvailable" ref="authContainer" class="min-h-64" />
        <p v-else class="py-8 text-center text-sm text-ink-muted">
          Sign-in is not configured for this environment.
        </p>
      </div>
    </div>

    <p class="mt-6 text-sm text-ink-muted">
      New here?
      <RouterLink
        :to="{ path: '/signup', query: route.query }"
        class="font-semibold text-accent-text transition-colors hover:text-brand-strong"
      >
        Create an account
      </RouterLink>
    </p>
  </div>
</template>
