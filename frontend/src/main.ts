import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initClerk, setAuthStore } from '@/app/core/auth/clerk'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'
import { initApiClient } from './app/core/http/api-client'
import { startSync, outbox } from './app/core/offline/sync'
import '@fontsource/atkinson-hyperlegible-next/latin-400.css'
import '@fontsource/atkinson-hyperlegible-next/latin-700.css'
import '@fontsource/barlow-condensed/latin-600.css'
import '@fontsource/barlow-condensed/latin-700.css'
import './styles/base.css'
import { registerSW } from 'virtual:pwa-register'

// PWA: auto-updating service worker (offline app shell; API is NetworkOnly)
registerSW({ immediate: true })

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()

  // Initialize Pinia first so stores are available
  app.use(pinia)

  // Theme: sync data-theme/<meta theme-color> and watch system preference
  useThemeStore().init()

  // Initialize auth store and connect it to Clerk and API client
  const authStore = useAuthStore()
  setAuthStore(authStore)
  initApiClient(authStore)

  // Clerk is a ~2.6 MB chunk plus a network handshake. With a session cached on this device,
  // paint the app now (from kept data) and let Clerk confirm in the background; this is also
  // what lets the app open with no connection. Signed-out visitors wait, since sign-in needs Clerk.
  const clerkReady = initClerk()
  if (!authStore.provisional) await clerkReady

  app.use(router)
  startSync(() => authStore.userId)
  app.mount('#app')

  // Clerk (or a 401) says the session is gone: leave protected screens.
  watch(() => authStore.isAuthenticated, isAuth => {
    const route = router.currentRoute.value
    if (!isAuth && route.meta.requiresAuth) void router.replace({ name: 'login', query: { redirect: route.fullPath } })
  })
  // A real session arrived (Clerk loaded, or reconnected): send anything queued while waiting.
  watch(() => authStore.session, s => { if (s) outbox.kick() })
}

bootstrap()






