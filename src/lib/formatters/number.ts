const intl = new Intl.NumberFormat('en-US')

/** Format a plain number with thousands separators (e.g. 1234567 -> "1,234,567"). */
export function formatNumber(value: number): string {
  return intl.format(value)
}
