import type { SubBalanceDto, PaymentType } from '@/app/core/models/dto'

export const MAX_AMOUNT = 10000
export const MAX_NOTES = 500

/** Format money in the league's currency. Falls back to "12.50 XYZ" for a code Intl doesn't know. */
export function formatMoney(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export type BalanceKind = 'owes' | 'credit' | 'settled'

// Sub balances: negative means the sub owes the league, positive is credit.
export const balanceKind = (balance: number): BalanceKind =>
  balance < -0.004 ? 'owes' : balance > 0.004 ? 'credit' : 'settled'

/** Balance in words, so meaning never depends on color. */
export function balanceText(balance: number, currency: string): string {
  const kind = balanceKind(balance)
  if (kind === 'owes') return `Owes ${formatMoney(-balance, currency)}`
  if (kind === 'credit') return `${formatMoney(balance, currency)} credit`
  return 'Paid up'
}

/** Who to chase first: largest debt first, then credit, then settled; names A to Z within a tie. */
export function sortBalances(list: SubBalanceDto[]): SubBalanceDto[] {
  return [...list].sort((a, b) => a.balance - b.balance || a.displayName.localeCompare(b.displayName))
}

/** Validate a typed amount (always entered as a positive number). Returns the number or an error sentence. */
export function parseAmount(raw: string): { value: number } | { error: string } {
  const t = raw.trim().replace(/^[^\d.-]+/, '')
  if (!t) return { error: 'Enter an amount.' }
  if (!/^-?\d*(\.\d{0,2})?$/.test(t) || t === '.' || t === '-') return { error: 'Use a number with up to 2 decimal places.' }
  const value = Number(t)
  if (!(value > 0)) return { error: 'Enter an amount greater than 0.' }
  if (value > MAX_AMOUNT) return { error: `Use an amount of ${MAX_AMOUNT.toLocaleString()} or less.` }
  return { value }
}

export function notesError(notes: string): string | undefined {
  return notes.length > MAX_NOTES ? `Keep notes to ${MAX_NOTES} characters or fewer.` : undefined
}

const TYPE_LABEL: Record<PaymentType, string> = { ATTENDANCE: 'Attendance charge', PAYMENT: 'Payment', ADJUSTMENT: 'Adjustment' }

/** One history line in words: "Payment, +$10.00" or "Attendance charge, −$5.00". */
export function historyAmount(amount: number, currency: string): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : ''
  return `${sign}${formatMoney(Math.abs(amount), currency)}`
}
export const historyLabel = (type: PaymentType) => TYPE_LABEL[type]
