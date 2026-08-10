'use client'

import { useState, useMemo, useRef, useEffect, useCallback, type CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'

interface SearchSelectOption {
  id: number | string
  label: string
  /** Optional group header label. When present, options are rendered under a non-selectable group header. */
  groupLabel?: string
  /** When true the option is shown but cannot be selected (e.g. parent accounts). Rendered bold + muted. */
  disabled?: boolean
  /** Indentation depth for hierarchical lists (e.g. chart-of-accounts trees). */
  indent?: number
}

interface SearchSelectProps<T extends SearchSelectOption> {
  options: T[]
  value: string | number | null
  onChange: (val: string | number | null, item?: T) => void
  placeholder?: string
  noneLabel?: string
  searchPlaceholder?: string
  notFoundLabel?: string
  disabled?: boolean
}

/**
 * Searchable dropdown select. Generic over options that have an `id` and a
 * `label`. Selecting "None" clears the value (calls onChange('')). Selecting
 * an option calls onChange(id, item) so callers can read extra fields (e.g.
 * a tax rate) from the chosen item.
 *
 * Options support `disabled` (bold, non-selectable — e.g. parent accounts)
 * and `indent` (tree depth). The dropdown is rendered with `position: fixed`
 * positioned at the trigger, so it floats above EVERYTHING (including the
 * scrollable body of modals) instead of being clipped or hidden behind other
 * content. It opens upward when there is not enough room below, and it stays
 * glued to the trigger while the page scrolls or resizes.
 */
export default function SearchSelect<T extends SearchSelectOption>({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  noneLabel = 'None',
  searchPlaceholder = 'Type to search...',
  notFoundLabel = 'No results found',
  disabled = false,
}: SearchSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const [flipUp, setFlipUp] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase()
    return options.filter(o => o.label.toLowerCase().includes(q))
  }, [options, search])

  const selectedLabel = value !== null && value !== '' && value !== undefined
    ? options.find(o => o.id === value)?.label || placeholder
    : ''

  // Group options by groupLabel (options without a groupLabel come first, in order)
  const grouped = useMemo(() => {
    const byGroup = new Map<string | null, T[]>()
    for (const o of filtered) {
      const key = o.groupLabel || null
      if (!byGroup.has(key)) byGroup.set(key, [])
      byGroup.get(key)!.push(o)
    }
    return Array.from(byGroup.entries()).map(([group, items]) => ({ group, items }))
  }, [filtered])

  // Measure the trigger and pin the panel to it with position:fixed. Fixed
  // positioning escapes overflow clipping, so the list can never be cut off by
  // a scrollable container (modal body) or hidden behind sibling content.
  // NOTE: fixed positioning is relative to the viewport only while no ancestor
  // has a transform/filter/will-change/backdrop-filter — keep those off the
  // modal content wrapper.
  const positionPanel = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    // Flip upward when there is not enough room below the trigger.
    const up = spaceBelow < 280 && spaceAbove > spaceBelow
    setFlipUp(up)
    const width = Math.max(rect.width, 224)
    let left = rect.left
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8)
    setPanelStyle({
      position: 'fixed',
      top: up ? undefined : rect.bottom + 4,
      bottom: up ? window.innerHeight - rect.top + 4 : undefined,
      left,
      width,
      zIndex: 50,
    })
  }, [])

  // Keep the panel glued to its trigger while scrolling or resizing.
  useEffect(() => {
    if (!open) return
    let raf = 0
    const handle = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(positionPanel)
    }
    window.addEventListener('scroll', handle, true)
    window.addEventListener('resize', handle)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', handle, true)
      window.removeEventListener('resize', handle)
    }
  }, [open, positionPanel])

  return (
    <div className="relative">
      <div
        ref={triggerRef}
        onClick={() => {
          if (disabled) return
          if (!open) {
            // Position at open time so the panel is pinned before it renders.
            positionPanel()
            setSearch('')
          }
          setOpen(!open)
        }}
        className={`w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm cursor-pointer flex items-center justify-between gap-2 hover:border-gray-300 dark:hover:border-gray-600 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {value ? (
          <span className="text-gray-900 dark:text-white truncate">{selectedLabel}</span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">{placeholder}</span>
        )}
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            style={panelStyle ?? undefined}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl"
          >
            <div className="p-2 border-b border-gray-100 dark:border-gray-700">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                autoFocus
                className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <div className={`${flipUp ? 'max-h-56' : 'max-h-64'} overflow-y-auto py-1 custom-scrollbar rounded-b-xl`}>
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >{noneLabel}</button>
              {grouped.map((g, gi) => (
                <div key={gi}>
                  {g.group && (
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      {g.group}
                    </p>
                  )}
                  {g.items.map(o => {
                    const indentStyle = { paddingLeft: `${(o.indent || 0) * 18 + 12}px` }
                    if (o.disabled) {
                      // Non-selectable row (e.g. parent account) — bold + muted.
                      return (
                        <div
                          key={o.id}
                          style={indentStyle}
                          aria-disabled="true"
                          className="w-full text-left px-3 py-1.5 text-sm font-semibold text-gray-400 dark:text-gray-500 bg-gray-50/60 dark:bg-gray-800/30 cursor-default truncate"
                        >{o.label}</div>
                      )
                    }
                    return (
                      <button
                        key={o.id}
                        type="button"
                        style={indentStyle}
                        onClick={() => { onChange(o.id, o); setOpen(false) }}
                        className={`w-full text-left px-3 py-1.5 text-sm font-normal transition-colors truncate ${
                          value === o.id
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-400 font-medium'
                            : 'text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                      >{o.label}</button>
                    )
                  })}
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">{notFoundLabel}</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
