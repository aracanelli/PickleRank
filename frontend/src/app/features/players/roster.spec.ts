import { describe, it, expect } from 'vitest'
import { parseNames, findByName, inviteUrl, count, skillWord } from './roster'

describe('parseNames', () => {
  it('splits lines, trims, drops blanks', () => {
    expect(parseNames('  Ana Ruiz \n\n Ben   Cho\r\n\t\n')).toEqual(['Ana Ruiz', 'Ben Cho'])
  })
  it('keeps the first of repeated names ignoring case', () => {
    expect(parseNames('Ana Ruiz\nana ruiz\nANA  RUIZ\nBen')).toEqual(['Ana Ruiz', 'Ben'])
  })
  it('returns nothing for empty input', () => {
    expect(parseNames('')).toEqual([])
    expect(parseNames('\n  \n')).toEqual([])
  })
})

describe('findByName', () => {
  const list = [{ displayName: 'cy Diaz' }, { displayName: 'Ana Ruiz' }, { displayName: 'Ben Cho' }]
  it('sorts alphabetically without mutating', () => {
    expect(findByName(list, '').map(p => p.displayName)).toEqual(['Ana Ruiz', 'Ben Cho', 'cy Diaz'])
    expect(list[0].displayName).toBe('cy Diaz')
  })
  it('matches anywhere, ignoring case and outer spaces', () => {
    expect(findByName(list, '  DI ').map(p => p.displayName)).toEqual(['cy Diaz'])
    expect(findByName(list, 'zzz')).toEqual([])
  })
})

describe('inviteUrl', () => {
  it('builds the link-player deep link', () => {
    expect(inviteUrl('https://app.example', 'tok_1')).toBe('https://app.example/link-player?token=tok_1')
  })
  it('encodes the token and tolerates a trailing slash', () => {
    expect(inviteUrl('http://localhost:5199/', 'a b&c')).toBe('http://localhost:5199/link-player?token=a%20b%26c')
  })
})

describe('copy helpers', () => {
  it('pluralizes', () => {
    expect(count(1)).toBe('1 player')
    expect(count(0)).toBe('0 players')
    expect(count(2, 'sub')).toBe('2 subs')
  })
  it('defaults skill to intermediate', () => {
    expect(skillWord()).toBe('intermediate')
    expect(skillWord('ADVANCED')).toBe('advanced')
  })
})
