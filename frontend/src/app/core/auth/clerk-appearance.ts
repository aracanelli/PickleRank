import type { ResolvedTheme } from '@/stores/theme'
import { BRAND, FONTS } from '@/app/core/brand/brand-constants'

/**
 * Clerk `appearance` object built from the COURTSIDE brand constants for the
 * given theme. Clerk components are mounted (not CSS-inherited), so auth
 * pages remount them with a fresh appearance when the theme changes.
 */
export function getClerkAppearance(theme: ResolvedTheme) {
  const c = BRAND[theme]
  return {
    variables: {
      // Volt as a fill fails on white; use the accent-text role for Clerk's
      // primary (it colors buttons AND links) in light mode.
      colorPrimary: theme === 'dark' ? c.accentFill : c.accentText,
      colorBackground: c.surface1,
      colorInputBackground: c.surface2,
      colorInputText: c.ink,
      colorText: c.ink,
      colorTextSecondary: c.inkMuted,
      colorDanger: c.loss,
      borderRadius: '0.625rem',
      fontFamily: FONTS.sans
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
      headerTitle: {
        fontFamily: FONTS.display,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.04em'
      },
      formButtonPrimary: {
        color: theme === 'dark' ? c.accentContrast : '#ffffff',
        fontWeight: 700
      },
      footer: { background: 'transparent' }
    }
  }
}
