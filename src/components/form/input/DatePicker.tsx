'use client'
import { formatDate } from '@/lib/formatters'

import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  min?: string
  max?: string
  id?: string
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Parse YYYY-MM-DD into a local Date (avoids UTC off-by-one with new Date('YYYY-MM-DD')). */
function parseISO(iso: string): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Format a local Date back to YYYY-MM-DD. */
function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const formatDisplay = (iso: string) => {
  const d = parseISO(iso)
  if (!d) return ''
  return formatDate(d, 'short')
}

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  className = '',
  disabled = false,
  min,
  max,
  id,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState<Date>(() => parseISO(value) ?? new Date())
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Viewport coordinates for the fixed-position popover, measured on open.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Keep the calendar month in sync with the selected value when opening.
  useEffect(() => {
    if (open) setViewDate(parseISO(value) ?? new Date())
  }, [open, value])

  // Close on Escape, scroll or resize. Registered in the capture phase on
  // document so Escape runs BEFORE the Modal's own bubble-phase handler —
  // otherwise pressing Escape with the picker open would also close the modal.
  // Scroll/resize (capture catches inner scroll containers like modals) would
  // detach a fixed popover from its trigger, so we close instead of letting it
  // float over unrelated content.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const toggleOpen = () => {
    if (open) {
      setOpen(false)
      return
    }
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const popoverW = 256 // w-64
    const popoverH = 340 // approximate rendered height, used for flip detection
    // Flip the calendar above the trigger when there isn't room below, and
    // clamp it to the viewport edges so it never gets cut off.
    const opensUpward = rect.bottom + popoverH + 8 > window.innerHeight
    setPos({
      top: opensUpward ? Math.max(8, rect.top - popoverH - 4) : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - popoverW - 8)),
    })
    setViewDate(parseISO(value) ?? new Date())
    setOpen(true)
  }

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (Date | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))

  const todayISO = toISO(new Date())

  const isDisabled = (date: Date) => {
    const iso = toISO(date)
    return Boolean((min && iso < min) || (max && iso > max))
  }

  const changeMonth = (delta: number) => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  const selectDate = (date: Date) => {
    onChange(toISO(date))
    setOpen(false)
  }

  return (
    <div className={`relative ${className}`}>
      {/* Trigger — styled to match the app's input fields */}
      <button
        type="button"
        id={id}
        ref={triggerRef}
        disabled={disabled}
        onClick={toggleOpen}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm transition-colors hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 ${
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={`truncate ${value ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
      </button>

      {/* Calendar popover — fixed to the viewport so it is never clipped by
          scrollable containers (e.g. the overflow-y-auto modal content). */}
      {open && pos && (
        <>
          {/* Click-outside catcher */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Date picker"
            className="fixed z-20 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-theme-lg"
            style={{ top: pos.top, left: pos.left }}
          >
            {/* Month navigation */}
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                aria-label="Previous month"
                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {MONTHS[month]} {year}
              </span>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                aria-label="Next month"
                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map(w => (
                <div key={w} className="text-center text-[10px] font-medium uppercase text-gray-400 dark:text-gray-500">
                  {w}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((date, i) => {
                if (!date) return <div key={`blank-${i}`} />
                const iso = toISO(date)
                const isSelected = iso === value
                const isToday = iso === todayISO
                const off = isDisabled(date)

                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={off}
                    onClick={() => selectDate(date)}
                    className={`flex h-8 items-center justify-center rounded-md text-sm transition-colors ${
                      isSelected
                        ? 'bg-brand-500 font-medium text-white'
                        : isToday
                          ? 'font-medium text-brand-600 dark:text-brand-400 ring-1 ring-brand-500/40'
                          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    } ${off ? 'cursor-not-allowed opacity-35' : 'cursor-pointer'}`}
                  >
                    {date.getDate()}
                  </button>
                )
              })}
            </div>

            {/* Today shortcut */}
            <div className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-700">
              <button
                type="button"
                onClick={() => selectDate(new Date())}
                className="w-full rounded-md px-2 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/30"
              >
                Today
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
