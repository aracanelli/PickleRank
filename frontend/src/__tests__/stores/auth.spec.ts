import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts unauthenticated with loading true', () => {
      const store = useAuthStore()
      expect(store.isAuthenticated).toBe(false)
      expect(store.isLoading).toBe(true)
      expect(store.isInitialized).toBe(false)
      expect(store.user).toBeNull()
      expect(store.session).toBeNull()
    })
  })

  describe('setAuth', () => {
    it('sets user and session, making isAuthenticated true', () => {
      const store = useAuthStore()
      const mockUser = {
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        fullName: 'John Doe',
        emailAddresses: [{ emailAddress: 'john@example.com' }],
        imageUrl: 'https://img.example.com/john.jpg',
        primaryEmailAddress: { emailAddress: 'john@example.com' }
      }
      const mockSession = {
        id: 'sess-1',
        userId: 'user-1',
        status: 'active',
        getToken: vi.fn().mockResolvedValue('token-abc')
      }

      store.setAuth(mockUser, mockSession)

      expect(store.isAuthenticated).toBe(true)
      expect(store.userId).toBe('user-1')
      expect(store.userEmail).toBe('john@example.com')
      expect(store.userName).toBe('John Doe')
      expect(store.userInitials).toBe('JD')
    })

    it('caches session to localStorage on setAuth', () => {
      const store = useAuthStore()
      store.setAuth(
        {
          id: 'user-2',
          firstName: 'Jane',
          lastName: null,
          fullName: null,
          emailAddresses: [{ emailAddress: 'jane@test.com' }],
          imageUrl: null
        },
        { id: 'sess-2', userId: 'user-2', status: 'active', getToken: vi.fn() }
      )

      expect(localStorage.setItem).toHaveBeenCalled()
      const cachedStr = (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls
        .find((c: string[]) => c[0] === 'picklerank_session_cache')
      expect(cachedStr).toBeDefined()
      const cached = JSON.parse(cachedStr![1])
      expect(cached.userId).toBe('user-2')
      expect(cached.email).toBe('jane@test.com')
    })
  })

  describe('computed properties', () => {
    it('userName falls back to firstName when fullName is null', () => {
      const store = useAuthStore()
      store.setAuth(
        {
          id: 'u1',
          firstName: 'Alice',
          lastName: null,
          fullName: null,
          emailAddresses: [{ emailAddress: 'alice@test.com' }],
          imageUrl: null
        },
        { id: 's1', userId: 'u1', status: 'active', getToken: vi.fn() }
      )
      expect(store.userName).toBe('Alice')
    })

    it('userName falls back to email username when no name', () => {
      const store = useAuthStore()
      store.setAuth(
        {
          id: 'u2',
          firstName: null,
          lastName: null,
          fullName: null,
          emailAddresses: [{ emailAddress: 'bob@test.com' }],
          imageUrl: null
        },
        { id: 's2', userId: 'u2', status: 'active', getToken: vi.fn() }
      )
      expect(store.userName).toBe('bob')
    })

    it('userName defaults to "User" when nothing available', () => {
      const store = useAuthStore()
      // No user set, no email
      expect(store.userName).toBe('User')
    })

    it('userInitials uses first letter of email when no name', () => {
      const store = useAuthStore()
      store.setAuth(
        {
          id: 'u3',
          firstName: null,
          lastName: null,
          fullName: null,
          emailAddresses: [{ emailAddress: 'zara@test.com' }],
          imageUrl: null
        },
        { id: 's3', userId: 'u3', status: 'active', getToken: vi.fn() }
      )
      expect(store.userInitials).toBe('Z')
    })

    it('userInitials returns ? when nothing available', () => {
      const store = useAuthStore()
      expect(store.userInitials).toBe('?')
    })

    it('userEmail prefers primaryEmailAddress', () => {
      const store = useAuthStore()
      store.setAuth(
        {
          id: 'u4',
          firstName: 'Test',
          lastName: null,
          fullName: null,
          emailAddresses: [{ emailAddress: 'secondary@test.com' }],
          imageUrl: null,
          primaryEmailAddress: { emailAddress: 'primary@test.com' }
        },
        { id: 's4', userId: 'u4', status: 'active', getToken: vi.fn() }
      )
      expect(store.userEmail).toBe('primary@test.com')
    })
  })

  describe('clearAuth', () => {
    it('resets user and session', () => {
      const store = useAuthStore()
      store.setAuth(
        {
          id: 'u1',
          firstName: 'A',
          lastName: 'B',
          fullName: 'A B',
          emailAddresses: [{ emailAddress: 'a@b.com' }],
          imageUrl: null
        },
        { id: 's1', userId: 'u1', status: 'active', getToken: vi.fn() }
      )
      expect(store.isAuthenticated).toBe(true)

      store.clearAuth()

      expect(store.isAuthenticated).toBe(false)
      expect(store.user).toBeNull()
      expect(store.session).toBeNull()
      expect(localStorage.removeItem).toHaveBeenCalledWith('picklerank_session_cache')
    })
  })

  describe('setInitialized', () => {
    it('sets initialized to true and loading to false', () => {
      const store = useAuthStore()
      expect(store.isLoading).toBe(true)
      expect(store.isInitialized).toBe(false)

      store.setInitialized(true)

      expect(store.isInitialized).toBe(true)
      expect(store.isLoading).toBe(false)
    })
  })

  describe('getToken', () => {
    it('returns token from session', async () => {
      const store = useAuthStore()
      const getTokenMock = vi.fn().mockResolvedValue('my-jwt-token')
      store.setAuth(
        {
          id: 'u1',
          firstName: 'A',
          lastName: null,
          fullName: null,
          emailAddresses: [],
          imageUrl: null
        },
        { id: 's1', userId: 'u1', status: 'active', getToken: getTokenMock }
      )

      const token = await store.getToken()
      expect(token).toBe('my-jwt-token')
    })

    it('returns null when no session', async () => {
      const store = useAuthStore()
      const token = await store.getToken()
      expect(token).toBeNull()
    })
  })

  describe('initWithCache', () => {
    it('restores user from localStorage cache', () => {
      const cached = {
        userId: 'cached-user',
        email: 'cached@test.com',
        firstName: 'Cached',
        lastName: 'User',
        imageUrl: null,
        timestamp: Date.now()
      }
      localStorage.setItem('picklerank_session_cache', JSON.stringify(cached))
      // Make getItem actually return the value
      ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'picklerank_session_cache') return JSON.stringify(cached)
        return null
      })

      const store = useAuthStore()
      store.initWithCache()

      expect(store.user).not.toBeNull()
      expect(store.user!.id).toBe('cached-user')
      expect(store.user!.firstName).toBe('Cached')
      expect(store.user!.fullName).toBe('Cached User')
      // Not fully authenticated since no session
      expect(store.isAuthenticated).toBe(false)
    })

    it('ignores expired cached sessions', () => {
      const expired = {
        userId: 'old-user',
        email: 'old@test.com',
        firstName: 'Old',
        lastName: null,
        imageUrl: null,
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 // 8 days ago
      }
      ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'picklerank_session_cache') return JSON.stringify(expired)
        return null
      })

      const store = useAuthStore()
      store.initWithCache()

      // User should remain null since cache is expired
      expect(store.user).toBeNull()
    })
  })

  describe('multi-session cache', () => {
    it('keeps at most 5 sessions in cache', () => {
      const store = useAuthStore()

      // Set up mock to track multi-session storage
      const multiSessionStore: string[] = []
      ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'picklerank_sessions') return multiSessionStore[multiSessionStore.length - 1] ?? null
        return null
      })
      ;(localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation((key: string, value: string) => {
        if (key === 'picklerank_sessions') multiSessionStore.push(value)
      })

      // Add 6 different users
      for (let i = 0; i < 6; i++) {
        store.setAuth(
          {
            id: `user-${i}`,
            firstName: `User${i}`,
            lastName: null,
            fullName: null,
            emailAddresses: [{ emailAddress: `user${i}@test.com` }],
            imageUrl: null
          },
          { id: `sess-${i}`, userId: `user-${i}`, status: 'active', getToken: vi.fn() }
        )
      }

      // The last stored value should have at most 5 sessions
      const lastStored = multiSessionStore[multiSessionStore.length - 1]
      const sessions = JSON.parse(lastStored)
      expect(sessions.length).toBeLessThanOrEqual(5)
    })

    it('removeCachedSession filters out the specified user', () => {
      const sessions = [
        { userId: 'u1', email: 'a@b.com', firstName: 'A', lastName: null, imageUrl: null, timestamp: Date.now() },
        { userId: 'u2', email: 'b@b.com', firstName: 'B', lastName: null, imageUrl: null, timestamp: Date.now() }
      ]
      ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'picklerank_sessions') return JSON.stringify(sessions)
        return null
      })

      const store = useAuthStore()
      store.removeCachedSession('u1')

      const setCall = (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls
        .find((c: string[]) => c[0] === 'picklerank_sessions')
      const remaining = JSON.parse(setCall![1])
      expect(remaining).toHaveLength(1)
      expect(remaining[0].userId).toBe('u2')
    })
  })
})
