// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ClearFiltersButton from './ClearFiltersButton'

afterEach(() => {
  cleanup()
})

describe('ClearFiltersButton', () => {
  it('renders the label with the active filter count in a badge', () => {
    render(<ClearFiltersButton filters={{ type: true, status: false, search: true }} onClear={vi.fn()} />)
    expect(screen.getByText('Clear filters')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('hides entirely when no filters are active', () => {
    const { container } = render(<ClearFiltersButton filters={{ type: false, search: false }} onClear={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('counts only the active filters', () => {
    render(<ClearFiltersButton filters={{ type: false, status: true, category: false, search: true }} onClear={vi.fn()} />)
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('calls onClear when clicked', () => {
    const onClear = vi.fn()
    render(<ClearFiltersButton filters={{ type: true }} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('applies the standard sizing classes by default', () => {
    render(<ClearFiltersButton filters={{ type: true }} onClear={vi.fn()} />)
    const button = screen.getByRole('button')
    expect(button.className).toContain('text-sm')
    expect(button.className).toContain('px-3')
  })

  it('applies compact sizing classes when compact is set', () => {
    render(<ClearFiltersButton filters={{ type: true }} onClear={vi.fn()} compact />)
    const button = screen.getByRole('button')
    expect(button.className).toContain('text-xs')
    expect(button.className).toContain('px-2.5')
  })

  it('appends extra classes', () => {
    render(<ClearFiltersButton filters={{ type: true }} onClear={vi.fn()} className="ml-auto" />)
    const button = screen.getByRole('button')
    expect(button.className).toContain('ml-auto')
  })
})
