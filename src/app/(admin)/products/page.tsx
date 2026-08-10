'use client'
import { formatCurrency } from '@/lib/formatters'
import { ClearFiltersButton, SearchInput, StatusBadge, StatCard } from '@/components/ui'

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, Suspense } from 'react'
import {
  Plus, Edit3, Trash2, AlertTriangle, Loader2, Search, Package, Folder, FolderOpen,
  ChevronDown, ChevronRight, Power, PowerOff, Layers, MoreVertical,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { useToast } from '@/components/ui/toast/ToastProvider'
import { ProfileSelector } from '@/components/products/ProfileSelector'
import type { Product, ItemType, Warehouse, TaxCode } from '@/types/erp'

const itemTypes: ItemType[] = ['stock', 'service']

const itemTypeConfig: Record<ItemType, { label: string; bg: string; text: string }> = {
  stock: { label: 'Stock Item', bg: 'bg-blue-50 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-400' },
  service: { label: 'Service', bg: 'bg-purple-50 dark:bg-purple-950/50', text: 'text-purple-700 dark:text-purple-400' },
}

const groupConfig = { label: 'Group', bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-400' }

interface ProductFormData {
  code: string
  name: string
  description: string
  itemType: ItemType
  isCategory: boolean
  parentId: number | null
  unitOfMeasure: string
  salesPrice: number
  purchasePrice: number
  vatCodeId: number | null
  purchaseVatCodeId: number | null
  defaultWarehouseId: number | null
  reorderPoint: number
  isActive: boolean
  profileId: number | null
}

const emptyForm = (): ProductFormData => ({
  code: '', name: '', description: '', itemType: 'stock', isCategory: false, parentId: null,
  unitOfMeasure: 'pcs', salesPrice: 0, purchasePrice: 0, vatCodeId: null, purchaseVatCodeId: null,
  defaultWarehouseId: null, reorderPoint: 0, isActive: true, profileId: null,
})

/** Chart-of-accounts style code suggestion: parent code + sequence (e.g. CAT-ELEC-01). */
function generateSuggestedCode(products: Product[], parentId: number | null): string {
  if (!parentId) return ''
  const parent = products.find(p => p.id === parentId)
  if (!parent) return ''
  const siblings = products.filter(p => p.parentId === parentId)
  return `${parent.code}-${String(siblings.length + 1).padStart(2, '0')}`
}

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
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lowStockIds, setLowStockIds] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | ItemType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState<ProductFormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [parentOpen, setParentOpen] = useState(false)
  const [parentSearch, setParentSearch] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [toggleTarget, setToggleTarget] = useState<Product | null>(null)
  const [toggling, setToggling] = useState(false)
  // Floating per-row action menu (chart-of-accounts style)
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const menuBtnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const fetchProducts = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/products?all=true')
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json()
      if (json.success) setProducts(json.data)
    } catch { setError('Failed to load products.') }
    finally { setLoading(false) }
  }, [])

  const fetchRefs = useCallback(async () => {
    try {
      const [wRes, tRes] = await Promise.all([fetch('/api/warehouses'), fetch('/api/tax-codes')])
      if (wRes.ok) { const wJson = await wRes.json(); if (wJson.success) setWarehouses(wJson.data) }
      if (tRes.ok) { const tJson = await tRes.json(); if (tJson.success) setTaxCodes(tJson.data) }
    } catch { /* silent */ }
  }, [])

  // Low stock badge: products below their reorder point.
  const fetchLowStock = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/reorder-check')
      if (res.ok) {
        const json = await res.json()
        if (json.success) setLowStockIds(new Set((json.data || []).map((a: any) => a.productId)))
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchProducts(); fetchRefs(); fetchLowStock() }, [fetchProducts, fetchRefs, fetchLowStock])

  // Filtered & searched nodes (keep ancestors so the tree stays navigable)
  const filteredProducts = useMemo(() => {
    let list = products
    if (activeTab !== 'all') list = list.filter(p => p.isCategory || p.itemType === activeTab)
    if (statusFilter !== 'all') list = list.filter(p => statusFilter === 'active' ? p.isActive : !p.isActive)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const directMatches = new Set(
        list.filter(p => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).map(p => p.id),
      )
      const addAncestors = (childId: number) => {
        const p = products.find(x => x.id === childId)
        if (p?.parentId) { directMatches.add(p.parentId); addAncestors(p.parentId) }
      }
      directMatches.forEach(id => addAncestors(id))
      list = list.filter(p => directMatches.has(p.id))
    }
    return list
  }, [products, activeTab, statusFilter, searchQuery])

  const topLevel = filteredProducts.filter(p => !p.parentId)
  const getChildren = (parentId: number) => filteredProducts.filter(p => p.parentId === parentId)
  const hasChildren = (id: number) => products.some(p => p.parentId === id)

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Auto-expand ancestors while searching so matches are visible
  useEffect(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchingIds = new Set<number>()
      products.forEach(p => {
        if (p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)) matchingIds.add(p.id)
      })
      if (matchingIds.size > 0) {
        const ancestors = new Set<number>()
        const addAncestors = (childId: number) => {
          const p = products.find(x => x.id === childId)
          if (p?.parentId) { ancestors.add(p.parentId); addAncestors(p.parentId) }
        }
        matchingIds.forEach(id => addAncestors(id))
        setExpanded(prev => {
          const next = new Set(prev)
          ancestors.forEach(id => next.add(id))
          return next
        })
      }
    }
  }, [searchQuery, products])

  // --- Form openers ---
  const openAddRoot = (isCategory: boolean) => {
    setEditingProduct(null)
    setFormData({ ...emptyForm(), isCategory })
    setFormError(''); setShowForm(true)
  }

  const openAddChild = (parent: Product) => {
    setEditingProduct(null)
    setFormData({ ...emptyForm(), parentId: parent.id, code: generateSuggestedCode(products, parent.id) })
    setFormError(''); setShowForm(true)
  }

  const openEdit = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      code: product.code,
      name: product.name,
      description: product.description,
      itemType: product.itemType,
      isCategory: product.isCategory,
      parentId: product.parentId,
      unitOfMeasure: product.unitOfMeasure,
      salesPrice: Math.round(product.salesPrice / 100),
      purchasePrice: Math.round(product.purchasePrice / 100),
      vatCodeId: product.vatCodeId,
      purchaseVatCodeId: product.purchaseVatCodeId,
      defaultWarehouseId: product.defaultWarehouseId,
      reorderPoint: product.reorderPoint,
      isActive: product.isActive,
      profileId: product.profileId,
    })
    setFormError(''); setShowForm(true)
  }

  // --- Save ---
  const handleSave = async () => {
    if (!formData.name.trim()) { setFormError('Name is required'); return }
    setSaving(true); setFormError('')
    try {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products'
      const method = editingProduct ? 'PUT' : 'POST'
      const body: any = {
        code: formData.code.trim() || undefined,
        name: formData.name,
        description: formData.description,
        itemType: formData.itemType,
        isCategory: formData.isCategory,
        parentId: formData.parentId,
        isActive: formData.isActive,
      }
      if (!formData.isCategory) {
        body.unit = formData.unitOfMeasure
        body.price = Math.round(formData.salesPrice * 100)
        body.cost = Math.round(formData.purchasePrice * 100)
        body.taxCodeId = formData.vatCodeId
        body.purchaseVatCodeId = formData.purchaseVatCodeId
        body.warehouseId = formData.defaultWarehouseId
        body.minStock = formData.reorderPoint
        body.profileId = formData.profileId
      }
      if (editingProduct) body.version = editingProduct.version
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to save') }
      setShowForm(false)
      fetchProducts()
      toast.success(editingProduct
        ? `Product "${formData.name}" updated`
        : `${formData.isCategory ? 'Group' : 'Product'} "${formData.name}" created`)
    } catch (err: any) { setFormError(err.message); toast.error(err.message || 'Failed to save product') }
    finally { setSaving(false) }
  }

  // --- Toggle active (with confirmation) ---
  const handleToggleConfirm = async () => {
    if (!toggleTarget) return
    setToggling(true)
    try {
      const res = await fetch(`/api/products/${toggleTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !toggleTarget.isActive, version: toggleTarget.version }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Toggle failed') }
      setToggleTarget(null)
      fetchProducts()
      toast.success(toggleTarget.isActive ? `"${toggleTarget.name}" deactivated` : `"${toggleTarget.name}" activated`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle status')
    } finally { setToggling(false) }
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
      toast.success(`"${product.name}" restored`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to restore product')
      fetchProducts()
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteError('')
    const deleted = deleteTarget
    try {
      const res = await fetch(`/api/products/${deleted.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Delete failed')
      }
      setDeleteTarget(null); fetchProducts()
      toast.success(`"${deleted.name}" deleted`, {
        action: { label: 'Undo', onClick: () => restoreProduct(deleted) },
        duration: 8000,
      })
    } catch (err: any) { setDeleteError(err.message) }
  }

  // --- Position the floating action menu next to its trigger button ---
  const positionMenu = useCallback(() => {
    const btn = menuBtnRef.current
    if (!btn || !btn.isConnected) return
    const rect = btn.getBoundingClientRect()
    const menuW = menuRef.current?.offsetWidth || 176
    const menuH = menuRef.current?.offsetHeight || 244
    let top = rect.bottom + 4
    let left = rect.right - menuW
    if (top + menuH > window.innerHeight) top = Math.max(4, rect.top - menuH - 4)
    if (left < 4) left = 4
    if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 4
    setMenuStyle({ position: 'fixed', top: `${top}px`, left: `${left}px`, zIndex: 50 })
  }, [])

  const openMenu = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    menuBtnRef.current = e.currentTarget as HTMLButtonElement
    setMenuOpenId(prev => (prev === id ? null : id))
    positionMenu()
  }

  // Re-position the open menu whenever rows shift (expand/collapse/refresh)
  useLayoutEffect(() => {
    if (menuOpenId !== null) positionMenu()
  }, [menuOpenId, expanded, positionMenu])

  // Keep the menu glued to its button while scrolling or resizing.
  useEffect(() => {
    if (menuOpenId === null) return
    let raf = 0
    const handle = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(positionMenu)
    }
    window.addEventListener('scroll', handle, true)
    window.addEventListener('resize', handle)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', handle, true)
      window.removeEventListener('resize', handle)
    }
  }, [menuOpenId, positionMenu])

  // --- Render rows (flat list for valid HTML) ---
  const renderProductRows = (product: Product, depth = 0): React.ReactNode[] => {
    const isGroup = product.isCategory
    const accHasChildren = hasChildren(product.id)
    const isOpen = expanded.has(product.id)
    const children = accHasChildren ? getChildren(product.id) : []
    const depthPadding = Math.min(depth, 10)
    const typeCfg = isGroup ? groupConfig : itemTypeConfig[product.itemType]
    const lowStock = !isGroup && lowStockIds.has(product.id)

    const row = (
      <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
        <td className="py-2 px-3">
          <div
            className={`flex items-center gap-1.5 ${accHasChildren ? 'cursor-pointer' : ''}`}
            style={{ paddingLeft: `${depthPadding * 20}px` }}
            onClick={accHasChildren ? () => toggleExpand(product.id) : undefined}
          >
            {accHasChildren ? (
              <button className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            {isGroup
              ? (isOpen ? <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" /> : <Folder className="w-4 h-4 text-amber-500 shrink-0" />)
              : <Package className="w-4 h-4 text-gray-400 shrink-0" />}
            {/* Chart-of-accounts style: code shown mono before the name */}
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-28 shrink-0 truncate">{product.code}</span>
            <span className={`text-sm truncate min-w-0 ${isGroup ? 'font-semibold' : 'font-medium'} ${product.isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500 line-through'}`}>
              {product.name}
            </span>
            {/* Parent shown beside the product, like the chart of accounts */}
            {product.parentId && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 truncate max-w-36" title={(() => { const p = products.find(x => x.id === product.parentId); return p ? `${p.code} — ${p.name}` : '' })()}>
                {(() => { const p = products.find(x => x.id === product.parentId); return p ? `${p.code} — ${p.name}` : '' })()}
              </span>
            )}
            {lowStock && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 shrink-0" title="Below reorder point">
                Low stock
              </span>
            )}
          </div>
        </td>
        <td className="py-2 px-3">
          <StatusBadge label={typeCfg.label} color={`${typeCfg.bg} ${typeCfg.text}`} size="sm" />
        </td>
        <td className="py-2 px-3 text-gray-900 dark:text-white">{isGroup ? <span className="text-gray-300 dark:text-gray-600">—</span> : formatCurrency(product.salesPrice)}</td>
        <td className="py-2 px-3 text-gray-900 dark:text-white">{isGroup ? <span className="text-gray-300 dark:text-gray-600">—</span> : formatCurrency(product.purchasePrice)}</td>
        <td className="py-2 px-3">
          <StatusBadge label={product.isActive ? 'Active' : 'Inactive'} color={product.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'} size="sm" />
        </td>
        <td className="py-2 px-3 text-right">
          <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
            {isGroup && (
              <button onClick={() => openAddChild(product)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors" title="Add sub-item">
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={e => openMenu(e, product.id)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="More actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    )

    if (accHasChildren && isOpen) {
      return [row, ...children.flatMap(child => renderProductRows(child, depth + 1))]
    }
    return [row]
  }

  // Groups only — valid parents in the picker
  const groupOptions = useMemo(() => products.filter(p => p.isCategory && p.id !== editingProduct?.id), [products, editingProduct])

  // A group being edited that still contains sub-items cannot be converted to
  // a sellable item — the Node Type field is locked with a hint (COA-style edit
  // prevention). The server enforces the same rule.
  const editingGroupChildCount = editingProduct?.isCategory ? products.filter(p => p.parentId === editingProduct.id).length : 0
  const lockNodeType = editingGroupChildCount > 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Products</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Hierarchical product tree — groups act as folders (like the chart of accounts). Click <ChevronRight className="w-3 h-3 inline" /> to expand.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => openAddRoot(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Folder className="w-4 h-4" /> Add Group
          </button>
          <button onClick={() => openAddRoot(false)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(() => {
          const items = products.filter(p => !p.isCategory)
          const groups = products.filter(p => p.isCategory)
          return [
            { label: 'Total Items', value: items.length, color: 'text-brand-500' },
            { label: 'Stock Items', value: items.filter(p => p.itemType === 'stock').length, color: 'text-blue-500' },
            { label: 'Services', value: items.filter(p => p.itemType === 'service').length, color: 'text-purple-500' },
            { label: 'Groups', value: groups.length, color: 'text-amber-500' },
          ]
        })().map(s => (
          <StatCard key={s.label} label={s.label} value={s.value} color={s.color} />
        ))}
      </div>

      {/* Combined filters & search */}
      <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-2.5">
        {(['all', ...itemTypes] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === t ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
            {t === 'all' ? 'All' : itemTypeConfig[t].label}
          </button>
        ))}
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />
        {(['all', 'active', 'inactive'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className={`px-2.5 py-1 rounded-lg text-sm font-medium transition-colors ${statusFilter === f ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-sm' : 'text-gray-500 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
            {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Inactive'}
          </button>
        ))}
        <div className="flex-1 min-w-0" />
        <ClearFiltersButton
          filters={{ type: activeTab !== 'all', status: statusFilter !== 'all', search: searchQuery !== '' }}
          onClear={() => { setActiveTab('all'); setStatusFilter('all'); setSearchQuery('') }}
        />
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search by code or name..." className="max-w-xs w-full" compact />
      </div>

      {/* Main table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading products...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
            <button onClick={fetchProducts} className="mt-3 text-sm font-medium text-brand-500 hover:text-brand-600 transition-colors">Try again</button>
          </div>
        ) : topLevel.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Layers className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">No products yet</p>
            <button onClick={() => openAddRoot(false)} className="mt-2 text-sm font-medium text-brand-500 hover:text-brand-600 transition-colors">
              <Plus className="w-4 h-4 inline" /> Add your first product
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Product</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sell Price</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cost Price</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {topLevel.flatMap(product => renderProductRows(product))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- Floating Action Menu --- */}
      {menuOpenId !== null && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
          <div ref={menuRef} style={menuStyle} className="w-44 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
            {(() => {
              const product = products.find(p => p.id === menuOpenId)
              if (!product) return null
              return (
                <>
                  <button
                    onClick={() => { setMenuOpenId(null); openEdit(product) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => { setMenuOpenId(null); setToggleTarget(product) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    {product.isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                    {product.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => { setMenuOpenId(null); setDeleteTarget(product); setDeleteError('') }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 border-t border-gray-100 dark:border-gray-800"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </>
              )
            })()}
          </div>
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} className="max-w-2xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {editingProduct ? 'Edit Product' : formData.isCategory ? 'Add Group' : formData.parentId ? 'Add Sub-Item' : 'Add Product'}
        </h3>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1 custom-scrollbar">
          {/* Parent — first field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Parent Group</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => { setParentOpen(!parentOpen); if (!parentOpen) setParentSearch('') }}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-left flex items-center justify-between gap-2 transition-all hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              >
                {formData.parentId ? (
                  <span className="inline-flex items-center gap-1.5 text-gray-900 dark:text-white">
                    <Folder className="w-3.5 h-3.5 text-amber-500" />
                    {(() => { const p = products.find(x => x.id === formData.parentId); return p ? `${p.code} — ${p.name}` : `#${formData.parentId}` })()}
                  </span>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">None (Top-level)</span>
                )}
                <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${parentOpen ? 'rotate-180' : ''}`} />
              </button>
              {parentOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => { setParentOpen(false); setParentSearch('') }} />
                  <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text" value={parentSearch} onChange={e => setParentSearch(e.target.value)}
                          placeholder="Search groups..." autoFocus
                          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-9 pr-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto py-1">
                      <button
                        type="button"
                        onClick={() => { setFormData({ ...formData, parentId: null, code: generateSuggestedCode(products, null) }); setParentOpen(false); setParentSearch('') }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${formData.parentId === null ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                      >
                        <span className="font-medium">None (Top-level)</span>
                      </button>
                      {(parentSearch.trim()
                        ? groupOptions.filter(g => g.code.toLowerCase().includes(parentSearch.toLowerCase()) || g.name.toLowerCase().includes(parentSearch.toLowerCase()))
                        : groupOptions
                      ).map(g => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => { setFormData({ ...formData, parentId: g.id, code: generateSuggestedCode(products, g.id) }); setParentOpen(false); setParentSearch('') }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${formData.parentId === g.id ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                        >
                          <Folder className="w-3.5 h-3.5 text-amber-500 inline mr-2 -mt-0.5" />
                          <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">{g.code}</span>
                          <span>{g.name}</span>
                          {!g.isActive && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}
                        </button>
                      ))}
                      {groupOptions.length === 0 && (
                        <p className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No groups yet — create one first</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Code + Node type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Code</label>
              <input type="text" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="Auto-generated if empty"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
              {!editingProduct && formData.parentId && (
                <p className="text-[11px] text-gray-400 mt-1">Auto-suggested: parent code + sequence</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Node Type <span className="text-red-400">*</span></label>
              {lockNodeType ? (
                <>
                  <div className="w-full rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                    Group (folder)
                  </div>
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                    This group contains {editingGroupChildCount} sub-item{editingGroupChildCount > 1 ? 's' : ''} — move or delete them before converting it to a sellable item.
                  </p>
                </>
              ) : (
                <select
                  value={formData.isCategory ? 'group' : formData.itemType}
                  onChange={e => {
                    const v = e.target.value
                    setFormData({ ...formData, isCategory: v === 'group', itemType: v === 'service' ? 'service' : 'stock' })
                  }}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                >
                  <option value="group">Group (folder)</option>
                  <option value="stock">Stock Item</option>
                  <option value="service">Service</option>
                </select>
              )}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name <span className="text-red-400">*</span></label>
            <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder={formData.isCategory ? 'Group name, e.g. Electronics' : 'Product name'}
              className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${!formData.name.trim() ? 'border-red-300' : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'}`} />
          </div>

          {!formData.isCategory && (
            <>
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                <textarea rows={2} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Optional description"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
              </div>

              {/* Profile */}
              <div>
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

              {/* Prices + UOM */}
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
              {saving ? 'Saving...' : editingProduct ? 'Update Product' : formData.isCategory ? 'Create Group' : 'Create Product'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Toggle Active Modal */}
      <Modal isOpen={!!toggleTarget} onClose={() => setToggleTarget(null)} className="max-w-md p-6">
        {toggleTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-50 dark:bg-amber-950/50 p-2.5">{toggleTarget.isActive ? <PowerOff className="w-5 h-5 text-amber-500" /> : <Power className="w-5 h-5 text-green-500" />}</div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{toggleTarget.isActive ? 'Deactivate' : 'Activate'}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{toggleTarget.code} — {toggleTarget.name}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to {toggleTarget.isActive ? 'deactivate' : 'activate'} <strong>{toggleTarget.name}</strong>?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setToggleTarget(null)}>Cancel</Button>
              <Button size="sm" onClick={handleToggleConfirm} disabled={toggling}>
                {toggling && <Loader2 className="w-4 h-4 animate-spin" />}
                {toggleTarget.isActive ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal — COA-style prevention: groups that still
          contain sub-items are pre-locked (amber panel, no Delete button).
          Server-side in-use errors (stock / invoices / POs) surface in amber. */}
      <Modal isOpen={!!deleteTarget} onClose={() => { setDeleteTarget(null); setDeleteError('') }} className="max-w-md p-6">
        {deleteTarget && (() => {
          const childCount = deleteTarget.isCategory ? products.filter(p => p.parentId === deleteTarget.id).length : 0
          const prevented = deleteTarget.isCategory && childCount > 0
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-full p-2.5 ${prevented ? 'bg-amber-50 dark:bg-amber-950/50' : 'bg-red-50 dark:bg-red-950/50'}`}>
                  <AlertTriangle className={`w-5 h-5 ${prevented ? 'text-amber-500' : 'text-red-500'}`} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete {deleteTarget.isCategory ? 'Group' : 'Product'}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{deleteTarget.code}</p>
                </div>
              </div>

              {prevented ? (
                <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                  This group contains {childCount} sub-item{childCount > 1 ? 's' : ''}. Move or delete them first before deleting the group.
                </p>
              ) : deleteError ? (
                <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                  {deleteError}
                </p>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Are you sure you want to delete <strong>{deleteTarget.name}</strong>? You&apos;ll be able to undo this right after.
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => { setDeleteTarget(null); setDeleteError('') }}>Cancel</Button>
                {!prevented && (
                  <Button size="sm" onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Delete</Button>
                )}
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
