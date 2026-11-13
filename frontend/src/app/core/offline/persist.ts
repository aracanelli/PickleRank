/**
 * Last-known API responses kept in localStorage, per signed-in user, so screens open with
 * what the user saw last time (also offline) and refresh in the background.
 *
 * Scoped by user id and wiped on sign-out or account switch: one account's leagues never
 * show under another. Bounded: least recently written entries go first.
 */

const PREFIX = 'picklerank:q:'
const INDEX = 'picklerank:q-index'
const MAX_ENTRIES = 120

type Index = Record<string, number> // storage key -> last write time

let scope: string | null = null

function store(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

function readIndex(s: Storage): Index {
  try { return JSON.parse(s.getItem(INDEX) || '{}') as Index } catch { return {} }
}

function keyFor(endpoint: string) {
  return scope ? `${PREFIX}${scope}:${endpoint}` : null
}

/** Set the signed-in user. Pass null when signed out (reads and writes become no-ops). */
export function setPersistScope(userId: string | null) {
  scope = userId
}

export function getPersistScope() {
  return scope
}

export function readPersisted<T>(endpoint: string): T | null {
  const s = store()
  const k = keyFor(endpoint)
  if (!s || !k) return null
  try {
    const raw = s.getItem(k)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/** `forScope`: the user the request was made for; a response that lands after a switch is dropped. */
export function writePersisted(endpoint: string, data: unknown, forScope: string | null = scope) {
  const s = store()
  if (forScope !== scope) return
  const k = keyFor(endpoint)
  if (!s || !k) return
  const index = readIndex(s)
  const raw = JSON.stringify(data)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      s.setItem(k, raw)
      index[k] = Date.now()
      const keys = Object.keys(index)
      if (keys.length > MAX_ENTRIES) evict(s, index, keys.length - MAX_ENTRIES)
      s.setItem(INDEX, JSON.stringify(index))
      return
    } catch {
      // quota: drop the oldest quarter and try again
      evict(s, index, Math.max(1, Math.ceil(Object.keys(index).length / 4)))
    }
  }
}

function evict(s: Storage, index: Index, count: number) {
  const oldest = Object.entries(index).sort((a, b) => a[1] - b[1]).slice(0, count)
  for (const [k] of oldest) {
    try { s.removeItem(k) } catch { /* ignore */ }
    delete index[k]
  }
}

export function forgetPersisted(endpoint: string) {
  const s = store()
  const k = keyFor(endpoint)
  if (!s || !k) return
  try {
    s.removeItem(k)
    const index = readIndex(s)
    delete index[k]
    s.setItem(INDEX, JSON.stringify(index))
  } catch { /* ignore */ }
}

/** Remove every user's cached responses (sign-out). */
export function clearAllPersisted() {
  const s = store()
  if (!s) return
  const index = readIndex(s)
  for (const k of Object.keys(index)) {
    try { s.removeItem(k) } catch { /* ignore */ }
  }
  try { s.removeItem(INDEX) } catch { /* ignore */ }
}
