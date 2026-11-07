/**
 * FIXTURE MODE ONLY (vite --mode e2e). Replaces clerk.ts with a fake signed-in session so the
 * UI can be exercised against the fake API without real accounts. Never imported in normal builds:
 * vite.config.ts aliases it in only when mode === 'e2e'.
 *
 * Pick the user with localStorage 'e2e:user' = 'user_org' (default) or 'user_mem', or 'signed-out'.
 */
export { useAuthStore } from '@/stores/auth'

type Store = ReturnType<typeof import('@/stores/auth').useAuthStore>
let store: Store | null = null

const MARKER = 'picklerank-e2e-fake-clerk'

/** e2e-real mode: a JWT minted by backend/tests/local_stack/mint_token.py, verified by the real API. */
function minted(): string | null {
  try { return localStorage.getItem('e2e:token') } catch { return null }
}

function current() {
  let id = 'user_org'
  try { id = localStorage.getItem('e2e:user') || id } catch { /* default */ }
  return id
}

function fakeUser(id: string) {
  const org = id === 'user_org'
  return {
    id,
    firstName: org ? 'Riley' : 'Ben',
    lastName: org ? 'Organizer' : 'Cho',
    fullName: org ? 'Riley Organizer' : 'Ben Cho',
    emailAddresses: [{ emailAddress: org ? 'riley@example.test' : 'ben@example.test' }],
    primaryEmailAddress: { emailAddress: org ? 'riley@example.test' : 'ben@example.test' },
    imageUrl: null
  }
}

export function setAuthStore(s: Store) {
  store = s
}

export async function initClerk() {
  const id = current()
  if (store) {
    if (id === 'signed-out') store.clearAuth()
    else store.setAuth(fakeUser(id), { id: `sess_${id}`, userId: id, status: 'active', getToken: async () => minted() ?? `e2e-${id}` })
    store.setInitialized(true)
  }
  return null
}

export const getClerk = () => ({ marker: MARKER, mountSignIn() {}, unmountSignIn() {}, mountSignUp() {}, unmountSignUp() {} }) as any
export const isAuthenticated = () => !!store?.isAuthenticated
export const getUser = () => store?.user
export const waitForAuth = async () => { await store?.waitForAuth() }
export const getToken = async () => (store?.isAuthenticated ? minted() ?? `e2e-${current()}` : null)
export const signIn = async () => {}
export const signUp = async () => {}
export async function signOut() {
  try { localStorage.setItem('e2e:user', 'signed-out') } catch { /* ignore */ }
  store?.clearAuth()
  window.location.href = '/'
}
export const signOutSession = async () => {}
export async function switchSession(sessionId: string) {
  const id = sessionId.replace(/^sess_/, '')
  try { localStorage.setItem('e2e:user', id) } catch { /* ignore */ }
  store?.setAuth(fakeUser(id), { id: sessionId, userId: id, status: 'active', getToken: async () => `e2e-${id}` })
}
export const getSessions = () => ['user_org', 'user_mem'].map(id => ({ id: `sess_${id}`, user: fakeUser(id) }))
export const destroyClerk = () => {}
