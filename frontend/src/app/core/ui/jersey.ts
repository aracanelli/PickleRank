/** Number of jersey colours defined in tokens.css (--jersey-1 .. --jersey-8). */
export const JERSEY_COUNT = 8

/** Stable 1-based jersey colour index for a player id or name. */
export function jerseyFor(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return (h % JERSEY_COUNT) + 1
}

/** Up to two initials: first and last word. "Ana Ruiz" -> "AR", "Cher" -> "CH". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}
