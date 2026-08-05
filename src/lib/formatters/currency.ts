const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

export interface CurrencyFormatOptions {
  /** Number of fraction digits to display (default: 2). */
  fractionDigits?: number
}

/**
 * Format a cent-based amount as USD (e.g. 123456 -> "$1,234.56").
 * All money values in the API are stored in cents, so this helper divides
 * by 100 internally — always pass cents.
 */
export function formatCurrency(cents: number, options?: CurrencyFormatOptions): string {
  const digits = options?.fractionDigits
  if (digits === undefined) return usd.format(cents / 100)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
  }).format(cents / 100)
}
