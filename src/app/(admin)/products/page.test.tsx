// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/toast/ToastProvider'
import ProductsPage from './page'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const stcProfile = {
  id: 5, code: 'STC', name: 'Standard product', description: '',
  salesVatCodeId: null, purchaseVatCodeId: null,
  salesAccountId: null, purchaseAccountId: null, inventoryAccountId: null, cogsAccountId: null,
  arAccountId: null, apAccountId: null, cashAccountId: null, discountAccountId: null,
}

const products = [
  {
    id: 108, code: '02', name: 'products', description: '', itemType: 'stock', unitOfMeasure: 'pcs',
    salesPrice: 0, purchasePrice: 0, vatCodeId: null, purchaseVatCodeId: null, defaultWarehouseId: null,
    reorderPoint: 0, isActive: true, parentId: null, isCategory: true, profileId: null, version: 1,
  },
  {
    id: 109, code: '0201', name: 'aaaaa', description: '', itemType: 'stock', unitOfMeasure: 'pcs',
    salesPrice: 1000, purchasePrice: 500, vatCodeId: null, purchaseVatCodeId: null, defaultWarehouseId: null,
    reorderPoint: 0, isActive: true, parentId: 108, isCategory: false, profileId: 5, version: 1,
  },
  {
    id: 110, code: '0202', name: 'aaaa2222', description: '', itemType: 'stock', unitOfMeasure: 'pcs',
    salesPrice: 1000, purchasePrice: 500, vatCodeId: null, purchaseVatCodeId: null, defaultWarehouseId: null,
    reorderPoint: 0, isActive: true, parentId: 108, isCategory: false, profileId: null, version: 1,
  },
]

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response
}

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/products?all=true') return jsonResponse({ success: true, data: products })
    if (url === '/api/products/profiles') return jsonResponse({ success: true, data: [stcProfile] })
    if (url === '/api/products/profiles/5') return jsonResponse({ success: true, data: stcProfile })
    if (url === '/api/warehouses') return jsonResponse({ success: true, data: [] })
    if (url === '/api/tax-codes') return jsonResponse({ success: true, data: [] })
    if (url === '/api/accounts') return jsonResponse({ success: true, data: [] })
    if (url === '/api/cost-centers') return jsonResponse({ success: true, data: [] })
    if (url === '/api/inventory/reorder-check') return jsonResponse({ success: true, data: [] })
    return jsonResponse({ success: false })
  }))
}

describe('ProductsPage — edit product with linked profile', () => {
  it('shows the linked profile in the selector when editing a product that has one', async () => {
    stubFetch()
    render(<ToastProvider><ProductsPage /></ToastProvider>)

    // Group row (children collapsed by default) -> expand to reveal products.
    const groupName = await screen.findByText('products')
    fireEvent.click(groupName)

    const productName = await screen.findByText('aaaaa')
    const row = productName.closest('tr')!
    fireEvent.click(within(row).getByTitle('More actions'))

    fireEvent.click(await screen.findByText('Edit'))

    await screen.findByText('Edit Product')
    await waitFor(() => {
      expect(screen.getByText(/STC - Standard product/)).toBeTruthy()
    })
  })

  it('shows the placeholder when editing a product with no linked profile', async () => {
    stubFetch()
    render(<ToastProvider><ProductsPage /></ToastProvider>)

    const groupName = await screen.findByText('products')
    fireEvent.click(groupName)

    const productName = await screen.findByText('aaaa2222')
    const row = productName.closest('tr')!
    fireEvent.click(within(row).getByTitle('More actions'))

    fireEvent.click(await screen.findByText('Edit'))

    await screen.findByText('Edit Product')
    await waitFor(() => {
      expect(screen.getByText('Select a profile...')).toBeTruthy()
    })
  })

  it('shows the linked profile even when it is inactive (fix for "looks unlinked")', async () => {
    // Mirror real DB state: STD (id 1) is isActive=0, so /api/products/profiles
    // (active-only) does not return it, but the product still references it.
    const productsWithInactiveProfile = products.map(p =>
      p.id === 109 ? { ...p, profileId: 1 } : p,
    )
    const stdProfile = { ...stcProfile, id: 1, code: 'STD', name: 'Standard Product', isActive: 0 }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/products?all=true') return jsonResponse({ success: true, data: productsWithInactiveProfile })
      if (url === '/api/products/profiles') return jsonResponse({ success: true, data: [] })
      if (url === '/api/products/profiles/1') return jsonResponse({ success: true, data: stdProfile })
      if (url === '/api/warehouses') return jsonResponse({ success: true, data: [] })
      if (url === '/api/tax-codes') return jsonResponse({ success: true, data: [] })
      if (url === '/api/accounts') return jsonResponse({ success: true, data: [] })
      if (url === '/api/cost-centers') return jsonResponse({ success: true, data: [] })
      if (url === '/api/inventory/reorder-check') return jsonResponse({ success: true, data: [] })
      return jsonResponse({ success: false })
    }))

    render(<ToastProvider><ProductsPage /></ToastProvider>)

    const groupName = await screen.findByText('products')
    fireEvent.click(groupName)

    const productName = await screen.findByText('aaaaa')
    const row = productName.closest('tr')!
    fireEvent.click(within(row).getByTitle('More actions'))

    fireEvent.click(await screen.findByText('Edit'))

    await screen.findByText('Edit Product')
    // Product IS linked to a profile — it must show it, not the placeholder.
    await waitFor(() => {
      expect(screen.queryByText(/STD - Standard Product/)).toBeTruthy()
    })
    expect(screen.queryByText('Select a profile...')).toBeNull()
  })
})
