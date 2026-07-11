/** Formats an amount using the group's payment currency (ported legacy helper). */
export function formatCurrency(amount: number, currency: string | undefined): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD'
  }).format(amount)
}
