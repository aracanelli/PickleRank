import { describe, it, expect } from 'vitest'
import { getSafeRedirect, createNavigationWithRedirect } from '@/app/core/auth/redirectUtils'

describe('getSafeRedirect', () => {
  it('returns fallback for null input', () => {
    expect(getSafeRedirect(null)).toBe('/groups')
  })

  it('returns fallback for undefined input', () => {
    expect(getSafeRedirect(undefined)).toBe('/groups')
  })

  it('returns fallback for empty string', () => {
    expect(getSafeRedirect('')).toBe('/groups')
  })

  it('accepts valid /groups path', () => {
    expect(getSafeRedirect('/groups')).toBe('/groups')
  })

  it('accepts valid /groups subpath', () => {
    expect(getSafeRedirect('/groups/abc-123')).toBe('/groups/abc-123')
  })

  it('accepts /rankings path', () => {
    expect(getSafeRedirect('/rankings')).toBe('/rankings')
  })

  it('accepts /events path', () => {
    expect(getSafeRedirect('/events')).toBe('/events')
  })

  it('accepts /players path', () => {
    expect(getSafeRedirect('/players')).toBe('/players')
  })

  it('accepts /link-player path', () => {
    expect(getSafeRedirect('/link-player')).toBe('/link-player')
  })

  it('accepts path with query string', () => {
    expect(getSafeRedirect('/groups?tab=settings')).toBe('/groups?tab=settings')
  })

  it('rejects absolute URLs (open redirect attack)', () => {
    expect(getSafeRedirect('https://evil.com')).toBe('/groups')
  })

  it('rejects protocol-relative URLs', () => {
    expect(getSafeRedirect('//evil.com')).toBe('/groups')
  })

  it('rejects encoded protocol-relative URLs', () => {
    expect(getSafeRedirect('/%2Fevil.com')).toBe('/groups')
  })

  it('rejects paths not in allowed prefixes', () => {
    expect(getSafeRedirect('/login')).toBe('/groups')
    expect(getSafeRedirect('/signup')).toBe('/groups')
    expect(getSafeRedirect('/some-random-path')).toBe('/groups')
  })

  it('uses custom fallback when provided', () => {
    expect(getSafeRedirect(null, '/dashboard')).toBe('/dashboard')
  })

  it('handles array input by taking first element', () => {
    expect(getSafeRedirect(['/groups/123', '/other'])).toBe('/groups/123')
  })

  it('handles array with null first element', () => {
    expect(getSafeRedirect([null, '/groups'])).toBe('/groups')
  })

  it('rejects invalid URI encoding', () => {
    expect(getSafeRedirect('/groups/%ZZ')).toBe('/groups')
  })

  it('trims whitespace', () => {
    expect(getSafeRedirect('  /groups  ')).toBe('/groups')
  })
})

describe('createNavigationWithRedirect', () => {
  it('creates route object with redirect query', () => {
    const result = createNavigationWithRedirect('login', '/groups/123')
    expect(result).toEqual({
      name: 'login',
      query: { redirect: '/groups/123' }
    })
  })

  it('creates route object without redirect when null', () => {
    const result = createNavigationWithRedirect('login', null)
    expect(result).toEqual({
      name: 'login',
      query: {}
    })
  })

  it('takes first element from array', () => {
    const result = createNavigationWithRedirect('signup', ['/events', '/other'])
    expect(result).toEqual({
      name: 'signup',
      query: { redirect: '/events' }
    })
  })
})
