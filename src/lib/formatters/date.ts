const shortFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const longFmt = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const monthDayFmt = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' })
const datetimeFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const datetimeSecFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

export type DateStyle = 'short' | 'long' | 'monthDay' | 'datetime' | 'datetimeSec'

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Format a date or ISO date string. Invalid/empty input returns ''.
 * Styles: 'short' (Jul 15, 2026), 'long' (July 15, 2026),
 * 'monthDay' (July 15), 'datetime' (Jul 15, 2026, 10:30 AM),
 * 'datetimeSec' (Jul 15, 2026, 10:30:45 AM).
 */
export function formatDate(value: string | Date | null | undefined, style: DateStyle = 'short'): string {
  const d = toDate(value)
  if (!d) return ''
  switch (style) {
    case 'long':
      return longFmt.format(d)
    case 'monthDay':
      return monthDayFmt.format(d)
    case 'datetime':
      return datetimeFmt.format(d)
    case 'datetimeSec':
      return datetimeSecFmt.format(d)
    default:
      return shortFmt.format(d)
  }
}
