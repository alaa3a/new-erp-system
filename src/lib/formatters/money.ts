/**
 * Money calculation helpers — all monetary math uses integer cents so that
 * financial totals never drift due to floating-point rounding.
 */

/**
 * Convert a dollar amount (float) to cents (integer) with proper rounding.
 */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Calculate a line total in cents from quantity, unit price (cents) and a
 * whole-number discount percent (e.g. 15 for 15%).
 *
 * Integer-first math: `qty * price * (100 - discount)` is computed before the
 * single division, and the result is rounded — avoiding float truncation such
 * as `3 * 3333 * 0.85 = 8499.15` landing anywhere but 8499.
 */
export function calculateLineTotal(quantity: number, unitPriceCents: number, discountPercent: number): number {
  const discountMultiplier = 100 - (discountPercent || 0);
  return Math.round(quantity * unitPriceCents * discountMultiplier / 100);
}

/**
 * Calculate a VAT amount in cents from a line total (cents) and a whole-number
 * rate (e.g. 15 for 15%).
 */
export function calculateVatAmount(lineTotalCents: number, vatRate: number): number {
  return Math.round(lineTotalCents * (vatRate || 0) / 100);
}
