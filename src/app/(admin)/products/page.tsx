'use client'
import { formatCurrency } from '@/lib/formatters'
import { ClearFiltersButton, StatusBadge, StatCard, EmptyState } from '@/components/ui'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, Suspense } from 'react'
import {
  Plus, Edit3, Trash2, AlertTriangle, Loader2, Search, Package, DollarSign, Warehouse as WarehouseIcon, Tag, Box, FolderTree,
} from 'lucide-react'
import { usePagination } from '@/hooks/usePagination'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { Pagination } from '@/components/Pagination'
import { useToast } from '@/components/ui/toast/ToastProvider'
import ProductTree from '@/components/products/ProductTree'
import { ProfileSelector } from '@/components/products/ProfileSelector'
import type { Product, ItemType, Warehouse, TaxCode } from '@/types/erp'

interface ProductTreeNode extends Product {
  children: Product[]
  childCount: number
}

const itemTypes: ItemType[] = ['stock', 'service']

const itemTypeConfig: Record<ItemType, { label: string; bg: string; text: string }> = {
  stock: { label: 'Stock Item', bg: 'bg-blue-50 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-400' },
  service: { label: 'Service', bg: 'bg-purple-50 dark:bg-purple-950/50', text: 'text-purple-700 dark:text-purple-400' },
}

interface ProductFormData {
  name: string
  description: string
  itemType: ItemType
  unitOfMeasure: string
  salesPrice: number
  purchasePrice: number
  vatCodeId: number | null
  purchaseVatCodeId: number | null
  defaultWarehouseId: number | null
  reorderPoint: number
  isActive: boolean
  parentId: number | null
  isCategory: boolean
  profileId: number | null
}

const emptyForm = (): ProductFormData => ({
  name: '', description: '', itemType: 'stock', unitOfMeasure: 'pcs',
  salesPrice: 0, purchasePrice: 0, vatCodeId: null, purchaseVatCodeId: null,
  defaultWarehouseId: null, reorderPoint: 0, isActive: true,
  parentId: null, isCategory: false, profileId: null,
})


export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /><span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading products...</span></div>}>
      <ProductsPageContent />
    </Suspense>
  )
}

