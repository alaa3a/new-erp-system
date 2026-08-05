'use client'
import { formatDate } from '@/lib/formatters'
import { formatCurrency } from '@/lib/formatters'

import { useState, useEffect, useCallback } from 'react'
import { Download, Loader2, AlertTriangle } from 'lucide-react'
import DatePicker from '@/components/form/input/DatePicker'

interface BSRow {
  accountCode: string
  accountName: string
  accountType: string
  balance: number
}


export default function BalanceSheetPage() {
  const today = new Date().toISOString().split('T')[0]

  const [rows, setRows] = useState<BSRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [asOfDate, setAsOfDate] = useState(today)

  const fetchBS = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/reports/balance-sheet?asOfDate=${asOfDate}`)
      if (!res.ok) throw new Error('Failed to fetch balance sheet')
      const json = await res.json()
      setRows(json.data || json)
    } catch (err: any) {
      setError(err?.message || 'Failed to load balance sheet')
    } finally {
      setLoading(false)
    }
  }, [asOfDate])

  const handleExport = (format: 'csv' | 'xls') => {
    window.open(`/api/reports/export/balance-sheet?format=${format}&asOfDate=${asOfDate}`, '_blank')
  }

  useEffect(() => { fetchBS() }, [fetchBS])

  const assetRows = rows.filter(r => r.accountType === 'asset')
  const liabilityRows = rows.filter(r => r.accountType === 'liability')
  const equityRows = rows.filter(r => r.accountType === 'equity')

  const totalAssets = assetRows.reduce((s, r) => s + r.balance, 0)
  const totalLiabilities = liabilityRows.reduce((s, r) => s + r.balance, 0)
  const totalEquity = equityRows.reduce((s, r) => s + r.balance, 0)
  const totalLiabilitiesEquity = totalLiabilities + totalEquity
  const inBalance = Math.abs(totalAssets + totalLiabilities + totalEquity) < 1

  const renderSection = (title: string, items: BSRow[], total: number, headerBg: string, valueColor: string) => (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className={`px-5 py-4 border-b border-gray-100 dark:border-gray-800 ${headerBg}`}>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>
      {items.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">No {title.toLowerCase()} accounts with balance.</div>
      ) : (
        <div className="p-5 space-y-3">
          {items.map((r, i) => (
            <div key={i} className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-600 dark:text-gray-400">{r.accountName}</span>
                <span className="ml-2 text-xs font-mono text-gray-400">{r.accountCode}</span>
              </div>
              <span className={`text-sm font-medium $                      'text-gray-900 dark:text-white'`}>
                {formatCurrency(Math.abs(r.balance))}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Total {title}</span>
            <span className={`text-sm font-bold ${valueColor}`}>{formatCurrency(Math.abs(total))}</span>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Balance Sheet</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">As of {formatDate(asOfDate, 'long')}</p>
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

      {/* As-of date picker */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">As of Date</label>
        <div className="inline-block">
          <DatePicker value={asOfDate} onChange={setAsOfDate} />
        </div>
      </div>

      {/* Balance indicator */}
      {!loading && !error && (
        <div className={`rounded-2xl border p-5 ${inBalance ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20' : 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${inBalance ? 'bg-green-500' : 'bg-red-500'}`} />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {inBalance ? 'Balance Sheet is in balance ✓' : 'Balance Sheet is out of balance ✗'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Assets: {formatCurrency(totalAssets)} | Liabilities + Equity: {formatCurrency(totalLiabilitiesEquity)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading balance sheet...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 p-5 text-center">
          <AlertTriangle className="w-6 h-6 mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <button onClick={fetchBS} className="mt-3 text-xs font-medium text-red-600 hover:text-red-700 underline">Retry</button>
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {renderSection('Assets', assetRows, totalAssets, 'bg-blue-50 dark:bg-blue-950/20', 'text-blue-600 dark:text-blue-400')}
            {renderSection('Liabilities', liabilityRows, totalLiabilities, 'bg-amber-50 dark:bg-amber-950/20', 'text-amber-600 dark:text-amber-400')}
            {renderSection('Equity', equityRows, totalEquity, 'bg-violet-50 dark:bg-violet-950/20', 'text-violet-600 dark:text-violet-400')}
          </div>

          {/* Summary bar */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Summary</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950/20 p-4">
                <p className="text-xs text-blue-600 dark:text-blue-400">Total Assets</p>
                <p className="text-lg font-bold text-blue-700 dark:text-blue-300 mt-1">{formatCurrency(Math.abs(totalAssets))}</p>
              </div>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-4">
                <p className="text-xs text-amber-600 dark:text-amber-400">Total Liabilities</p>
                <p className="text-lg font-bold text-amber-700 dark:text-amber-300 mt-1">{formatCurrency(Math.abs(totalLiabilities))}</p>
              </div>
              <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 p-4">
                <p className="text-xs text-violet-600 dark:text-violet-400">Total Equity</p>
                <p className="text-lg font-bold text-violet-700 dark:text-violet-300 mt-1">{formatCurrency(Math.abs(totalEquity))}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
