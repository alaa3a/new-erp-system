// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ModalHeader from './ModalHeader'

afterEach(() => {
  cleanup()
})

describe('ModalHeader', () => {
  it('renders the title in a heading', () => {
    render(<ModalHeader title="New Invoice" />)
    const heading = screen.getByRole('heading', { name: 'New Invoice' })
    expect(heading.tagName).toBe('H3')
  })

  it('renders a dynamic title built from state', () => {
    const number = 'INV-1001'
    render(<ModalHeader title={`Edit ${number}`} />)
    expect(screen.getByText('Edit INV-1001')).toBeTruthy()
  })

  it('renders the subtitle below the title when provided', () => {
    render(<ModalHeader title="Posting Preview" subtitle="INV-1001 — Acme Corp" />)
    expect(screen.getByText('INV-1001 — Acme Corp')).toBeTruthy()
  })

  it('does not render a subtitle when omitted', () => {
    render(<ModalHeader title="New Invoice" />)
    expect(screen.queryByText('INV-1001 — Acme Corp')).toBeNull()
  })

  it('renders no close button when onClose is not provided', () => {
    render(<ModalHeader title="New Invoice" />)
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('renders a close button and fires onClose when clicked', () => {
    const onClose = vi.fn()
    render(<ModalHeader title="New Invoice" onClose={onClose} />)
    const btn = screen.getByRole('button', { name: 'Close' })
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders the leading icon block when provided', () => {
    const icon = <span data-testid="icon">A</span>
    render(<ModalHeader title="Audit Log Detail" icon={icon} />)
    expect(screen.getByTestId('icon')).toBeTruthy()
  })

  it('renders children (e.g. a status badge) inside the title area', () => {
    render(
      <ModalHeader title="Invoice INV-1001">
        <span>Paid</span>
      </ModalHeader>,
    )
    expect(screen.getByText('Paid')).toBeTruthy()
  })

  it('combines icon, title, subtitle and close button together', () => {
    const onClose = vi.fn()
    const icon = <span data-testid="icon">A</span>
    render(
      <ModalHeader title="Detail" subtitle="sub" icon={icon} onClose={onClose}>
        <span>badge</span>
      </ModalHeader>,
    )
    expect(screen.getByRole('heading', { name: 'Detail' })).toBeTruthy()
    expect(screen.getByText('sub')).toBeTruthy()
    expect(screen.getByTestId('icon')).toBeTruthy()
    expect(screen.getByText('badge')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })
})
