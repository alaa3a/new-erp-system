'use client'
import { formatCurrency } from '@/lib/formatters'

import { useState, useEffect, useCallback } from 'react'
import { Download, Loader2, AlertTriangle } from 'lucide-react'

interface TBRow {
  accountCode: string
  accountName: string
  accountType: string
  totalDebit: number
  totalCredit: number
}

interface TBResult {
  rows: TBRow[]
  totalDebit: number
  totalCredit: number
}


export default function TrialBalancePage() {
  const [data, setData] = useState<TBResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const handleExport = (format: 'csv' | 'xls') => {
    window.open(`/api/reports/export/trial-balance?format=${format}`, '_blank')
  }

  const fetchTB = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/reports/trial-balance')
      if (!res.ok) throw new Error('Failed to fetch trial balance')
      const json = await res.json()
      setData(json.data || json)
    } catch (err: any) {
      setError(err?.message || 'Failed to load trial balance')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTB() }, [fetchTB])

  const totalDebits = data?.totalDebit ?? 0
  const totalCredits = data?.totalCredit ?? 0
  const inBalance = totalDebits === totalCredits
  const rows = data?.rows ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Trial Balance</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Real-time balance from all posted journal entries.</p>
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

      {/* Balance indicator */}
      {!loading && !error && (
        <div className={`rounded-2xl border p-5 ${inBalance ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20' : 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${inBalance ? 'bg-green-500' : 'bg-red-500'}`} />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {inBalance ? 'Trial Balance is in balance ✓' : 'Trial Balance is out of balance ✗'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Total Debits: {formatCurrency(totalDebits)} | Total Credits: {formatCurrency(totalCredits)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading trial balance...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 p-5 text-center">
          <AlertTriangle className="w-6 h-6 mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <button onClick={fetchTB} className="mt-3 text-xs font-medium text-red-600 hover:text-red-700 underline">Retry</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && rows.length === 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">No posted entries yet. Post some invoices or journal entries to see the trial balance.</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && rows.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Code</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Account</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Debit</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="py-2.5 px-4 text-sm font-mono text-brand-600 dark:text-brand-400">{row.accountCode}</td>
                    <td className="py-2.5 px-4 text-sm font-medium text-gray-900 dark:text-white">{row.accountName}</td>
                    <td className="py-2.5 px-4 text-sm text-gray-500 dark:text-gray-400 capitalize">{row.accountType}</td>
                    <td className="py-2.5 px-4 text-sm text-right text-gray-900 dark:text-white">
                      {row.totalDebit > 0 ? formatCurrency(row.totalDebit) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-sm text-right text-gray-900 dark:text-white">
                      {row.totalCredit > 0 ? formatCurrency(row.totalCredit) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 font-semibold">
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-white" colSpan={3}>Total</td>
                  <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white">{formatCurrency(totalDebits)}</td>
                  <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white">{formatCurrency(totalCredits)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
