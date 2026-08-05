'use client'
import { StatCard, ModalHeader, EmptyState } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/formatters'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search, Loader2, AlertTriangle,
  ArrowDownCircle, ArrowUpCircle, RefreshCw, SlidersHorizontal,
  ExternalLink, Package,
} from 'lucide-react'
import DatePicker from '@/components/form/input/DatePicker'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import type { Warehouse } from '@/types/erp'

interface Movement {
  id: number
  movementNumber: string
  type: 'receipt' | 'issue' | 'transfer' | 'adjustment' | 'return'
  productId: number
  warehouseId: number
  quantity: number
  unitCost: number
  totalCost: number
  referenceType: string
  referenceId: number
  referenceNumber: string
  postedBy: string
  postedAt: string
  createdAt: string
  productName: string
  warehouseName: string
}

const movementTypeStyles: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
  receipt: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    text: 'text-green-700 dark:text-green-400',
    icon: <ArrowDownCircle className="w-3.5 h-3.5" />,
    label: 'Receipt',
  },
  issue: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    text: 'text-red-700 dark:text-red-400',
    icon: <ArrowUpCircle className="w-3.5 h-3.5" />,
    label: 'Issue',
  },
  transfer: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    text: 'text-blue-700 dark:text-blue-400',
    icon: <RefreshCw className="w-3.5 h-3.5" />,
    label: 'Transfer',
  },
  adjustment: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-400',
    icon: <SlidersHorizontal className="w-3.5 h-3.5" />,
    label: 'Adjustment',
  },
  return: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    text: 'text-purple-700 dark:text-purple-400',
    icon: <RefreshCw className="w-3.5 h-3.5" />,
    label: 'Return',
  },
}

const movementTypes = ['', 'receipt', 'issue', 'transfer', 'adjustment', 'return'] as const

