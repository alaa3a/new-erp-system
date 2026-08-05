// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { ToastProvider, useToast } from './ToastProvider'

/** Buttons wired to each toast variant so tests can trigger pushes. */
function Harness() {
  const toast = useToast()
  return (
    <div>
      <button onClick={() => toast.success('Saved successfully')}>success</button>
      <button onClick={() => toast.error('Something went wrong')}>error</button>
      <button onClick={() => toast.info('Heads up')}>info</button>
    </div>
  )
}

/** Pushes a success toast with an action button (e.g. Undo). */
function UndoHarness({ onUndo }: { onUndo: () => void }) {
  const toast = useToast()
  return (
    <button
      onClick={() =>
        toast.success('Deleted record', { action: { label: 'Undo', onClick: onUndo } })
      }
    >
      fire
    </button>
  )
}

// ── FLIP helper ──────────────────────────────────────────────────────────────
// jsdom reports offsetTop = 0 for every element, so FLIP deltas would always be
// 0 and the park/glide logic would never run. Stub it with a deterministic
// value (100px per sibling index) to exercise the FLIP effect without a real
// layout engine.
const ORIGINAL_OFFSET_TOP = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop')

function mockOffsetTop() {
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      const parent = this.parentElement
      if (!parent) return 0
      return Array.from(parent.children).indexOf(this) * 100
    },
  })
}

function restoreOffsetTop() {
  if (ORIGINAL_OFFSET_TOP) {
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', ORIGINAL_OFFSET_TOP)
  } else {
    delete (HTMLElement.prototype as { offsetTop?: unknown }).offsetTop
  }
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    restoreOffsetTop()
  })

  it('throws when useToast is used outside the provider', () => {
    function Broken() {
      useToast()
      return null
    }
    expect(() => render(<Broken />)).toThrow(/ToastProvider/)
  })

  it('renders pushed toasts with the correct live-region role', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('success'))
    fireEvent.click(screen.getByText('info'))
    fireEvent.click(screen.getByText('error'))

    // success + info → role="status" (polite); error → role="alert" (assertive)
    expect(screen.getAllByRole('status')).toHaveLength(2)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('stagger-cascades toasts pushed in the same burst', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('success'))
    fireEvent.click(screen.getByText('success'))

    const toasts = screen.getAllByRole('status')
    expect(toasts).toHaveLength(2)
    // First toast of the burst has no delay; the second gets the 70ms stagger.
    expect(toasts[0].style.animationDelay).toBe('')
    expect(toasts[1].style.animationDelay).toBe('70ms')
  })

  it('auto-dismisses success toasts after their duration', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('success'))
    expect(screen.getByText('Saved successfully')).toBeTruthy()

    // Just before the 3500ms duration the toast is still present…
    act(() => {
      vi.advanceTimersByTime(3499)
    })
    expect(screen.getByText('Saved successfully')).toBeTruthy()

    // …the timer fires (leaving state) and the exit animation completes.
    act(() => {
      vi.advanceTimersByTime(1)
    })
    act(() => {
      vi.advanceTimersByTime(260)
    })
    expect(screen.queryByText('Saved successfully')).toBeNull()
  })

  it('keeps error toasts until manually dismissed', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('error'))
    expect(screen.getByText('Something went wrong')).toBeTruthy()

    // Errors never auto-dismiss.
    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(screen.getByText('Something went wrong')).toBeTruthy()

    // Manual dismissal via the X button.
    fireEvent.click(screen.getByLabelText('Dismiss notification'))
    act(() => {
      vi.advanceTimersByTime(260)
    })
    expect(screen.queryByText('Something went wrong')).toBeNull()
  })

  it('fires the undo action and dismisses the toast', () => {
    const onUndo = vi.fn()
    render(
      <ToastProvider>
        <UndoHarness onUndo={onUndo} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('fire'))
    fireEvent.click(screen.getByText('Undo'))

    expect(onUndo).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(260)
    })
    expect(screen.queryByText('Deleted record')).toBeNull()
  })

  it('queues overflow toasts behind a +N more pill and expands on click', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByText('success'))
    }

    // Only the 4 newest are visible; the 2 oldest wait behind the pill.
    expect(screen.getAllByRole('status')).toHaveLength(4)
    expect(screen.getByText('+2 more')).toBeTruthy()

    // Expanding reveals all 6 and switches the pill to "Show less".
    fireEvent.click(screen.getByText('+2 more'))
    expect(screen.getAllByRole('status')).toHaveLength(6)
    expect(screen.getByText('Show less')).toBeTruthy()
  })

  it('applies FLIP transitions to remaining toasts when one is dismissed', () => {
    mockOffsetTop()
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('success')) // toast A (top)
    fireEvent.click(screen.getByText('success')) // toast B
    fireEvent.click(screen.getByText('success')) // toast C (bottom)

    const before = screen.getAllByRole('status')
    expect(before).toHaveLength(3)
    // No FLIP on the initial pushes (nothing moved yet).
    before.forEach(t => expect(t.style.transition).toBe(''))

    // Dismiss the top toast — the remaining two must glide up (FLIP park/play).
    fireEvent.click(before[0].querySelector('[aria-label="Dismiss notification"]') as Element)
    act(() => {
      vi.advanceTimersByTime(260)
    })

    const after = screen.getAllByRole('status')
    expect(after).toHaveLength(2)
    after.forEach(t => {
      expect(t.style.transition).toBe('transform 0.25s ease')
      expect(t.style.transform).toBe('translateY(0)')
    })
  })
})
