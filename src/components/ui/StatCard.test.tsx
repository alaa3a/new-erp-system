// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import StatCard from './StatCard'

afterEach(() => {
  cleanup()
})

describe('StatCard', () => {
  it('renders the label and value', () => {
    render(<StatCard label="Total Sales" value="$1,234.00" />)
    expect(screen.getByText('Total Sales')).toBeTruthy()
    expect(screen.getByText('$1,234.00')).toBeTruthy()
  })

  it('renders ReactNode values (e.g. formatted currency)', () => {
    render(<StatCard label="VAT" value={<span data-testid="val">12%</span>} />)
    expect(screen.getByTestId('val').textContent).toBe('12%')
  })

  it('applies the md value classes by default', () => {
    render(<StatCard label="L" value="V" />)
    const value = screen.getByText('V')
    expect(value.className).toContain('text-lg font-semibold')
  })

  it('applies the lg value classes when size="lg"', () => {
    render(<StatCard label="L" value="V" size="lg" />)
    const value = screen.getByText('V')
    expect(value.className).toContain('text-xl font-bold')
    expect(value.className).not.toContain('text-lg font-semibold')
  })

  it('appends the color classes to the value', () => {
    render(<StatCard label="L" value="V" color="text-green-500" />)
    const value = screen.getByText('V')
    expect(value.className).toContain('text-green-500')
  })

  it('defaults the value color when none is provided', () => {
    render(<StatCard label="L" value="V" />)
    const value = screen.getByText('V')
    expect(value.className).toContain('text-gray-900 dark:text-white')
  })

  it('renders the subtext line when provided', () => {
    render(<StatCard label="L" value="V" subtext="of $2,000.00" />)
    const sub = screen.getByText('of $2,000.00')
    expect(sub.className).toContain('text-[11px]')
  })

  it('does not render a subtext line when undefined or null', () => {
    const { container: undef } = render(<StatCard label="L" value="V" />)
    const { container: nul } = render(<StatCard label="L2" value="V2" subtext={null} />)
    expect(undef.querySelectorAll('p')).toHaveLength(2) // label + value only
    expect(nul.querySelectorAll('p')).toHaveLength(2)
  })

  it('renders a zero subtext (falsy but defined)', () => {
    render(<StatCard label="L" value="V" subtext={0} />)
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('uses valueClass to fully override the value classes', () => {
    render(
      <StatCard
        label="L"
        value="V"
        valueClass="text-brand-600 dark:text-brand-400"
      />,
    )
    const value = screen.getByText('V')
    expect(value.className).toContain('text-brand-600 dark:text-brand-400')
    expect(value.className).not.toContain('text-lg font-semibold')
  })
})
