// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/toast/ToastProvider'
import PurchasePage from './page'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const vendor = {
  id: 1, code: 'VEN1', name: 'Vendor One', type: 'vendor', status: 'active',
  contactPerson: '', email: '', phone: '', address: '', city: '', country: '',
  taxRegistrationNumber: '', creditLimit: 0, paymentTermId: null, tags: [],
}

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response
}

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/invoices')) {
      return jsonResponse({ success: true, data: [], total: 0, page: 1, pageSize: 20 })
    }
    if (url === '/api/partners') return jsonResponse({ success: true, data: [vendor] })
    if (url === '/api/products') return jsonResponse({ success: true, data: [] })
    if (url === '/api/tax-codes') return jsonResponse({ success: true, data: [] })
    if (url === '/api/posting-profiles') return jsonResponse({ success: true, data: [] })
    if (url === '/api/warehouses') return jsonResponse({ success: true, data: [] })
    return jsonResponse({ success: false })
  }))
}

describe('Purchase invoices page — reference data loading', () => {
  it('loads partners from the wrapped API response and surfaces them in the vendor picker', async () => {
    stubFetch()
    render(<ToastProvider><PurchasePage /></ToastProvider>)

    // Page must survive rendering after the wrapped responses are consumed.
    await screen.findByText('Purchase Invoices')

    // Open the add-invoice modal and pick a vendor — proves partners became an array.
    fireEvent.click(screen.getByText('New Purchase'))
    await screen.findByText('New Purchase Invoice')

    fireEvent.click(screen.getByText('Select vendor...'))
    await waitFor(() => {
      expect(screen.getByText(/Vendor One/)).toBeTruthy()
    })
  })
})
