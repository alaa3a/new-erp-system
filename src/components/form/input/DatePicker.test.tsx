// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import DatePicker from './DatePicker'

afterEach(() => {
  cleanup()
})

function setup(overrides: Partial<Parameters<typeof DatePicker>[0]> = {}) {
  const onChange = vi.fn()
  const utils = render(<DatePicker value="" onChange={onChange} {...overrides} />)
  return { onChange, ...utils }
}

const todayISO = () => {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

describe('DatePicker', () => {
  describe('open / close', () => {
    it('renders the trigger with a placeholder when no value is set', () => {
      setup()
      expect(screen.getByRole('button', { name: 'Select date' })).toBeTruthy()
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('renders the formatted date in the trigger when a value is set', () => {
      setup({ value: '2026-07-15' })
      expect(screen.getByRole('button', { name: 'Jul 15, 2026' })).toBeTruthy()
    })

    it('opens the calendar popover when the trigger is clicked', () => {
      setup()
      expect(screen.queryByRole('dialog')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Select date' }))

      expect(screen.getByRole('dialog', { name: 'Date picker' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Select date' }).getAttribute('aria-expanded')).toBe('true')
    })

    it('closes when clicking outside the popover', () => {
      const { container } = setup()
      fireEvent.click(screen.getByRole('button', { name: 'Select date' }))
      expect(screen.getByRole('dialog')).toBeTruthy()

      // The click-outside catcher is the fixed inset-0 div before the dialog.
      const catcher = container.querySelector('.fixed.inset-0') as HTMLElement
      expect(catcher).toBeTruthy()
      fireEvent.click(catcher)

      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('closes on Escape', () => {
      setup()
      fireEvent.click(screen.getByRole('button', { name: 'Select date' }))
      expect(screen.getByRole('dialog')).toBeTruthy()

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('does not open when disabled', () => {
      setup({ disabled: true })
      fireEvent.click(screen.getByRole('button', { name: 'Select date' }))
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  describe('month navigation', () => {
    it('opens on the month of the selected value', () => {
      setup({ value: '2026-07-15' })
      fireEvent.click(screen.getByRole('button', { name: 'Jul 15, 2026' }))
      expect(screen.getByText('July 2026')).toBeTruthy()
    })

    it('navigates between months with prev/next buttons', () => {
      setup({ value: '2026-07-15' })
      fireEvent.click(screen.getByRole('button', { name: 'Jul 15, 2026' }))

      fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
      expect(screen.getByText('June 2026')).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
      fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
      expect(screen.getByText('August 2026')).toBeTruthy()
    })

    it('rolls the year over when navigating past December', () => {
      setup({ value: '2025-12-10' })
      fireEvent.click(screen.getByRole('button', { name: 'Dec 10, 2025' }))

      fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
      expect(screen.getByText('January 2026')).toBeTruthy()
    })
  })

  describe('day selection', () => {
    it('calls onChange with the ISO date and closes when a day is selected', () => {
      const { onChange } = setup({ value: '2026-07-15' })
      fireEvent.click(screen.getByRole('button', { name: 'Jul 15, 2026' }))

      fireEvent.click(screen.getByRole('button', { name: '20' }))

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith('2026-07-20')
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('selects today via the Today shortcut', () => {
      const { onChange } = setup()
      fireEvent.click(screen.getByRole('button', { name: 'Select date' }))

      fireEvent.click(screen.getByRole('button', { name: 'Today' }))

      expect(onChange).toHaveBeenCalledWith(todayISO())
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  describe('min / max disabling', () => {
    it('disables days outside the range and still selects in-range days', () => {
      const { onChange } = setup({ value: '2026-07-15', min: '2026-07-10', max: '2026-07-20' })
      fireEvent.click(screen.getByRole('button', { name: 'Jul 15, 2026' }))

      const day5 = screen.getByRole('button', { name: '5' }) as HTMLButtonElement
      const day15 = screen.getByRole('button', { name: '15' }) as HTMLButtonElement
      const day25 = screen.getByRole('button', { name: '25' }) as HTMLButtonElement

      expect(day5.disabled).toBe(true) // before min
      expect(day25.disabled).toBe(true) // after max
      expect(day15.disabled).toBe(false) // within range

      // Clicking a disabled day does not fire onChange.
      fireEvent.click(day5)
      expect(onChange).not.toHaveBeenCalled()

      // In-range selection still works.
      fireEvent.click(day15)
      expect(onChange).toHaveBeenCalledWith('2026-07-15')
    })
  })
})
