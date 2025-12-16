<script setup lang="ts">
import { onMounted, ref, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getClerk } from '@/app/core/auth/clerk'
import { useAuthStore } from '@/stores/auth'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const clerkReady = ref(false)
const authContainer = ref<HTMLElement>()

// Watch for auth state changes - redirect when authenticated
watch(() => authStore.isAuthenticated, (isAuth) => {
  if (isAuth) {
    const redirect = route.query.redirect as string
    router.push(redirect || '/groups')
  }
}, { immediate: true })

onMounted(async () => {
  // If already authenticated, redirect
  if (authStore.isAuthenticated) {
    const redirect = route.query.redirect as string
    router.push(redirect || '/groups')
    return
  }

  // Wait for auth to be initialized
  await authStore.waitForAuth()

  // Check again after auth is ready
  if (authStore.isAuthenticated) {
    const redirect = route.query.redirect as string
    router.push(redirect || '/groups')
    return
  }

  const clerk = getClerk()
  
  if (!clerk) {
    return
  }

  clerkReady.value = true

  // Mount Clerk sign-up component
  if (authContainer.value) {
    clerk.mountSignUp(authContainer.value, {
      fallbackRedirectUrl: (route.query.redirect as string) || '/groups',
      signInFallbackRedirectUrl: '/groups',
      appearance: {
        baseTheme: undefined,
        variables: {
          colorPrimary: '#10b981',
          colorBackground: '#1e293b',
          colorInputBackground: '#0f172a',
          colorInputText: '#f8fafc',
          colorText: '#f8fafc',
          colorTextSecondary: '#94a3b8',
          colorDanger: '#ef4444',
          borderRadius: '0.5rem',
          fontFamily: 'Outfit, system-ui, sans-serif',
        },
        elements: {
          rootBox: {
            width: '100%',
            maxWidth: '100%',
          },
          card: {
            background: 'transparent',
            boxShadow: 'none',
            border: 'none',
            padding: '0',
            width: '100%',
            maxWidth: '100%',
          },
          main: {
            width: '100%',
          },
          headerTitle: {
            display: 'none',
          },
          headerSubtitle: {
            display: 'none',
          },
          socialButtonsBlockButton: {
            background: '#334155',
            border: '1px solid #475569',
            color: '#f8fafc',
            '&:hover': {
              background: '#475569',
            },
          },
          formButtonPrimary: {
            background: 'linear-gradient(135deg, #10b981, #059669)',
            '&:hover': {
              background: 'linear-gradient(135deg, #059669, #047857)',
            },
          },
          formFieldInput: {
            background: '#0f172a',
            border: '1px solid #334155',
            color: '#f8fafc',
            '&:focus': {
              borderColor: '#10b981',
              boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.2)',
            },
          },
          formFieldLabel: {
            color: '#94a3b8',
          },
          footerActionLink: {
            color: '#10b981',
            '&:hover': {
              color: '#059669',
            },
          },
          identityPreviewEditButton: {
            color: '#10b981',
          },
          dividerLine: {
            background: '#334155',
          },
          dividerText: {
            color: '#64748b',
          },
          footerAction: {
            '& a': {
              color: '#10b981',
            },
          },
          footerActionText: {
            color: '#94a3b8',
          },
        },
      },
    })
  }
})

onUnmounted(() => {
  const clerk = getClerk()
  if (clerk && authContainer.value) {
    clerk.unmountSignUp(authContainer.value)
  }
})
</script>

<template>
  <div class="signup-page">
    <!-- Background decoration -->
    <div class="bg-decoration">
      <div class="bg-glow"></div>
      <div class="bg-grid"></div>
    </div>

    <div class="signup-container">
      <!-- Left side - Branding -->
      <div class="signup-branding">
        <div class="brand-content">
          <div class="brand-icon">🏓</div>
          <h1>PickleRank</h1>
          <p class="brand-tagline">Fair matchups. Real rankings.</p>
          
          <div class="brand-features">
            <div class="brand-feature">
              <span class="feature-check">✓</span>
              <span>Smart 2v2 matchmaking</span>
            </div>
            <div class="brand-feature">
              <span class="feature-check">✓</span>
              <span>ELO-based rankings</span>
            </div>
            <div class="brand-feature">
              <span class="feature-check">✓</span>
              <span>Track your progress</span>
            </div>
          </div>
        </div>

        <!-- Decorative court mini -->
        <div class="mini-court">
          <div class="court-line h"></div>
          <div class="court-line v"></div>
        </div>
      </div>

      <!-- Right side - Auth form -->
      <div class="signup-form-section">
        <div class="signup-card">
          <div class="signup-header">
            <h2>Create an account</h2>
            <p>Sign up to start tracking your games</p>
          </div>

          <div v-if="authStore.isLoading && !authStore.isInitialized" class="loading-container">
            <LoadingSpinner text="Loading..." />
          </div>
          
          <div v-show="clerkReady && authStore.isInitialized" ref="authContainer" class="auth-container"></div>

          <div v-if="authStore.isInitialized && !getClerk()" class="no-auth">
            <div class="no-auth-icon">⚠️</div>
            <p class="no-auth-title">Authentication not configured</p>
            <p class="no-auth-message">Please set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in your environment variables.</p>
          </div>

          <div class="signup-footer">
            <router-link to="/" class="back-link">
              ← Back to home
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.signup-page {
  min-height: calc(100vh - 65px);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  padding: var(--spacing-lg);
}

