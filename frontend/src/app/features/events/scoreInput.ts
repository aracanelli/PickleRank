/**
 * Score field validation for the court sheet.
 * The API accepts any score >= 0 and allows ties; the sheet asks for whole numbers 0–99
 * and both sides, so a half-typed score is never saved to a court.
 */
export const SCORE_MAX = 99

export function parseScore(raw: string): { value?: number; error?: string } {
  const s = raw.trim()
  if (!s) return { error: 'Enter a score' }
  if (!/^\d+$/.test(s)) return { error: 'Use whole numbers only' }
  const n = Number(s)
  if (n > SCORE_MAX) return { error: `Scores go up to ${SCORE_MAX}` }
  return { value: n }
}

export function validatePair(a: string, b: string) {
  const one = parseScore(a)
  const two = parseScore(b)
  return {
    ok: one.value != null && two.value != null,
    score1: one.value,
    score2: two.value,
    error1: one.error,
    error2: two.error
  }
}

/** Keep only digits as the user types (paste, autocorrect, or a stray minus sign). */
export const digitsOnly = (s: string) => s.replace(/\D+/g, '').slice(0, 2)
