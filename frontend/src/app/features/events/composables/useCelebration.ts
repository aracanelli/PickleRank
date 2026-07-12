import { ref, onUnmounted } from 'vue'
import { usePrefersReducedMotion } from '@/app/core/ui/composables/usePrefersReducedMotion'
import { BRAND } from '@/app/core/brand/brand-constants'

// Flash durations: full-motion vs the shorter static reduced-motion version
const FLASH_MS = 1200
const FLASH_REDUCED_MS = 800

/**
 * One-shot event-completion celebration: a small confetti burst in the
 * COURTSIDE status colors (skipped entirely under reduced motion) plus a
 * brief full-screen "EVENT COMPLETE" flash the caller renders while
 * `flashVisible` is true. `celebrate()` resolves when the flash ends
 * (timeout or tap-to-skip), so callers can sequence the reveal sheet after.
 */
export function useCelebration() {
  const prefersReducedMotion = usePrefersReducedMotion()
  const flashVisible = ref(false)

  let flashTimeoutId: number | undefined
  let resolveFlash: (() => void) | null = null

  async function fireConfetti() {
    if (prefersReducedMotion.value) return
    try {
      const { default: confetti } = await import('canvas-confetti')
      confetti({
        particleCount: 40,
        spread: 75,
        startVelocity: 38,
        origin: { x: 0.5, y: 0.55 },
        colors: [BRAND.dark.accentFill, BRAND.dark.win, BRAND.dark.tie],
        disableForReducedMotion: true,
        zIndex: 80
      })
    } catch {
      // Confetti is decorative — never let a chunk-load failure block the flow
    }
  }

  function endFlash() {
    if (flashTimeoutId !== undefined) {
      clearTimeout(flashTimeoutId)
      flashTimeoutId = undefined
    }
    flashVisible.value = false
    resolveFlash?.()
    resolveFlash = null
  }

  /** Fire confetti + show the flash; resolves when the flash is dismissed. */
  function celebrate(): Promise<void> {
    void fireConfetti()
    return new Promise((resolve) => {
      // If a celebration is somehow already running, resolve it first
      resolveFlash?.()
      resolveFlash = resolve
      flashVisible.value = true
      const duration = prefersReducedMotion.value ? FLASH_REDUCED_MS : FLASH_MS
      if (flashTimeoutId !== undefined) clearTimeout(flashTimeoutId)
      flashTimeoutId = window.setTimeout(endFlash, duration)
    })
  }

  /** Tap-to-skip handler for the flash overlay. */
  function skip() {
    endFlash()
  }

  onUnmounted(() => {
    endFlash()
  })

  return { flashVisible, celebrate, skip, prefersReducedMotion }
}
