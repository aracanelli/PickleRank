import { ref, onBeforeUnmount } from 'vue'

/** Reactive `prefers-reduced-motion: reduce`. All signature-motion consumers
 *  (count-ups, celebration, draws) must check this and render final state. */
export function usePrefersReducedMotion() {
  const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const reduced = ref(query?.matches ?? false)

  const onChange = (e: MediaQueryListEvent) => {
    reduced.value = e.matches
  }
  query?.addEventListener('change', onChange)
  onBeforeUnmount(() => query?.removeEventListener('change', onChange))

  return reduced
}
