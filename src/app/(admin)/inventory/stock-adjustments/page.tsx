'use client'
import { formatCurrency, formatDate } from '@/lib/formatters'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Loader2, AlertTriangle, CheckCircle, ChevronDown,
  ArrowUpCircle, ArrowDownCircle,
  RefreshCw, History, Package,
} from 'lucide-react'
import Button from '@/components/ui/button/Button'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type { Warehouse, Product } from '@/types/erp'

interface StockItem {
  productId: number
  warehouseId: number
  productName: string
  warehouseName: string
  code: string
  quantity: number
  averageCost: number
  totalValue: number
  itemType: string
}

interface Movement {
  id: number
  movementNumber: string
  type: string
  productId: number
  warehouseId: number
  quantity: number
  unitCost: number
  totalCost: number
  referenceNumber: string
  postedBy: string
  postedAt: string
  productName: string
  warehouseName: string
}

export default function StockAdjustmentsPage() {
  const toast = useToast()
  // ── Data ──
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [stockData, setStockData] = useState<StockItem[]>([])
  const [adjustments, setAdjustments] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)

  // ── Form ──
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null)
  const [newQuantity, setNewQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // ── Product search ──
  const [productSearch, setProductSearch] = useState('')
  const [productOpen, setProductOpen] = useState(false)

  // ── History filters ──
  const [historyFilter, setHistoryFilter] = useState<string>('adjustment')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [prodRes, whRes, stRes, movRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/warehouses'),
        fetch('/api/inventory/stock'),
        fetch(`/api/inventory/movements?type=${historyFilter}`),
      ])
      if (prodRes.ok) { const pj = await prodRes.json(); if (pj.success) setProducts(pj.data) }
      if (whRes.ok) { const wj = await whRes.json(); if (wj.success) setWarehouses(wj.data) }
      if (stRes.ok) { const sj = await stRes.json(); if (sj.success) setStockData(sj.data) }
      if (movRes.ok) { const mj = await movRes.json(); if (mj.success) setAdjustments(mj.data) }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [historyFilter])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Derived stock ──
  const stockItems = useMemo(() => products
    .filter(p => p.itemType === 'stock' && p.isActive !== false)
    .map(p => {
      const whStocks = stockData.filter(s => s.productId === p.id)
      return {
        ...p,
        warehouses: whStocks.map(s => ({
          warehouseId: s.warehouseId,
          warehouseName: s.warehouseName,
          quantity: s.quantity,
          averageCost: s.averageCost,
          totalValue: s.totalValue,
        })),
        totalStock: whStocks.reduce((sum, s) => sum + s.quantity, 0),
      }
    }), [products, stockData])

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return stockItems
    const q = productSearch.toLowerCase()
    return stockItems.filter(p =>
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q)
    )
  }, [stockItems, productSearch])

  // Current stock for selected product+warehouse
  const currentStock = useMemo(() => {
    if (!selectedProductId || !selectedWarehouseId) return null
    const item = stockData.find(s => s.productId === selectedProductId && s.warehouseId === selectedWarehouseId)
    return item || null
  }, [selectedProductId, selectedWarehouseId, stockData])

  const selectedProduct = useMemo(() =>
    products.find(p => p.id === selectedProductId), [products, selectedProductId])

  const selectedWarehouse = useMemo(() =>
    warehouses.find(w => w.id === selectedWarehouseId), [warehouses, selectedWarehouseId])

  const delta = currentStock && newQuantity
    ? Number(newQuantity) - currentStock.quantity
    : 0

  // ── Submit adjustment ──
  const handleSubmit = async () => {
    if (!selectedProductId || !selectedWarehouseId || newQuantity === '') return

    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/inventory/stock-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProductId,
          warehouseId: selectedWarehouseId,
          newQuantity: Number(newQuantity),
          reason: reason.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Adjustment failed')
      }

      toast.success(`Stock adjusted: ${delta > 0 ? '+' : ''}${delta} units (${selectedProduct?.name || 'product'})`)

      // Reset form and refresh data
      setNewQuantity('')
      setReason('')
      await fetchAll()
    } catch (err: any) {
      setError(err?.message || 'An error occurred')
      toast.error(err?.message || 'Failed to adjust stock')
    } finally {
      setSubmitting(false)
    }
  }

  const clearSelection = () => {
    setSelectedProductId(null)
    setSelectedWarehouseId(null)
    setNewQuantity('')
    setReason('')
    setError('')
  }

  // ── Available warehouses for selected product ──
  const availableWarehouses = useMemo(() => {
    if (!selectedProductId) return warehouses
    const productStocks = stockData.filter(s => s.productId === selectedProductId)
    if (productStocks.length === 0) return warehouses // No stock yet, show all
    const whIds = new Set(productStocks.map(s => s.warehouseId))
    return warehouses.filter(w => whIds.has(w.id))
  }, [selectedProductId, warehouses, stockData])

  const recentAdjustments = useMemo(() => {
    return adjustments.slice(0, 10)
  }, [adjustments])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Stock Adjustments</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manually correct stock quantities and record the reason for audit trail.
          </p>
        </div>
        <button onClick={fetchAll}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Main content: 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Adjustment Form */}
        <div className="lg:col-span-2 space-y-5">
          {/* Form card */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">New Adjustment</h3>

            <div className="space-y-4">
              {/* Product selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Product <span className="text-red-400">*</span></label>
                <div className="relative">
                  <div
                    onClick={() => { setProductOpen(!productOpen); if (!productOpen) setProductSearch('') }}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm cursor-pointer flex items-center justify-between gap-2 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                  >
                    {selectedProduct ? (
                      <span className="text-gray-900 dark:text-white truncate">{selectedProduct.code} — {selectedProduct.name}</span>
                    ) : (
                      <span className="text-gray-400">Search stock products...</span>
                    )}
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  </div>
                  {productOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setProductOpen(false)} />
                      <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                        <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                          <input
                            type="text" value={productSearch}
                            onChange={e => setProductSearch(e.target.value)}
                            placeholder="Search by code or name..."
                            autoFocus
                            className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-brand-500/30"
                          />
                        </div>
                        <div className="max-h-60 overflow-y-auto py-1 custom-scrollbar">
                          {filteredProducts.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-gray-400">No products found</p>
                          ) : (
                            filteredProducts.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setSelectedProductId(p.id)
                                  setSelectedWarehouseId(null)
                                  setNewQuantity('')
                                  setReason('')
                                  setError('')
                                  setProductOpen(false)
                                }}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                  selectedProductId === p.id
                                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-400'
                                    : 'text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <span className="font-mono text-xs text-gray-500">{p.code}</span>
                                    <span className="ml-2">{p.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className={`font-semibold ${p.totalStock > 0 ? 'text-gray-900 dark:text-white' : 'text-red-400'}`}>
                                      {p.totalStock} units
                                    </span>
                                  </div>
                                </div>
                                {p.warehouses.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-1">
                                    {p.warehouses.map(w => (
                                      <span key={w.warehouseId} className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                                        {w.warehouseName}: {w.quantity}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Warehouse selection and quantity - side by side */}
              {selectedProductId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Warehouse <span className="text-red-400">*</span></label>
                    <select
                      value={selectedWarehouseId || ''}
                      onChange={e => {
                        setSelectedWarehouseId(e.target.value ? Number(e.target.value) : null)
                        setNewQuantity('')
                        setError('')
                      }}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                    >
                      <option value="">Select warehouse...</option>
                      {availableWarehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                      ))}
                    </select>
                    {availableWarehouses.length === 0 && selectedProduct && (
                      <p className="text-xs text-amber-500 mt-1">No stock records found for this product. Selecting a warehouse will create one.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      New Quantity <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number" min="0" step="1"
                      value={newQuantity}
                      onChange={e => setNewQuantity(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                    />
                  </div>
                </div>
              )}

              {/* Current stock display */}
              {currentStock && selectedWarehouse && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Current Stock</p>
                      <p className={`text-2xl font-bold mt-0.5 ${currentStock.quantity > 0 ? 'text-gray-900 dark:text-white' : 'text-red-500'}`}>
                        {currentStock.quantity}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Average Cost</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white mt-0.5">
                        {formatCurrency(currentStock.averageCost)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Total Value</p>
                      <p className="text-lg font-semibold text-brand-600 dark:text-brand-400 mt-0.5">
                        {formatCurrency(currentStock.totalValue)}
                      </p>
                    </div>
                  </div>

                  {newQuantity && Number(newQuantity) >= 0 && (
                    <div className={`mt-3 rounded-lg border px-4 py-2.5 flex items-center gap-3 ${
                      delta === 0
                        ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                        : delta > 0
                        ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30'
                        : 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30'
                    }`}>
                      {delta > 0 ? <ArrowUpCircle className="w-5 h-5 text-green-500 shrink-0" /> :
                       delta < 0 ? <ArrowDownCircle className="w-5 h-5 text-red-500 shrink-0" /> :
                       <CheckCircle className="w-5 h-5 text-gray-400 shrink-0" />}
                      <div>
                        <p className={`text-sm font-medium ${delta === 0 ? 'text-gray-500' : delta > 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                          {delta === 0
                            ? 'No change — new quantity equals current stock'
                            : `${delta > 0 ? 'Increase' : 'Decrease'} of ${Math.abs(delta)} unit${Math.abs(delta) !== 1 ? 's' : ''}`
                          }
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {currentStock.quantity} → {Number(newQuantity)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Reason */}
              {selectedWarehouseId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reason for Adjustment</label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="e.g. Physical count correction, damaged goods, cycle count adjustment..."
                    rows={2}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all resize-none"
                  />
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-4 py-3 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              )}

              {/* Actions */}
              {selectedWarehouseId && (
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <Button variant="outline" size="sm" onClick={clearSelection} disabled={submitting}>
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={submitting || !newQuantity || Number(newQuantity) < 0 || (delta === 0 && !!currentStock)}
                    className="flex items-center gap-2"
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {submitting ? 'Adjusting...' : 'Apply Adjustment'}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Recent Adjustments table */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <History className="w-4 h-4 text-gray-400" /> Recent Adjustments
              </h3>
              <div className="flex items-center gap-1.5">
                {['adjustment', 'transfer'].map(t => (
                  <button
                    key={t}
                    onClick={() => setHistoryFilter(t)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                      historyFilter === t
                        ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400'
                        : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >{t}</button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
              </div>
            ) : recentAdjustments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Package className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-400">No recent adjustments</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900/50">
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Product</th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Warehouse</th>
                      <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Qty Change</th>
                      <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Value</th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {recentAdjustments.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="py-2.5 px-4 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(m.postedAt, 'datetime')}
                        </td>
                        <td className="py-2.5 px-4 text-xs font-medium text-gray-900 dark:text-white">
                          {m.productName}
                        </td>
                        <td className="py-2.5 px-4 text-xs text-gray-600 dark:text-gray-400">
                          {m.warehouseName}
                        </td>
                        <td className={`py-2.5 px-4 text-xs text-right font-semibold ${
                          m.quantity > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {m.quantity > 0 ? '+' : ''}{m.quantity}
                        </td>
                        <td className="py-2.5 px-4 text-xs text-right text-gray-900 dark:text-white">
                          {formatCurrency(m.totalCost)}
                        </td>
                        <td className="py-2.5 px-4 text-xs text-gray-500 dark:text-gray-400 max-w-[180px] truncate" title={m.referenceNumber}>
                          {m.referenceNumber}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right: Stock overview sidebar */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-400" /> Stock Overview
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
            </div>
          ) : stockData.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center">
              <Package className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-400">No stock data yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
              {stockData.map((item) => (
                <button
                  key={`${item.productId}-${item.warehouseId}`}
                  onClick={() => {
                    setSelectedProductId(item.productId)
                    setSelectedWarehouseId(item.warehouseId)
                    setNewQuantity('')
                    setReason('')
                    setError('')
                  }}
                  className={`w-full text-left rounded-xl border p-3 transition-all hover:shadow-md ${
                    selectedProductId === item.productId && selectedWarehouseId === item.warehouseId
                      ? 'border-brand-200 dark:border-brand-800 bg-brand-50/50 dark:bg-brand-950/20'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{item.productName}</p>
                    <p className={`text-sm font-bold ml-2 ${item.quantity > 0 ? 'text-gray-900 dark:text-white' : 'text-red-500'}`}>
                      {item.quantity}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                    <span className="truncate">{item.warehouseName}</span>
                    <span>{formatCurrency(item.averageCost)}/u</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
