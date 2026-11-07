import { onMounted, onUnmounted } from 'vue'

/**
 * Publishes --kb-inset on <html>: how much of the layout viewport the on-screen keyboard covers.
 * Sticky bottom controls add it to their offset so the save button stays above the keyboard
 * (iOS Safari does not resize the layout viewport for the keyboard).
 */
let users = 0
function update() {
  const vv = window.visualViewport
  if (!vv) return
  const inset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop))
  document.documentElement.style.setProperty('--kb-inset', `${Math.round(inset)}px`)
}

export function useKeyboardInset() {
  onMounted(() => {
    if (!window.visualViewport) return
    if (users++ === 0) {
      window.visualViewport.addEventListener('resize', update)
      window.visualViewport.addEventListener('scroll', update)
    }
    update()
  })
  onUnmounted(() => {
    if (!window.visualViewport) return
    if (--users === 0) {
      window.visualViewport.removeEventListener('resize', update)
      window.visualViewport.removeEventListener('scroll', update)
      document.documentElement.style.removeProperty('--kb-inset')
    }
  })
}