/* Background decorations */
.bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.bg-glow {
  position: absolute;
  top: -20%;
  left: -10%;
  width: 60%;
  height: 60%;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 60%);
  filter: blur(60px);
}

.bg-grid {
  position: absolute;
  inset: 0;
  background-image: 
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 50px 50px;
}

/* Main container */
.signup-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
  max-width: 900px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: 
    0 25px 50px -12px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  position: relative;
  z-index: 1;
}

/* Left branding section */
.signup-branding {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  padding: var(--spacing-2xl);
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.brand-content {
  position: relative;
  z-index: 1;
}

.brand-icon {
  font-size: 3rem;
  margin-bottom: var(--spacing-md);
}

.signup-branding h1 {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: var(--spacing-xs);
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.brand-tagline {
  color: var(--color-text-secondary);
  font-size: 1rem;
  margin-bottom: var(--spacing-xl);
}

.brand-features {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.brand-feature {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.feature-check {
  color: var(--color-primary);
  font-weight: 600;
}

/* Mini court decoration */
.mini-court {
  position: absolute;
  bottom: -30px;
  right: -30px;
  width: 200px;
  height: 250px;
  background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
  border-radius: var(--radius-lg);
  opacity: 0.15;
  transform: rotate(-15deg);
}

.mini-court .court-line {
  position: absolute;
  background: white;
}

.mini-court .court-line.h {
  width: 100%;
  height: 2px;
  top: 50%;
}

.mini-court .court-line.v {
  width: 2px;
  height: 100%;
  left: 50%;
}

/* Right form section */
.signup-form-section {
  padding: var(--spacing-2xl);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
}

.signup-card {
  width: 100%;
  max-width: 360px;
}

.signup-header {
  text-align: center;
  margin-bottom: var(--spacing-xl);
}

.signup-header h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: var(--spacing-xs);
}

.signup-header p {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.loading-container {
  display: flex;
  justify-content: center;
  padding: var(--spacing-2xl);
}

.auth-container {
  min-height: 300px;
  width: 100%;
}

/* Clerk component overrides for mobile */
:deep(.cl-rootBox),
:deep(.cl-card),
:deep(.cl-main),
:deep(.cl-form),
:deep(.cl-socialButtons) {
  width: 100% !important;
  max-width: 100% !important;
}

:deep(.cl-socialButtonsBlockButton) {
  min-width: 0 !important;
}

:deep(.cl-formFieldInput) {
  width: 100% !important;
}

/* No auth state */
.no-auth {
  text-align: center;
  padding: var(--spacing-xl);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: var(--radius-lg);
}

.no-auth-icon {
  font-size: 2rem;
  margin-bottom: var(--spacing-md);
}

.no-auth-title {
  font-weight: 600;
  margin-bottom: var(--spacing-sm);
  color: var(--color-error);
}

.no-auth-message {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  line-height: 1.5;
}

.no-auth code {
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

/* Footer */
.signup-footer {
  margin-top: var(--spacing-xl);
  text-align: center;
}

.back-link {
  color: var(--color-text-muted);
  font-size: 0.875rem;
  transition: color var(--transition-fast);
}

.back-link:hover {
  color: var(--color-primary);
}

/* Responsive */
@media (max-width: 768px) {
  .signup-page {
    padding: var(--spacing-md);
  }

  .signup-container {
    grid-template-columns: 1fr;
    max-width: 100%;
    border-radius: var(--radius-lg);
  }

  .signup-branding {
    display: none;
  }

  .signup-form-section {
    padding: var(--spacing-lg);
  }

  .signup-card {
    max-width: 100%;
  }

  .signup-header {
    margin-bottom: var(--spacing-lg);
  }

  .signup-header::before {
    content: '🏓';
    display: block;
    font-size: 2.5rem;
    margin-bottom: var(--spacing-md);
  }

  .auth-container {
    min-height: 350px;
    overflow-x: auto;
  }
}

@media (max-width: 480px) {
  .signup-page {
    padding: var(--spacing-sm);
  }

  .signup-form-section {
    padding: var(--spacing-md);
  }

  .signup-header h2 {
    font-size: 1.25rem;
  }

  .signup-header p {
    font-size: 0.8rem;
  }
}
</style>
