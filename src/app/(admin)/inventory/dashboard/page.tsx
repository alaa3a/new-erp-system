'use client'
import { formatNumber, formatDate } from '@/lib/formatters'
import { formatCurrency } from '@/lib/formatters'
import { EmptyState } from '@/components/ui'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Loader2, AlertTriangle, Package, Box, AlertCircle, TrendingUp, Warehouse as WarehouseIcon,
} from 'lucide-react'
import Link from 'next/link'

interface StockRow {
  productId: number
  productName: string
  code: string
  warehouseId: number
  warehouseName: string
  quantity: number
  reservedQuantity: number
  available: number
  averageCost: number
}

interface MovementRow {
  id: number
  type: string
  productName: string
  warehouseName: string
  quantity: number
  unitCost: number
  postedAt: string
  referenceNumber: string
}

interface ReorderAlert {
  productId: number
  productName: string
  productCode: string
  warehouseName: string
  quantity: number
  reorderPoint: number
}

const movementLabel: Record<string, string> = {
  receipt: 'Receipt', issue: 'Issue', transfer: 'Transfer', adjustment: 'Adjustment', return: 'Return',
}

export default function InventoryDashboardPage() {
  const [stock, setStock] = useState<StockRow[]>([])
  const [movements, setMovements] = useState<MovementRow[]>([])
  const [alerts, setAlerts] = useState<ReorderAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [stockRes, moveRes, alertRes] = await Promise.all([
        fetch('/api/inventory/stock'),
        fetch('/api/inventory/movements?pageSize=200'),
        fetch('/api/inventory/reorder-check'),
      ])
      if (!stockRes.ok || !moveRes.ok || !alertRes.ok) throw new Error('Failed to load inventory data')
      const sj = await stockRes.json()
      const mj = await moveRes.json()
      const aj = await alertRes.json()
      if (sj.success) setStock(sj.data)
      if (mj.success) setMovements((mj.data || []).slice(0, 30))
      if (aj.success) setAlerts(aj.data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const totals = useMemo(() => {
    const totalUnits = stock.reduce((s, r) => s + r.quantity, 0)
    const totalReserved = stock.reduce((s, r) => s + r.reservedQuantity, 0)
    const totalValue = stock.reduce((s, r) => s + r.quantity * r.averageCost, 0)
    const lowStockCount = alerts.length
    return { totalUnits, totalReserved, totalValue, lowStockCount, itemCount: stock.length }
  }, [stock, alerts])

  // Stock value by warehouse
  const byWarehouse = useMemo(() => {
    const map = new Map<string, { warehouseName: string; value: number; units: number }>()
    for (const r of stock) {
      const cur = map.get(r.warehouseName) || { warehouseName: r.warehouseName, value: 0, units: 0 }
      cur.value += r.quantity * r.averageCost
      cur.units += r.quantity
      map.set(r.warehouseName, cur)
    }
    return [...map.values()].sort((a, b) => b.value - a.value)
  }, [stock])

  // Top moving products this month
  const topMoving = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const map = new Map<string, { name: string; qty: number }>()
    for (const m of movements) {
      if (m.postedAt < monthStart) continue
      const cur = map.get(m.productName) || { name: m.productName, qty: 0 }
      cur.qty += Math.abs(m.quantity)
      map.set(m.productName, cur)
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 8)
  }, [movements])

  const maxWarehouseValue = Math.max(1, ...byWarehouse.map(w => w.value))

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin mb-4" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading inventory dashboard...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button onClick={fetchAll} className="mt-3 text-sm font-medium text-brand-500 hover:text-brand-600">Try again</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Inventory Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Stock health, valuation by warehouse, and movement trends.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inventory/counts" className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cycle Counts
          </Link>
          <Link href="/inventory/movements" className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Movements
          </Link>
        </div>
      </div>

      {/* Health summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2"><Box className="w-4 h-4 text-brand-500" /> Items in stock</div>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{totals.itemCount}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2"><Package className="w-4 h-4 text-blue-500" /> Total units</div>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{formatNumber(totals.totalUnits)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2"><WarehouseIcon className="w-4 h-4 text-indigo-500" /> Stock value</div>
          <p className="text-2xl font-semibold text-brand-600 dark:text-brand-400">{formatCurrency(totals.totalValue)}</p>
        </div>
        <Link href="/inventory/movements" className={`rounded-2xl border p-5 transition-all ${totals.lowStockCount > 0 ? 'border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/10 hover:shadow-lg' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg'}`}>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
            <AlertCircle className={`w-4 h-4 ${totals.lowStockCount > 0 ? 'text-red-500' : 'text-green-500'}`} />
            Below reorder point
          </div>
          <p className={`text-2xl font-semibold ${totals.lowStockCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{totals.lowStockCount}</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Stock value by warehouse */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Stock Value by Warehouse</h2>
          {byWarehouse.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No stock recorded.</p>
          ) : (
            <div className="space-y-3">
              {byWarehouse.map(w => (
                <div key={w.warehouseName}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600 dark:text-gray-400 font-medium">{w.warehouseName}</span>
                    <span className="text-gray-900 dark:text-white font-medium">{formatCurrency(w.value)} <span className="text-gray-400 font-normal">({formatNumber(w.units)} units)</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-indigo-500 transition-all duration-500" style={{ width: `${(w.value / maxWarehouseValue) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low stock items */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Low Stock Items</h2>
            <Link href="/products" className="text-xs font-medium text-brand-500 hover:text-brand-600">Products</Link>
          </div>
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">All items are above their reorder points. 👍</p>
          ) : (
            <div className="space-y-2">
              {alerts.map(a => (
                <div key={`${a.productId}-${a.warehouseName}`} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-red-50/50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/50">
                  <div className="rounded-full bg-red-100 dark:bg-red-950/50 p-1.5 shrink-0"><AlertCircle className="w-3.5 h-3.5 text-red-500" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.productName}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{a.warehouseName} · reorder at {a.reorderPoint}</p>
                  </div>
                  <span className="text-sm font-semibold text-red-600 dark:text-red-400 shrink-0">{a.quantity} left</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top moving products */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-500" /> Top Moving Products <span className="text-xs font-normal text-gray-400">(this month)</span>
          </h2>
          {topMoving.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No movements this month yet.</p>
          ) : (
            <div className="space-y-2">
              {topMoving.map((t, i) => (
                <div key={t.name} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-semibold text-gray-400">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.name}</p>
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(t.qty / Math.max(1, topMoving[0].qty)) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white shrink-0">{formatNumber(t.qty)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent movements */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Recent Movements</h2>
            <Link href="/inventory/movements" className="text-xs font-medium text-brand-500 hover:text-brand-600">View All</Link>
          </div>
          {movements.length === 0 ? (
            <EmptyState icon={<Package className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />} title="No movements yet" />
          ) : (
            <div className="space-y-2">
              {movements.slice(0, 8).map(m => (
                <div key={m.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize ${
                    m.type === 'receipt' || m.type === 'return' ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400' :
                    m.type === 'issue' ? 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400' :
                    'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400'
                  }`}>
                    {movementLabel[m.type] || m.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-white truncate">{m.productName}</p>
                    <p className="text-[11px] text-gray-400">{m.warehouseName}</p>
                  </div>
                  <span className={`text-sm font-semibold ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>{m.quantity > 0 ? '+' : ''}{formatNumber(m.quantity)}</span>
                  <span className="text-[11px] text-gray-400 shrink-0">{formatDate(m.postedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
