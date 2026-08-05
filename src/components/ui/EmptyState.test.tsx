// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import EmptyState from './EmptyState'

afterEach(() => {
  cleanup()
})

describe('EmptyState', () => {
  it('renders the title message', () => {
    render(<EmptyState title="No invoices found" />)
    expect(screen.getByText('No invoices found')).toBeTruthy()
  })

  it('renders the icon when provided', () => {
    render(<EmptyState title="Loading..." icon={<span data-testid="icon" />} />)
    expect(screen.getByTestId('icon')).toBeTruthy()
  })

  it('renders the description when provided', () => {
    render(<EmptyState title="No partners" description="Create one to get started." />)
    expect(screen.getByText('Create one to get started.')).toBeTruthy()
  })

  it('renders the action element when provided and fires it on click', () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        title="Something went wrong"
        action={<button onClick={onClick}>Try again</button>}
      />,
    )
    const btn = screen.getByRole('button', { name: 'Try again' })
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('uses the flex column layout by default (full-page variant)', () => {
    render(<EmptyState title="No data" />)
    const wrapper = screen.getByText('No data').parentElement as HTMLElement
    expect(wrapper.className).toContain('flex flex-col items-center justify-center py-16')
  })

  it('uses the compact table-cell layout when compact is set', () => {
    render(<EmptyState title="No rows" compact />)
    const wrapper = screen.getByText('No rows').parentElement as HTMLElement
    expect(wrapper.className).toContain('py-10 text-center')
    expect(wrapper.className).not.toContain('flex flex-col')
  })

  it('appends extra classes to the wrapper', () => {
    render(<EmptyState title="No data" className="rounded-2xl border" />)
    const wrapper = screen.getByText('No data').parentElement as HTMLElement
    expect(wrapper.className).toContain('rounded-2xl border')
  })

  it('renders a red-tinted title span for error states', () => {
    render(
      <EmptyState
        title={<span className="text-red-600 dark:text-red-400">Failed to load</span>}
      />,
    )
    const title = screen.getByText('Failed to load')
    expect(title.className).toContain('text-red-600 dark:text-red-400')
  })
})
