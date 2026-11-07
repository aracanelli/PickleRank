import type { SkillLevel } from '@/app/core/models/dto'

/** One name per line; blank lines dropped; repeats (ignoring case and spacing) kept once. */
export function parseNames(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const name = line.trim().replace(/\s+/g, ' ')
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/** Case-insensitive name search, alphabetical. Never mutates the input. */
export function findByName<T extends { displayName: string }>(list: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  const hits = q ? list.filter(p => p.displayName.toLowerCase().includes(q)) : list
  return [...hits].sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/** The deep link an organizer sends so a player can claim their profile. */
export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/link-player?token=${encodeURIComponent(token)}`
}

export const SKILL_LEVELS: { value: SkillLevel; label: string }[] = [
  { value: 'ADVANCED', label: 'Advanced (+100 for matchmaking)' },
  { value: 'INTERMEDIATE', label: 'Intermediate (no change)' },
  { value: 'BEGINNER', label: 'Beginner (−100 for matchmaking)' }
]

export function skillWord(level?: SkillLevel): string {
  return (level ?? 'INTERMEDIATE').toLowerCase()
}

/** "3 players" / "1 player" */
export function count(n: number, word = 'player'): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
