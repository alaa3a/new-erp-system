'use client'
import { formatDate } from '@/lib/formatters'
import { formatCurrency } from '@/lib/formatters'

import { useState, useEffect, useCallback } from 'react'
import { Download, Loader2, AlertTriangle } from 'lucide-react'
import DatePicker from '@/components/form/input/DatePicker'

interface ISRow {
  accountCode: string
  accountName: string
  accountType: string
  totalDebit: number
  totalCredit: number
  netAmount: number
}


export default function IncomeStatementPage() {
  const [rows, setRows] = useState<ISRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const fetchIS = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/reports/income-statement?startDate=${startDate}&endDate=${endDate}`)
      if (!res.ok) throw new Error('Failed to fetch income statement')
      const json = await res.json()
      setRows(json.data || json)
    } catch (err: any) {
      setError(err?.message || 'Failed to load income statement')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  const handleExport = (format: 'csv' | 'xls') => {
    window.open(`/api/reports/export/income-statement?format=${format}&startDate=${startDate}&endDate=${endDate}`, '_blank')
  }

  // Initialize date filters on the client only (avoids hydration mismatch)
  useEffect(() => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const lastDay = now.toISOString().split('T')[0]
    setStartDate(firstDay)
    setEndDate(lastDay)
  }, [])

  useEffect(() => { if (startDate && endDate) fetchIS() }, [fetchIS, startDate, endDate])

  const revenueRows = rows.filter(r => r.accountType === 'revenue')
  const expenseRows = rows.filter(r => r.accountType === 'expense')

  const totalRevenue = revenueRows.reduce((s, r) => s + r.netAmount, 0)
  const totalExpenses = expenseRows.reduce((s, r) => s + Math.abs(r.netAmount), 0)
  const netIncome = totalRevenue - totalExpenses
  const netMargin = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0

  const periodLabel = `${formatDate(startDate, 'monthDay')} - ${formatDate(endDate, 'long')}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Income Statement</h1>
          {startDate && endDate && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">For period: {periodLabel}</p>
          )}
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

      {/* Date range */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">From</label>
          <DatePicker value={startDate} onChange={setStartDate} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">To</label>
          <DatePicker value={endDate} onChange={setEndDate} />
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading income statement...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 p-5 text-center">
          <AlertTriangle className="w-6 h-6 mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <button onClick={fetchIS} className="mt-3 text-xs font-medium text-red-600 hover:text-red-700 underline">Retry</button>
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-green-50 dark:bg-green-950/20">
              <h3 className="text-base font-semibold text-green-700 dark:text-green-400">Revenue</h3>
            </div>
            {revenueRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">No revenue entries for this period.</div>
            ) : (
              <div className="p-5 space-y-3">
                {revenueRows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">{r.accountName}</span>
                      <span className="ml-2 text-xs font-mono text-gray-400">{r.accountCode}</span>
                    </div>
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">{formatCurrency(r.netAmount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Total Revenue</span>
                  <span className="text-sm font-semibold text-green-600 dark:text-green-400">{formatCurrency(totalRevenue)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Expenses */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-rose-50 dark:bg-rose-950/20">
              <h3 className="text-base font-semibold text-rose-700 dark:text-rose-400">Expenses</h3>
            </div>
            {expenseRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">No expense entries for this period.</div>
            ) : (
              <div className="p-5 space-y-3">
                {expenseRows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">{r.accountName}</span>
                      <span className="ml-2 text-xs font-mono text-gray-400">{r.accountCode}</span>
                    </div>
                    <span className="text-sm font-medium text-rose-600 dark:text-rose-400">{formatCurrency(Math.abs(r.netAmount))}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Total Expenses</span>
                  <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(totalExpenses)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Net Income Summary */}
      {!loading && !error && (
        <div className={`rounded-2xl border-2 p-5 ${netIncome >= 0 ? 'border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/20' : 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20'}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {netIncome >= 0 ? 'Net Income' : 'Net Loss'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {netIncome >= 0 ? 'Revenue exceeds expenses' : 'Expenses exceed revenue'}
              </p>
            </div>
            <span className={`text-2xl font-bold ${netIncome >= 0 ? 'text-brand-700 dark:text-brand-400' : 'text-red-700 dark:text-red-400'}`}>
              {formatCurrency(Math.abs(netIncome))}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
            <span>Revenue: <strong className="text-green-600 dark:text-green-400">{formatCurrency(totalRevenue)}</strong></span>
            <span>Expenses: <strong className="text-rose-600 dark:text-rose-400">{formatCurrency(totalExpenses)}</strong></span>
            {totalRevenue > 0 && (
              <span className="font-medium text-brand-600 dark:text-brand-400">
                Net Margin: {netMargin.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
