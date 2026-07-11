import type { ResolvedTheme } from '@/stores/theme'

/**
 * Clerk `appearance` object built from the app's design tokens for the given
 * theme. Clerk components are mounted (not CSS-inherited), so auth pages
 * remount them with a fresh appearance when the theme changes.
 */
export function getClerkAppearance(theme: ResolvedTheme) {
  const dark = theme === 'dark'
  return {
    variables: {
      colorPrimary: dark ? '#10b981' : '#059669',
      colorBackground: dark ? '#1e293b' : '#ffffff',
      colorInputBackground: dark ? '#0f172a' : '#f8fafc',
      colorInputText: dark ? '#f8fafc' : '#0f172a',
      colorText: dark ? '#f8fafc' : '#0f172a',
      colorTextSecondary: dark ? '#94a3b8' : '#475569',
      colorDanger: dark ? '#f87171' : '#dc2626',
      borderRadius: '0.75rem',
      fontFamily: 'Outfit, system-ui, sans-serif'
    },
    elements: {
      rootBox: { width: '100%', maxWidth: '100%' },
      card: {
        background: 'transparent',
        boxShadow: 'none',
        border: 'none',
        padding: '0',
        width: '100%',
        maxWidth: '100%'
      },
      footer: { background: 'transparent' }
    }
  }
}
