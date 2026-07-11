import { ref, watch, onBeforeUnmount, type Ref } from 'vue'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

/**
 * Animates a displayed number toward `target` with an ease-out-expo rAF loop.
 * Under reduced motion (or duration 0) it jumps straight to the final value.
 */
export function useCountUp(
  target: Ref<number>,
  options: { duration?: number; decimals?: number; enabled?: Ref<boolean> } = {}
) {
  const duration = options.duration ?? 800
  const decimals = options.decimals ?? 0
  const reduced = usePrefersReducedMotion()

  const display = ref(0)
  let rafId: number | null = null

  function cancel() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  function animateTo(value: number) {
    cancel()
    if (reduced.value || duration <= 0 || (options.enabled && !options.enabled.value)) {
      display.value = value
      return
    }
    const from = display.value
    const delta = value - from
    if (delta === 0) return
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const factor = Math.pow(10, decimals)
      display.value = Math.round((from + delta * easeOutExpo(t)) * factor) / factor
      if (t < 1) {
        rafId = requestAnimationFrame(step)
      } else {
        rafId = null
      }
    }
    rafId = requestAnimationFrame(step)
  }

  watch(target, (value) => animateTo(value), { immediate: true })
  onBeforeUnmount(cancel)

  return { display }
}
