// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import StatusBadge from './StatusBadge'

afterEach(() => {
  cleanup()
})

describe('StatusBadge', () => {
  it('renders the label', () => {
    render(<StatusBadge label="Posted" />)
    expect(screen.getByText('Posted')).toBeTruthy()
  })

  it('renders ReactNode labels (e.g. an element with children)', () => {
    render(<StatusBadge label={<span>Paid</span>} />)
    expect(screen.getByText('Paid')).toBeTruthy()
  })

  it('defaults to the md size (px-2 py-1)', () => {
    render(<StatusBadge label="Draft" />)
    const badge = screen.getByText('Draft')
    expect(badge.className).toContain('px-2 py-1')
    expect(badge.className).not.toContain('px-2 py-0.5')
  })

  it('uses the sm size (px-2 py-0.5) when size="sm"', () => {
    render(<StatusBadge label="Active" size="sm" />)
    const badge = screen.getByText('Active')
    expect(badge.className).toContain('px-2 py-0.5')
    expect(badge.className).not.toContain('px-2 py-1')
  })

  it('applies the resolved color classes', () => {
    const color = 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400'
    render(<StatusBadge label="Paid" color={color} />)
    const badge = screen.getByText('Paid')
    expect(badge.className).toContain('bg-green-50')
    expect(badge.className).toContain('dark:text-green-400')
  })

  it('appends extra classes via className (e.g. shrink-0, mt-1)', () => {
    render(<StatusBadge label="Active" size="sm" className="shrink-0 mt-1" />)
    const badge = screen.getByText('Active')
    expect(badge.className).toContain('shrink-0')
    expect(badge.className).toContain('mt-1')
  })

  it('keeps the base badge classes for every variant', () => {
    render(<StatusBadge label="X" className="extra" />)
    expect(screen.getByText('X').className).toContain('inline-flex text-xs font-medium rounded-full')
  })

  it('does not leave stray whitespace in the class list when no extras are given', () => {
    render(<StatusBadge label="X" />)
    expect(screen.getByText('X').className).not.toMatch(/\s\s/)
  })
})
