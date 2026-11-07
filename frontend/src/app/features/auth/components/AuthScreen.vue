<script setup lang="ts">
/**
 * Shared frame for /login and /signup: mark, one line of context, Clerk's prebuilt
 * widget, and a link to the other page that keeps ?redirect=.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { getClerk } from '@/app/core/auth/clerk'
import { getSafeRedirect, createNavigationWithRedirect } from '@/app/core/auth/redirectUtils'
import { useAuthStore } from '@/stores/auth'
import UiState from '@/app/core/ui/UiState.vue'

const props = defineProps<{ mode: 'sign-in' | 'sign-up' }>()

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const container = ref<HTMLElement>()
const status = ref<'loading' | 'ready' | 'failed'>('loading')
const signIn = props.mode === 'sign-in'

function goToRedirect() {
  router.push(getSafeRedirect(route.query.redirect))
}

// Redirect as soon as auth flips (Clerk finishes sign-in, or session restored)
watch(() => authStore.isAuthenticated, (isAuth) => { if (isAuth) goToRedirect() }, { immediate: true })

/** Clerk can't read CSS variables, so pass resolved token values (light or dark) at mount. */
function appearance() {
  const css = getComputedStyle(document.documentElement)
  const t = (name: string) => css.getPropertyValue(name).trim()
  return {
    variables: {
      colorPrimary: t('--court') || '#1e5aa8',
      colorTextOnPrimaryBackground: t('--on-court'),
      colorBackground: t('--surface'),
      colorInputBackground: t('--surface'),
      colorInputText: t('--ink'),
      colorText: t('--ink'),
      colorTextSecondary: t('--ink-2'),
      colorNeutral: t('--ink'),
      colorDanger: t('--bad'),
      colorSuccess: t('--ok'),
      fontFamily: t('--font-ui'),
      fontSize: '16px',
      borderRadius: '8px',
    },
    elements: {
      rootBox: { width: '100%' },
      cardBox: { width: '100%', maxWidth: '100%', boxShadow: 'none', border: 'none' },
      card: { width: '100%', maxWidth: '100%', boxShadow: 'none', border: 'none', padding: '0', background: 'transparent' },
      headerTitle: { display: 'none' },
      headerSubtitle: { display: 'none' },
      // our own link to the other page replaces Clerk's footer
      footer: { display: 'none' },
      formFieldInput: { minHeight: '44px', fontSize: '16px' },
      formButtonPrimary: { minHeight: '52px', fontSize: '1.0625rem', fontWeight: '700', boxShadow: 'none' },
      socialButtonsBlockButton: { minHeight: '44px' },
    },
  }
}

onMounted(async () => {
  if (authStore.isAuthenticated) return goToRedirect()
  await authStore.waitForAuth()
  if (authStore.isAuthenticated) return goToRedirect()

  const clerk = getClerk()
  if (!clerk || !container.value) {
    status.value = 'failed'
    return
  }
  status.value = 'ready'
  if (signIn) {
    clerk.mountSignIn(container.value, {
      fallbackRedirectUrl: getSafeRedirect(route.query.redirect),
      signUpFallbackRedirectUrl: '/groups',
      appearance: appearance(),
    })
  } else {
    clerk.mountSignUp(container.value, {
      fallbackRedirectUrl: getSafeRedirect(route.query.redirect),
      signInFallbackRedirectUrl: '/groups',
      appearance: appearance(),
    })
  }
})

onUnmounted(() => {
  const clerk = getClerk()
  if (!clerk || !container.value) return
  if (signIn) clerk.unmountSignIn(container.value)
  else clerk.unmountSignUp(container.value)
})

function reload() {
  window.location.reload()
}
</script>

<template>
  <div class="page auth">
    <RouterLink to="/" class="auth__brand" aria-label="PickleRank home">
      <img src="/favicon.svg" alt="" width="36" height="36" />
      <span>PickleRank</span>
    </RouterLink>

    <div class="stack-sm">
      <h1>{{ signIn ? 'Sign in' : 'Create an account' }}</h1>
      <p class="muted">
        {{ signIn
          ? 'See your leagues, tonight’s courts and where you stand on the ladder.'
          : 'Join your league to see your matchups and where you stand on the ladder.' }}
      </p>
    </div>

    <UiState v-if="status === 'loading'" kind="loading" :title="signIn ? 'Loading sign-in' : 'Loading sign-up'" />
    <UiState
      v-else-if="status === 'failed'"
      kind="error"
      :title="signIn ? 'Sign-in didn’t load' : 'Sign-up didn’t load'"
      :body="authStore.error || 'Check your connection, then reload the page.'"
      action-label="Reload"
      @retry="reload"
    />
    <!-- Clerk owns this element's children; keep it in the DOM so the ref exists at mount -->
    <div v-show="status === 'ready'" ref="container" class="auth__widget" />

    <p class="auth__switch">
      {{ signIn ? 'New to PickleRank?' : 'Already have an account?' }}
      <RouterLink :to="createNavigationWithRedirect(signIn ? 'signup' : 'login', route.query.redirect)">
        {{ signIn ? 'Create an account' : 'Sign in' }}
      </RouterLink>
    </p>
  </div>
</template>

<style scoped>
.auth { max-width: 440px; }
.auth h1 { font-size: var(--text-xl); }
.auth__brand {
  display: inline-flex;
  align-items: center;
  gap: var(--s2);
  align-self: flex-start;
  min-height: var(--tap);
  margin-top: var(--safe-top);
  color: var(--ink);
  font-weight: 700;
  font-size: var(--text-md);
  text-decoration: none;
}
.auth__brand img { border-radius: 8px; }
.auth__widget {
  min-height: 360px;
  padding: var(--s4);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-tile);
}
.auth__switch { display: flex; flex-wrap: wrap; align-items: center; column-gap: var(--s1); color: var(--ink-2); }
.auth__switch a {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
  color: var(--court);
  font-weight: 700;
}
</style>