function ProductsPageContent() {
  const toast = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([])
  const [categories, setCategories] = useState<Product[]>([])
  const [tree, setTree] = useState<ProductTreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lowStockIds, setLowStockIds] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [parentFilter, setParentFilter] = useState<number | null | undefined>(undefined)
  const { page, pageSize, setFilterAndResetPage } = usePagination()

  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState<ProductFormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formTouched, setFormTouched] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)

  const fetchProducts = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      if (searchQuery) params.set('search', searchQuery)
      if (typeFilter !== 'all') params.set('itemType', typeFilter)
      if (parentFilter !== undefined) params.set('parentId', String(parentFilter))
      const res = await fetch(`/api/products?${params}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json(); if (json.success) { setProducts(json.data); setTotal(json.total) }
    } catch { setError('Failed to load products.') }
    finally { setLoading(false) }
  }, [page, pageSize, searchQuery, typeFilter, parentFilter])

  const fetchRefs = useCallback(async () => {
    try {
      const [wRes, tRes, cRes] = await Promise.all([
        fetch('/api/warehouses'), fetch('/api/tax-codes'), fetch('/api/products/categories'),
      ])
      if (wRes.ok) { const wJson = await wRes.json(); if (wJson.success) setWarehouses(wJson.data) }
      if (tRes.ok) { const tJson = await tRes.json(); if (tJson.success) setTaxCodes(tJson.data) }
      if (cRes.ok) { const cJson = await cRes.json(); if (cJson.success) setCategories(cJson.data) }
    } catch { /* silent */ }
  }, [])

  const fetchTree = useCallback(async () => {
    try {
      const res = await fetch('/api/products?tree=true')
      if (res.ok) { const json = await res.json(); if (json.success) setTree(json.data) }
    } catch { /* silent */ }
  }, [])

  // Task 39 — low stock badge: fetch products below their reorder point.
  const fetchLowStock = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/reorder-check')
      if (res.ok) {
        const json = await res.json()
        if (json.success) setLowStockIds(new Set((json.data || []).map((a: any) => a.productId)))
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchProducts(); fetchRefs(); fetchTree(); fetchLowStock() }, [fetchProducts, fetchRefs, fetchTree, fetchLowStock])

  const openAddForm = () => {
    setEditingProduct(null); setFormData(emptyForm()); setFormTouched(false); setFormError(''); setShowForm(true)
  }
  const openEditForm = (p: Product) => {
    setEditingProduct(p)
    setFormData({
      name: p.name, description: p.description, itemType: p.itemType, unitOfMeasure: p.unitOfMeasure,
      salesPrice: Math.round(p.salesPrice / 100), purchasePrice: Math.round(p.purchasePrice / 100),
      vatCodeId: p.vatCodeId, purchaseVatCodeId: p.purchaseVatCodeId,
      defaultWarehouseId: p.defaultWarehouseId, reorderPoint: p.reorderPoint, isActive: p.isActive,
      parentId: p.parentId, isCategory: p.isCategory, profileId: p.profileId,
    })
    setFormTouched(false); setFormError(''); setShowForm(true)
  }

  const handleSave = async () => {
    setFormTouched(true)
    if (!formData.name.trim()) { setFormError('Name is required'); return }
    setSaving(true); setFormError('')
    try {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products'
      const method = editingProduct ? 'PUT' : 'POST'
      // Map to the API schema field names (unit/price/cost/taxCodeId/warehouseId/minStock)
      const body: any = {
        name: formData.name,
        description: formData.description,
        itemType: formData.itemType,
        unit: formData.unitOfMeasure,
        price: Math.round(formData.salesPrice * 100),
        cost: Math.round(formData.purchasePrice * 100),
        taxCodeId: formData.vatCodeId,
        purchaseVatCodeId: formData.purchaseVatCodeId,
        warehouseId: formData.defaultWarehouseId,
        minStock: formData.reorderPoint,
        isActive: formData.isActive,
        parentId: formData.parentId,
        isCategory: formData.isCategory,
      }
      if (editingProduct) body.version = editingProduct.version
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to save') }
      setShowForm(false); fetchProducts()
      toast.success(editingProduct ? `Product "${formData.name}" updated` : `Product "${formData.name}" created`)
    } catch (err: any) { setFormError(err.message); toast.error(err.message || 'Failed to save product') }
    finally { setSaving(false) }
  }

  // --- Delete (soft delete, with undo) ---
  const restoreProduct = async (product: Product) => {
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })
      if (!res.ok) throw new Error('Restore failed')
      fetchProducts()
      toast.success(`Product "${product.name}" restored`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to restore product')
      fetchProducts()
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const deleted = deleteTarget
    try {
      const res = await fetch(`/api/products/${deleted.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setDeleteTarget(null); fetchProducts()
      toast.success(`Product "${deleted.name}" deleted`, {
        action: { label: 'Undo', onClick: () => restoreProduct(deleted) },
        duration: 8000,
      })
    } catch (err: any) { setError('Failed to delete'); toast.error(err?.message || 'Failed to delete product') }
  }

  const handleTreeSelect = (id: number | null) => {
    setFilterAndResetPage(setParentFilter, id)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Products</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage stock items and services with pricing and warehouse assignment.</p>
        </div>
        <button onClick={openAddForm} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {/* Category tree sidebar */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <FolderTree className="w-4 h-4 text-brand-500" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Categories</h2>
        </div>
        <ProductTree tree={tree} selectedId={parentFilter ?? null} onSelect={handleTreeSelect} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Products', value: products.length, color: 'text-brand-500' },
          { label: 'Stock Items', value: products.filter(p => p.itemType === 'stock').length, color: 'text-blue-500' },
          { label: 'Services', value: products.filter(p => p.itemType === 'service').length, color: 'text-purple-500' },
          { label: 'Active', value: products.filter(p => p.isActive).length, color: 'text-green-500' },
        ].map(s => (
          <StatCard key={s.label} label={s.label} value={s.value} color={s.color} />
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-2.5">
        <div className="flex items-center gap-1">
          {(['all', ...itemTypes] as const).map(t => (
            <button key={t} onClick={() => setFilterAndResetPage(setTypeFilter, t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${typeFilter === t ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              {t === 'all' ? 'All' : itemTypeConfig[t].label}
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
        <select value={parentFilter ?? ''} onChange={e => setFilterAndResetPage(setParentFilter, e.target.value ? Number(e.target.value) : undefined)}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
        <div className="flex-1 min-w-0" />
         <ClearFiltersButton
          filters={{ type: typeFilter !== 'all', search: searchQuery !== '' }}
          onClear={() => {
            setFilterAndResetPage(setTypeFilter, 'all')
            setFilterAndResetPage(setSearchQuery, '')
          }}
        />
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={searchQuery} onChange={e => setFilterAndResetPage(setSearchQuery, e.target.value)} placeholder="Search products..." className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-9 pr-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
        </div>
      </div>

      {loading ? (
        <EmptyState icon={<Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />} title="Loading products..." />
      ) : error ? (
        <EmptyState icon={<AlertTriangle className="w-10 h-10 text-red-400 mb-3" />} title={<span className="text-red-600 dark:text-red-400">{error}</span>} action={<button onClick={fetchProducts} className="mt-3 text-sm font-medium text-brand-500">Try again</button>} />
      ) : products.length === 0 ? (
        <EmptyState icon={<Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />} title="No products yet" action={<button onClick={openAddForm} className="mt-2 text-sm font-medium text-brand-500"><Plus className="w-4 h-4 inline" /> Add your first product</button>} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map(p => {
              const parentCat = p.parentId ? categories.find(c => c.id === p.parentId) : null
              return (
                <div key={p.id} className={`rounded-2xl border p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ${p.isCategory ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`rounded-xl p-2.5 shrink-0 ${p.isCategory ? 'bg-amber-100 dark:bg-amber-950/50' : 'bg-brand-50 dark:bg-brand-950/30'}`}>
                        {p.isCategory ? <Box className="w-5 h-5 text-amber-600" /> : p.itemType === 'stock' ? <Box className="w-5 h-5 text-brand-500" /> : <Tag className="w-5 h-5 text-purple-500" />}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm truncate ${p.isCategory ? 'font-semibold text-gray-900 dark:text-white' : 'font-medium text-gray-900 dark:text-white'}`}>{p.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{p.code}</p>
                      </div>
                    </div>
                    {p.isCategory ? (
                      <StatusBadge label="Category" color="bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400" size="sm" className="shrink-0" />
                    ) : (
                      <StatusBadge label={itemTypeConfig[p.itemType].label} color={`${itemTypeConfig[p.itemType].bg} ${itemTypeConfig[p.itemType].text}`} size="sm" className="shrink-0" />
                    )}
                  </div>

                  {parentCat && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      in <span className="font-medium text-brand-500">{parentCat.name}</span>
                    </div>
                  )}

                  <div className="space-y-1.5 mt-3">
                    {!p.isCategory && (
                      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <DollarSign className="w-3.5 h-3.5 shrink-0" />
                        <span>Sell: <strong className="text-gray-900 dark:text-white">{formatCurrency(p.salesPrice)}</strong></span>
                        <span className="text-gray-300 dark:text-gray-600">|</span>
                        <span>Cost: <strong className="text-gray-900 dark:text-white">{formatCurrency(p.purchasePrice)}</strong></span>
                      </div>
                    )}
                    {p.itemType === 'stock' && !p.isCategory && (
                      <>
                        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <WarehouseIcon className="w-3.5 h-3.5 shrink-0" />
                          <span>Default WH: {warehouses.find(w => w.id === p.defaultWarehouseId)?.name || 'Not set'}</span>
                        </div>
                        {p.reorderPoint > 0 && (
                          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                            <AlertTriangle className="w-3 h-3 shrink-0 text-amber-500" />
                            <span>Reorder at: {p.reorderPoint} units</span>
                          </div>
                        )}
                        {lowStockIds.has(p.id) && (
                          <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span className="px-1.5 py-0.5 rounded-md bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900">Low stock</span>
                          </div>
                        )}
                      </>
                    )}
                    {p.description && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">{p.description}</p>}
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <StatusBadge label={p.isActive ? 'Active' : 'Inactive'} color={p.isActive ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400' : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'} size="sm" />
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditForm(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleteTarget(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} />
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} className="max-w-2xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{editingProduct ? 'Edit Product' : 'Add Product'}</h3>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1 custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Product Profile</label>
              <ProfileSelector
                value={formData.profileId}
                onChange={(profileId, preset) => {
                  if (preset) {
                    setFormData({
                      ...formData,
                      profileId,
                      itemType: (preset.itemType || formData.itemType) as ItemType,
                      unitOfMeasure: preset.unitOfMeasure || formData.unitOfMeasure,
                      salesPrice: preset.defaultSalesPrice || formData.salesPrice,
                      purchasePrice: preset.defaultPurchasePrice || formData.purchasePrice,
                      defaultWarehouseId: preset.defaultWarehouseId ?? formData.defaultWarehouseId,
                      vatCodeId: preset.salesVatCodeId ?? formData.vatCodeId,
                      purchaseVatCodeId: preset.purchaseVatCodeId ?? formData.purchaseVatCodeId,
                      reorderPoint: preset.reorderPoint ?? formData.reorderPoint,
                    });
                  } else {
                    setFormData({ ...formData, profileId });
                  }
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name <span className="text-red-400">*</span></label>
              <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Product name"
                className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${formTouched && !formData.name.trim() ? 'border-red-300' : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Item Type <span className="text-red-400">*</span></label>
              <select value={formData.itemType} onChange={e => setFormData({ ...formData, itemType: e.target.value as ItemType })}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                {itemTypes.map(t => <option key={t} value={t}>{itemTypeConfig[t].label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
            <textarea rows={2} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Optional description"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Parent Category</label>
              <select value={formData.parentId ?? ''} onChange={e => setFormData({ ...formData, parentId: e.target.value ? Number(e.target.value) : null })}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                <option value="">-- None (Top Level) --</option>
                {categories.filter(c => !editingProduct || c.id !== editingProduct.id).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.isCategory} onChange={e => setFormData({ ...formData, isCategory: e.target.checked })}
                  className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">This is a category</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Unit of Measure</label>
              <input type="text" value={formData.unitOfMeasure} onChange={e => setFormData({ ...formData, unitOfMeasure: e.target.value })} placeholder="pcs, kg, hrs"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Sales Price ($)</label>
              <input type="number" value={formData.salesPrice || ''} min="0" step="0.01" onChange={e => setFormData({ ...formData, salesPrice: Number(e.target.value) || 0 })}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Purchase Price ($)</label>
              <input type="number" value={formData.purchasePrice || ''} min="0" step="0.01" onChange={e => setFormData({ ...formData, purchasePrice: Number(e.target.value) || 0 })}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
            </div>
          </div>

          {formData.itemType === 'stock' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Default Warehouse</label>
                  <select value={formData.defaultWarehouseId ?? ''} onChange={e => setFormData({ ...formData, defaultWarehouseId: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                    <option value="">-- Select --</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} - {w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reorder Point (units)</label>
                  <input type="number" value={formData.reorderPoint || ''} min="0" onChange={e => setFormData({ ...formData, reorderPoint: Number(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tax Situation — Sales</label>
                  <select value={formData.vatCodeId ?? ''} onChange={e => setFormData({ ...formData, vatCodeId: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                    <option value="">-- None --</option>
                    {taxCodes.filter(t => t.isActive && !t.isGroup).map(t => <option key={t.id} value={t.id}>{t.code} ({t.rate}%)</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tax Situation — Purchase</label>
                  <select value={formData.purchaseVatCodeId ?? ''} onChange={e => setFormData({ ...formData, purchaseVatCodeId: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                    <option value="">-- None --</option>
                    {taxCodes.filter(t => t.isActive && !t.isGroup).map(t => <option key={t.id} value={t.id}>{t.code} ({t.rate}%)</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
          </label>

          {formError && <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2"><p className="text-sm text-red-600 dark:text-red-400">{formError}</p></div>}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !formData.name.trim()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : editingProduct ? 'Update Product' : 'Create Product'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} className="max-w-md p-6">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-50 dark:bg-red-950/50 p-2.5"><AlertTriangle className="w-5 h-5 text-red-500" /></div>
              <div><h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Product</h3><p className="text-sm text-gray-500 dark:text-gray-400">{deleteTarget.code}</p></div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Are you sure you want to delete <strong>{deleteTarget.name}</strong>?</p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button size="sm" onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Delete</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
