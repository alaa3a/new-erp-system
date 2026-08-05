// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import SearchInput from './SearchInput'

afterEach(() => {
  cleanup()
})

function setup(overrides: Partial<Parameters<typeof SearchInput>[0]> = {}) {
  const onChange = vi.fn()
  const utils = render(<SearchInput value="" onChange={onChange} {...overrides} />)
  return { onChange, ...utils }
}

describe('SearchInput', () => {
  it('renders a text input with the current value', () => {
    setup({ value: 'acme' })
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('acme')
    expect(input.type).toBe('text')
  })

  it('calls onChange with the new value on typing', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'inv' } })
    expect(onChange).toHaveBeenCalledWith('inv')
  })

  it('uses the default placeholder when none is provided', () => {
    setup()
    expect((screen.getByRole('textbox') as HTMLInputElement).placeholder).toBe('Search...')
  })

  it('applies a custom placeholder', () => {
    setup({ placeholder: 'Search invoices...' })
    expect((screen.getByRole('textbox') as HTMLInputElement).placeholder).toBe('Search invoices...')
  })

  it('applies the standard (non-compact) input classes by default', () => {
    setup()
    const input = screen.getByRole('textbox')
    expect(input.className).toContain('rounded-xl')
    expect(input.className).toContain('bg-white')
    expect(input.className).toContain('py-2')
  })

  it('applies the compact input classes when compact is set', () => {
    setup({ compact: true })
    const input = screen.getByRole('textbox')
    expect(input.className).toContain('rounded-lg')
    expect(input.className).toContain('bg-gray-50')
    expect(input.className).toContain('py-1.5')
    expect(input.className).not.toContain('rounded-xl')
  })

  it('appends extra classes to the wrapper', () => {
    const { container } = setup({ className: 'ml-auto max-w-xs' })
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('relative')
    expect(wrapper.className).toContain('ml-auto max-w-xs')
  })

  it('renders the search icon inside the wrapper', () => {
    const { container } = setup()
    expect(container.querySelector('svg')).toBeTruthy()
  })
})