export default function InventoryMovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [warehouseFilter, setWarehouseFilter] = useState<string>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Reference data
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  // Detail modal
  const [detailTarget, setDetailTarget] = useState<Movement | null>(null)

  const fetchMovements = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (typeFilter) params.set('type', typeFilter)
      if (warehouseFilter) params.set('warehouseId', warehouseFilter)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await fetch(`/api/inventory/movements?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load movements')
      const json = await res.json(); if (json.success) setMovements(json.data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [typeFilter, warehouseFilter, startDate, endDate])

  const fetchRefData = useCallback(async () => {
    try {
      const [whRes] = await Promise.all([fetch('/api/warehouses')])
      if (whRes.ok) { const wj = await whRes.json(); if (wj.success) setWarehouses(wj.data) }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchMovements() }, [fetchMovements])
  useEffect(() => { fetchRefData() }, [fetchRefData])

  // Client-side search filter (by product name or movement number)
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return movements
    const q = searchQuery.toLowerCase()
    return movements.filter(m =>
      m.productName.toLowerCase().includes(q) ||
      m.movementNumber.toLowerCase().includes(q) ||
      m.referenceNumber.toLowerCase().includes(q)
    )
  }, [movements, searchQuery])

  // Summary stats
  const stats = useMemo(() => {
    const totalReceipts = filtered.filter(m => m.type === 'receipt').reduce((s, m) => s + Math.abs(m.quantity), 0)
    const totalIssues = filtered.filter(m => m.type === 'issue').reduce((s, m) => s + Math.abs(m.quantity), 0)
    const totalValue = filtered.reduce((s, m) => s + m.totalCost, 0)
    return { totalMovements: filtered.length, totalReceipts, totalIssues, totalValue }
  }, [filtered])

  const clearFilters = () => {
    setTypeFilter('')
    setWarehouseFilter('')
    setStartDate('')
    setEndDate('')
    setSearchQuery('')
  }

  const hasActiveFilters = typeFilter || warehouseFilter || startDate || endDate || searchQuery

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Inventory Movements</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Track all stock receipts, issues, transfers, and adjustments across warehouses.
          </p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm ${
            showFilters || hasActiveFilters
              ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 border border-brand-200 dark:border-brand-800'
              : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {hasActiveFilters && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-500 text-white text-[10px] font-bold">
              {(typeFilter ? 1 : 0) + (warehouseFilter ? 1 : 0) + (startDate || endDate ? 1 : 0) + (searchQuery ? 1 : 0)}
            </span>
          )}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Movements', value: stats.totalMovements, color: 'text-brand-500', suffix: '' },
          { label: 'Total Receipts (units)', value: stats.totalReceipts, color: 'text-green-500', suffix: '' },
          { label: 'Total Issues (units)', value: stats.totalIssues, color: 'text-red-500', suffix: '' },
          { label: 'Total Value', value: formatCurrency(stats.totalValue), color: 'text-gray-900 dark:text-white', suffix: '' },
        ].map(s => (
          <StatCard key={s.label} label={s.label} value={s.value} color={s.color} />
        ))}
      </div>

      {/* Filters panel */}
      {(showFilters || hasActiveFilters) && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-gray-400" /> Filters
            </h3>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors">
                Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Product, movement #..."
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-8 pr-3 py-2 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                />
              </div>
            </div>

            {/* Movement type */}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Type</label>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              >
                <option value="">All Types</option>
                {movementTypes.filter(Boolean).map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>

            {/* Warehouse */}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Warehouse</label>
              <select
                value={warehouseFilter}
                onChange={e => setWarehouseFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              >
                <option value="">All Warehouses</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>

            {/* Date range */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">From</label>
                <DatePicker value={startDate} onChange={setStartDate} />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
                <DatePicker value={endDate} onChange={setEndDate} />
              </div>
            </div>
          </div>

          <button
            onClick={fetchMovements}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 text-xs font-medium hover:bg-brand-100 dark:hover:bg-brand-950/50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Apply Filters
          </button>
        </div>
      )}

      {/* Inner nav tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setTypeFilter('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!typeFilter ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
        >All</button>
        {movementTypes.filter(Boolean).map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(typeFilter === t ? '' : t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors flex items-center gap-1.5 ${
              typeFilter === t
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {movementTypeStyles[t]?.icon}
            {t}
          </button>
        ))}
      </div>

      {/* Movements table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading movements...</p>
            </div>
          ) : error ? (
            <EmptyState icon={<AlertTriangle className="w-10 h-10 text-red-400 mb-3" />} title={<span className="text-red-600 dark:text-red-400">{error}</span>} action={<button onClick={fetchMovements} className="mt-3 text-sm font-medium text-brand-500">Try again</button>} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />}
              title="No movements found"
              action={hasActiveFilters ? <button onClick={clearFilters} className="mt-2 text-sm font-medium text-brand-500">Clear filters</button> : undefined}
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Movement #</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Product</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Warehouse</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Qty</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Unit Cost</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Cost</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Reference</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map(m => {
                  const style = movementTypeStyles[m.type] || movementTypeStyles.receipt
                  return (
                    <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-3 px-4 text-xs font-mono font-medium text-brand-600 dark:text-brand-400">
                        {m.movementNumber}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {formatDate(m.postedAt || m.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                        {m.productName}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-600 dark:text-gray-400">
                        {m.warehouseName}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                          {style.icon}
                          {style.label}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-xs text-right font-semibold ${
                        m.type === 'receipt' || m.type === 'return'
                          ? 'text-green-600 dark:text-green-400'
                          : m.type === 'issue'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                      </td>
                      <td className="py-3 px-4 text-xs text-right text-gray-600 dark:text-gray-400">
                        {formatCurrency(m.unitCost)}
                      </td>
                      <td className="py-3 px-4 text-xs text-right font-medium text-gray-900 dark:text-white">
                        {formatCurrency(m.totalCost)}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500 dark:text-gray-400 max-w-[140px] truncate" title={m.referenceNumber}>
                        <span className="font-mono text-[10px] uppercase text-gray-400">{m.referenceType}</span>{' '}
                        {m.referenceNumber}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setDetailTarget(m)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                          title="View detail"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail modal */}
      <Modal isOpen={!!detailTarget} onClose={() => setDetailTarget(null)} className="max-w-lg p-0" showCloseButton={false}>
        {detailTarget && (
          <>
            <ModalHeader
              title="Movement Detail"
              subtitle={<span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{detailTarget.movementNumber}</span>}
              onClose={() => setDetailTarget(null)}
            />

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Type badge */}
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${
                  movementTypeStyles[detailTarget.type]?.bg} ${movementTypeStyles[detailTarget.type]?.text}`}>
                  {movementTypeStyles[detailTarget.type]?.icon}
                  {movementTypeStyles[detailTarget.type]?.label}
                </span>
                <span className="text-xs text-gray-400">{formatDate(detailTarget.postedAt || detailTarget.createdAt, 'datetime')}</span>
              </div>

              {/* Detail grid */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium">Product</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{detailTarget.productName}</p>
                  <p className="text-[11px] text-gray-400">Product ID: #{detailTarget.productId}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium">Warehouse</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{detailTarget.warehouseName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium">Quantity</p>
                  <p className={`text-sm font-semibold mt-0.5 ${
                    detailTarget.type === 'receipt' || detailTarget.type === 'return'
                      ? 'text-green-600 dark:text-green-400'
                      : detailTarget.type === 'issue'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-900 dark:text-white'
                  }`}>
                    {detailTarget.quantity > 0 ? '+' : ''}{detailTarget.quantity}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium">Unit Cost</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{formatCurrency(detailTarget.unitCost)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium">Total Cost</p>
                  <p className="text-base font-bold text-brand-600 dark:text-brand-400 mt-0.5">{formatCurrency(detailTarget.totalCost)}</p>
                </div>
              </div>

              {/* Reference info */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium mb-2">Reference</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Type</span>
                    <span className="text-xs font-medium text-gray-900 dark:text-white capitalize">{detailTarget.referenceType}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Number</span>
                    <span className="text-xs font-mono text-gray-900 dark:text-white">{detailTarget.referenceNumber}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Reference ID</span>
                    <span className="text-xs font-mono text-gray-900 dark:text-white">#{detailTarget.referenceId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Posted By</span>
                    <span className="text-xs text-gray-900 dark:text-white">{detailTarget.postedBy || 'System'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
              <Button variant="outline" size="sm" onClick={() => setDetailTarget(null)}>Close</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
