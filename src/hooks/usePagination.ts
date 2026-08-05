'use client'

import { useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Shared pagination state for list pages.
 *
 * Reads `page` / `pageSize` from the URL query params and exposes a
 * `setFilterAndResetPage` helper for filter controls: changing a filter can
 * shrink the result set, so the helper first rewrites the URL back to
 * `page=1` (preserving all other params) via `router.replace` before applying
 * the new value — users never land on an out-of-range page after filtering.
 */
export function usePagination() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10)

  const setFilterAndResetPage = useCallback(
    <T extends string>(setter: (v: T) => void, value: T) => {
      if (page > 1) {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', '1')
        router.replace(`?${params.toString()}`)
      }
      setter(value)
    },
    [page, router, searchParams],
  )

  return { page, pageSize, setFilterAndResetPage }
}
