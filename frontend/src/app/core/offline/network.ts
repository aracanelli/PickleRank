import { ref } from 'vue'

/**
 * Connection state as the app experiences it.
 * navigator.onLine only says "a network interface is up"; a gym Wi-Fi with no internet
 * still reports online. So a failed fetch also flips `online` off until a request succeeds.
 */
export const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine !== false)

const listeners = new Set<() => void>()

/** Run fn whenever the connection comes back. Returns an unsubscribe function. */
export function onReconnect(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function setOnline(next: boolean) {
  const was = online.value
  online.value = next
  if (next && !was) listeners.forEach(fn => { try { fn() } catch { /* listener errors stay local */ } })
}

/** Called by the API client after every request so the UI tracks real reachability. */
export function reportReachable(ok: boolean) {
  setOnline(ok)
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setOnline(true))
  window.addEventListener('offline', () => setOnline(false))
}

/** True for errors where the request never got a response: offline, DNS, CORS-less drop, timeout. */
export function isNetworkError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const x = e as { status?: number; offline?: boolean; name?: string }
  if (x.offline) return true
  if (x.name === 'TypeError' || x.name === 'AbortError') return true
  return x.status === 0
}

/** RFC 4122 v4 id made on the device, so things created offline already have their final id. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
