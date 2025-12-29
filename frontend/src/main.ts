import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initClerk, setAuthStore } from './app/core/auth/clerk'
import { useAuthStore } from './stores/auth'
import { initApiClient } from './app/core/http/api-client'
import './styles/main.css'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()

  // Initialize Pinia first so stores are available
  app.use(pinia)

  // Initialize auth store and connect it to Clerk and API client
  const authStore = useAuthStore()
  setAuthStore(authStore)
  initApiClient(authStore)

  // Initialize Clerk (will automatically update auth store)
  await initClerk()

  // Add router after auth is initialized
  app.use(router)

  app.mount('#app')
}

bootstrap()






