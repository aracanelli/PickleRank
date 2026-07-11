import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'pr-theme'
const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#f8fafc',
  dark: '#0f172a'
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // localStorage unavailable (private mode / SSR) — fall through
  }
  return 'system'
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Theme preference store. `data-theme` on <html> is the single source of truth
 * for CSS; an inline script in index.html applies it pre-bundle to avoid a
 * flash of the wrong theme, and this store keeps it in sync afterwards.
 */
export const useThemeStore = defineStore('theme', () => {
  const preference = ref<ThemePreference>(readStoredPreference())
  const systemResolved = ref<ResolvedTheme>(systemTheme())

  const resolved = computed<ResolvedTheme>(() =>
    preference.value === 'system' ? systemResolved.value : preference.value
  )

  function applyToDocument() {
    const theme = resolved.value
    document.documentElement.dataset.theme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[theme])
  }

  function setPreference(value: ThemePreference) {
    preference.value = value
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // best-effort persistence
    }
    applyToDocument()
  }

  function init() {
    applyToDocument()
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      systemResolved.value = e.matches ? 'dark' : 'light'
      applyToDocument()
    })
  }

  return { preference, resolved, setPreference, init }
})
