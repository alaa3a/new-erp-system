'use client'

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  type: ToastType
  message: string
  leaving: boolean
  action?: { label: string; onClick: () => void }
  duration: number
  /** Entrance delay (ms) used to cascade toasts that arrive in the same burst. */
  stagger: number
}

interface ToastOptions {
  action?: { label: string; onClick: () => void }
  duration?: number
}

interface ToastContextValue {
  success: (message: string, options?: ToastOptions) => void
  error: (message: string, options?: ToastOptions) => void
  info: (message: string, options?: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>')
  return ctx
}

let toastId = 0

const AUTO_DISMISS_MS = 3500
const EXIT_MS = 260 // Must exceed the 0.25s toastOut animation so the slide-out completes

// Rapid pushes (within this window) are treated as one burst and cascade in
// one after another instead of appearing all at once.
const BURST_WINDOW_MS = 200
const STAGGER_MS = 70
const MAX_STAGGER_STEP = 3

// Only this many toasts are visible at once; older ones wait in the queue
// behind a compact "+N more" pill and surface as space frees up.
const MAX_VISIBLE_TOASTS = 4
// Hard cap on the total queued toasts (visible + hidden). The absolute oldest
// beyond this are discarded entirely — their auto-dismiss timers are pruned.
const MAX_QUEUE_TOASTS = 20

const toastStyles: Record<
  ToastType,
  { container: string; text: string; progress: string; iconWrap: string; icon: string }
> = {
  success: {
    container:
      'border-success-200 dark:border-success-800 bg-success-50 dark:bg-success-950/30',
    text: 'text-success-700 dark:text-success-400',
    progress: 'bg-success-500',
    iconWrap: 'bg-success-100 dark:bg-success-500/20',
    icon: 'text-success-600 dark:text-success-400',
  },
  error: {
    container: 'border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-950/30',
    text: 'text-error-700 dark:text-error-400',
    progress: 'bg-error-500',
    iconWrap: 'bg-error-100 dark:bg-error-500/20',
    icon: 'text-error-600 dark:text-error-400',
  },
  info: {
    container: 'border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/30',
    text: 'text-brand-700 dark:text-brand-400',
    progress: 'bg-brand-500',
    iconWrap: 'bg-brand-100 dark:bg-brand-500/20',
    icon: 'text-brand-600 dark:text-brand-400',
  },
}

const ToastIcon = ({ type }: { type: ToastType }) => {
  const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? AlertCircle : Info
  return (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-full ${toastStyles[type].iconWrap}`}
    >
      <Icon className={`size-3.5 ${toastStyles[type].icon}`} />
    </span>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  // Whether the overflow queue is expanded to show every queued toast.
  const [expanded, setExpanded] = useState(false)
  const timersRef = useRef<
    Map<number, { timeoutId: number; remaining: number; start: number; paused: boolean; queued: boolean }>
  >(new Map())

  // Only the newest MAX_VISIBLE_TOASTS are rendered at once; older ones wait
  // behind a "+N more" pill. The stack can be expanded to show everything.
  const visibleToasts = useMemo(
    () => (expanded ? toasts : toasts.slice(-MAX_VISIBLE_TOASTS)),
    [toasts, expanded],
  )
  // Queued toasts that will actually surface (leaving ones are about to be removed).
  const hiddenCount = toasts.filter(
    t => !t.leaving && !visibleToasts.some(v => v.id === t.id),
  ).length

  // FLIP animation: remember each toast's previous vertical position so that
  // when the stack changes (new toast, dismissed toast, overflow drop) the
  // remaining toasts slide to their new spot instead of snapping instantly.
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const prevPositions = useRef<Map<number, number>>(new Map())

  // Burst detection for cascade staggering: remember the last push time and how
  // many toasts have already been pushed in the current burst.
  const lastPushRef = useRef(0)
  const burstIndexRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    // Stop any pending auto-dismiss timer for this toast.
    const t = timersRef.current.get(id)
    if (t) {
      clearTimeout(t.timeoutId)
      timersRef.current.delete(id)
    }
    // Play the slide-out animation, then remove it from the stack.
    setToasts(prev =>
      prev.some(x => x.id === id && x.leaving)
        ? prev
        : prev.map(x => (x.id === id ? { ...x, leaving: true } : x)),
    )
    setTimeout(() => {
      setToasts(prev => prev.filter(x => x.id !== id))
    }, EXIT_MS)
  }, [])

  const armAutoDismiss = useCallback(
    (id: number, ms: number) => {
      const timeoutId = window.setTimeout(() => dismiss(id), ms)
      timersRef.current.set(id, { timeoutId, remaining: ms, start: Date.now(), paused: false, queued: false })
    },
    [dismiss],
  )

  // Pause the auto-dismiss countdown (used on hover so users can read long
  // messages, and while a toast is queued behind the "+N more" pill).
  const pauseAutoDismiss = useCallback((id: number) => {
    const t = timersRef.current.get(id)
    if (!t || t.paused) return
    clearTimeout(t.timeoutId)
    t.remaining = Math.max(0, t.remaining - (Date.now() - t.start))
    t.start = Date.now()
    t.paused = true
  }, [])

  const resumeAutoDismiss = useCallback(
    (id: number) => {
      const t = timersRef.current.get(id)
      if (!t) return
      if (!t.paused && !t.queued) return
      if (t.remaining <= 0) {
        dismiss(id)
        return
      }
      const timeoutId = window.setTimeout(() => dismiss(id), t.remaining)
      t.timeoutId = timeoutId
      t.start = Date.now()
      t.paused = false
      t.queued = false
    },
    [dismiss],
  )

  const push = useCallback(
    (type: ToastType, message: string, options?: ToastOptions) => {
      const id = ++toastId
      const duration = options?.duration ?? AUTO_DISMISS_MS
      // Cascade toasts that arrive in the same burst: each subsequent push gets
      // a slightly longer entrance delay so they slide in one after another.
      const now = Date.now()
      const inBurst = now - lastPushRef.current < BURST_WINDOW_MS
      burstIndexRef.current = inBurst
        ? Math.min(burstIndexRef.current + 1, MAX_STAGGER_STEP)
        : 0
      lastPushRef.current = now
      const stagger = burstIndexRef.current * STAGGER_MS
      // Cap the total queue. Toasts pushed into an already-full visible stack
      // wait behind the "+N more" pill (countdown paused) instead of being
      // dropped — only the absolute oldest beyond MAX_QUEUE_TOASTS are dropped.
      setToasts(prev => {
        // Queued toasts surface later, so skip the burst stagger for them
        // (it would delay their entrance once they become visible).
        const willBeQueued = prev.length >= MAX_VISIBLE_TOASTS
        return [
          ...prev.slice(-(MAX_QUEUE_TOASTS - 1)),
          {
            id,
            type,
            message,
            leaving: false,
            action: options?.action,
            duration,
            stagger: willBeQueued ? 0 : stagger,
          },
        ]
      })
      // Errors stay until manually dismissed; success/info auto-dismiss.
      if (type !== 'error') armAutoDismiss(id, duration)
    },
    [armAutoDismiss],
  )

  // Prune timers for toasts that were dropped from the stack (keeps the state updater pure).
  useEffect(() => {
    const ids = new Set(toasts.map(t => t.id))
    timersRef.current.forEach((t, id) => {
      if (!ids.has(id)) {
        clearTimeout(t.timeoutId)
        timersRef.current.delete(id)
      }
    })
  }, [toasts])

  // Pause the countdown of toasts hidden behind the "+N more" pill so they get
  // their full duration once they surface, and resume as soon as they're visible.
  useEffect(() => {
    const visibleIds = new Set(visibleToasts.map(t => t.id))
    toasts.forEach(t => {
      if (t.type === 'error' || t.leaving) return
      const entry = timersRef.current.get(t.id)
      if (!entry) return
      if (visibleIds.has(t.id) && entry.queued) resumeAutoDismiss(t.id)
      else if (!visibleIds.has(t.id) && !entry.queued) {
        entry.queued = true
        pauseAutoDismiss(t.id)
      }
    })
  }, [toasts, visibleToasts, resumeAutoDismiss, pauseAutoDismiss])

  // Collapse the expanded queue once it has drained back to a single stack.
  useEffect(() => {
    if (toasts.length <= MAX_VISIBLE_TOASTS) setExpanded(false)
  }, [toasts])

  // FLIP (First-Last-Invert-Play) for smooth repositioning of the toast stack.
  useLayoutEffect(() => {
    // 1. Measure the new positions after this render (visible toasts only —
    //    queued ones aren't rendered, so they're simply not measured and their
    //    old entries are dropped when we store the new positions below). We use
    //    offsetTop (relative to the fixed container) instead of
    //    getBoundingClientRect().top because the latter is transform-inclusive:
    //    a staggered toast mid-entrance would otherwise skew its stored
    //    position and cause a ghost re-animation later.
    const newPositions = new Map<number, number>()
    visibleToasts.forEach(t => {
      const el = itemRefs.current.get(t.id)
      if (el) newPositions.set(t.id, el.offsetTop)
    })

    // 2. For every toast that existed before, animate from old to new spot.
    visibleToasts.forEach(t => {
      const el = itemRefs.current.get(t.id)
      const prev = prevPositions.current.get(t.id)
      const next = newPositions.get(t.id)
      if (!el || prev === undefined || next === undefined) return
      const dy = prev - next
      if (dy === 0) return
      // Invert: park the element at its old spot with transitions disabled.
      el.style.transition = 'none'
      el.style.transform = `translateY(${dy}px)`
      void el.offsetHeight // force a reflow so the parked transform applies
      // Play: let it glide back to its natural position.
      el.style.transition = 'transform 0.25s ease'
      el.style.transform = 'translateY(0)'
    })

    // 3. Remember the current positions for the next change.
    prevPositions.current = newPositions
  }, [visibleToasts])

  // Clear any pending timers when the provider unmounts.
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach(t => clearTimeout(t.timeoutId))
      timers.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (m, opts) => push('success', m, opts),
      error: (m, opts) => push('error', m, opts),
      info: (m, opts) => push('info', m, opts),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toaster — fixed stack in the top-right corner, above modals */}
      <div className="fixed top-4 right-4 z-[999999] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {(hiddenCount > 0 || expanded) && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="self-end rounded-full border border-gray-200 bg-white/90 px-3 py-1 text-xs font-semibold text-gray-600 shadow-theme-sm backdrop-blur transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900/90 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label={
              expanded
                ? 'Collapse notification queue'
                : `${hiddenCount} more notifications`
            }
          >
            {expanded ? 'Show less' : `+${hiddenCount} more`}
          </button>
        )}
        {visibleToasts.map(t => (
          <div
            key={t.id}
            ref={el => {
              if (el) itemRefs.current.set(t.id, el)
              else itemRefs.current.delete(t.id)
            }}
            role={t.type === 'error' ? 'alert' : 'status'}
            onMouseEnter={() => pauseAutoDismiss(t.id)}
            onMouseLeave={() => resumeAutoDismiss(t.id)}
            className={`group relative flex items-start gap-3 overflow-hidden rounded-xl border px-4 py-3 shadow-theme-lg ${toastStyles[t.type].container} ${
              t.leaving ? 'animate-toast-out' : 'animate-toast-in'
            }`}
            style={!t.leaving && t.stagger ? { animationDelay: `${t.stagger}ms` } : undefined}
          >
            <ToastIcon type={t.type} />
            <p className={`flex-1 text-sm font-medium leading-snug ${toastStyles[t.type].text}`}>
              {t.message}
            </p>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick()
                  dismiss(t.id)
                }}
                className={`shrink-0 rounded-md px-2 py-1 text-sm font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${toastStyles[t.type].text}`}
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              className={`shrink-0 rounded-md p-0.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${toastStyles[t.type].text}`}
              aria-label="Dismiss notification"
            >
              <X className="size-4" />
            </button>

            {/* Auto-dismiss countdown bar — pauses on hover, triggers dismiss when it empties */}
            {t.type !== 'error' && !t.leaving && (
              <span
                className={`absolute bottom-0 left-0 h-0.5 w-full origin-left animate-toast-progress group-hover:[animation-play-state:paused] ${toastStyles[t.type].progress}`}
                style={{ animationDuration: `${t.duration}ms` }}
                onAnimationEnd={e => {
                  if (e.animationName === 'toastProgress') dismiss(t.id)
                }}
              />
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
