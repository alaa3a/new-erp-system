// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { ProfileSelector } from './ProfileSelector'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stcProfile() {
  return {
    id: 5, code: 'STC', name: 'Standard product', description: '', isActive: 1,
    salesVatCodeId: null, purchaseVatCodeId: null,
    salesAccountId: null, purchaseAccountId: null, inventoryAccountId: null, cogsAccountId: null,
    arAccountId: null, apAccountId: null, cashAccountId: null, discountAccountId: null,
  }
}

function stdProfile() {
  return {
    id: 1, code: 'STD', name: 'Standard Product', description: '', isActive: 0,
    salesVatCodeId: null, purchaseVatCodeId: null,
    salesAccountId: null, purchaseAccountId: null, inventoryAccountId: null, cogsAccountId: null,
    arAccountId: null, apAccountId: null, cashAccountId: null, discountAccountId: null,
  }
}

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response
}

describe('ProfileSelector', () => {
  it('shows the selected profile label when value matches an active profile', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: [stcProfile()] })))
    render(<ProfileSelector value={5} onChange={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/STC - Standard product/)).toBeTruthy()
    })
  })

  it('shows a linked inactive profile (with an inactive marker) instead of the placeholder', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/products/profiles/1') return jsonResponse({ success: true, data: stdProfile() })
      // Active-only list does not include the soft-deleted STD profile.
      return jsonResponse({ success: true, data: [] })
    }))
    render(<ProfileSelector value={1} onChange={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/STD - Standard Product \(inactive\)/)).toBeTruthy()
    })
  })

  it('shows placeholder when value does not match any fetched profile', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/products/profiles/')) return jsonResponse({ success: false })
      return jsonResponse({ success: true, data: [] })
    }))
    render(<ProfileSelector value={999} onChange={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Select a profile...')).toBeTruthy()
    })
  })
})
