import { ref, onBeforeUnmount } from 'vue'

// Minimal structural type so we don't depend on lib.dom's WakeLock defs.
interface WakeLockSentinelLike {
  released: boolean
  release(): Promise<void>
  addEventListener(type: 'release', listener: () => void): void
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>
}

/**
 * Screen wake lock for the live scoreboard: request on enter, release on
 * exit/unmount, re-acquire when the tab becomes visible again (the browser
 * auto-releases on backgrounding). Feature-detected — a silent no-op on
 * browsers without the Wake Lock API.
 */
export function useWakeLock() {
  const isActive = ref(false)
  let sentinel: WakeLockSentinelLike | null = null
  // Whether the consumer currently wants the lock (drives re-acquire)
  let wanted = false

  function getWakeLock(): WakeLockLike | undefined {
    return (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock
  }

  async function acquire() {
    const wakeLock = getWakeLock()
    if (!wakeLock || sentinel) return
    try {
      const s = await wakeLock.request('screen')
      sentinel = s
      isActive.value = true
      s.addEventListener('release', () => {
        if (sentinel === s) {
          sentinel = null
          isActive.value = false
        }
      })
    } catch {
      // Denied (low battery, permissions) — silently do nothing
    }
  }

  async function request() {
    wanted = true
    await acquire()
  }

  async function release() {
    wanted = false
    const s = sentinel
    sentinel = null
    isActive.value = false
    try {
      await s?.release()
    } catch {
      // Already released — ignore
    }
  }

  function onVisibilityChange() {
    if (wanted && document.visibilityState === 'visible') {
      void acquire()
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange)

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    void release()
  })

  return { request, release, isActive }
}
