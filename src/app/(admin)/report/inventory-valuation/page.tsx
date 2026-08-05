'use client'
import { formatNumber } from '@/lib/formatters'
import { formatCurrency } from '@/lib/formatters'
import { StatCard } from '@/components/ui'

import { useState, useEffect, useCallback } from 'react'
import { Download, Loader2, AlertTriangle, Package } from 'lucide-react'


interface ValuationRow {
  id: number
  code: string
  name: string
  itemType: string
  warehouseId: number
  warehouseCode: string
  warehouseName: string
  quantity: number
  averageCost: number
  totalValue: number
}

export default function InventoryValuationPage() {
  const [rows, setRows] = useState<ValuationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/reports/inventory-valuation')
      if (!res.ok) throw new Error('Failed to load inventory valuation')
      const json = await res.json()
      setRows(json.success ? json.data : json)
    } catch (err: any) {
      setError(err?.message || 'Failed to load inventory valuation')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleExport = (format: 'csv' | 'xls') => {
    window.open(`/api/reports/export/inventory-valuation?format=${format}`, '_blank')
  }

  useEffect(() => { fetchData() }, [fetchData])

  const totalUnits = rows.reduce((s, r) => s + r.quantity, 0)
  const totalValue = rows.reduce((s, r) => s + r.totalValue, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Inventory Valuation</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Current stock value at average cost across all warehouses.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('csv')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={() => handleExport('xls')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Download className="w-4 h-4" /> Excel
          </button>
        </div>
      </div>

      {/* Loading / Error */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading inventory valuation...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={fetchData} className="mt-3 text-sm font-medium text-brand-500">Try again</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center">
          <Package className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-400 dark:text-gray-500">No inventory items with stock. Add products and post inventory movements first.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Total Items" value={rows.length} size="lg"  />
            <StatCard label="Total Units" value={formatNumber(totalUnits)} size="lg"  />
            <StatCard label="Total Value" value={formatCurrency(totalValue)} size="lg" color="text-brand-600 dark:text-brand-400" />
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 dark:bg-gray-900/50">
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Code</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Warehouse</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Quantity</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Avg Cost</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Total Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {rows.map((item) => (
                    <tr key={`${item.id}-${item.warehouseId}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-2.5 px-4 text-sm font-medium text-gray-900 dark:text-white">{item.name}</td>
                      <td className="py-2.5 px-4 text-sm font-mono text-gray-500">{item.code}</td>
                      <td className="py-2.5 px-4 text-sm text-gray-500 dark:text-gray-400">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono text-xs text-gray-400">{item.warehouseCode}</span>
                          {item.warehouseName}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-sm text-right text-gray-900 dark:text-white">{formatNumber(item.quantity)}</td>
                      <td className="py-2.5 px-4 text-sm text-right text-gray-600 dark:text-gray-400">{formatCurrency(item.averageCost)}</td>
                      <td className="py-2.5 px-4 text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(item.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 dark:bg-gray-900/50 font-semibold">
                    <td colSpan={3} className="py-3 px-4 text-sm text-gray-900 dark:text-white">Total</td>
                    <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white">{formatNumber(totalUnits)}</td>
                    <td></td>
                    <td className="py-3 px-4 text-sm text-right text-brand-600 dark:text-brand-400">{formatCurrency(totalValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
