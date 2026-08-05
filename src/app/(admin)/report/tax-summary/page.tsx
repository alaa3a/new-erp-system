'use client'
import { formatDate } from '@/lib/formatters'
import { formatCurrency } from '@/lib/formatters'
import { StatCard } from '@/components/ui'

import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { Download, Loader2, AlertTriangle, DollarSign, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import DatePicker from '@/components/form/input/DatePicker'


interface TaxRow {
  vatCode: string
  vatName: string
  rate: number
  taxableAmount: number
  taxAmount: number
  invoiceCount: number
  groupName: string
  filingPeriod: string
}

interface TaxDetailRow {
  vatCodeId: number
  taxCode: string
  entryNumber: string
  entryDate: string
  entryDescription: string
  lineDescription: string
  supplierName: string | null
  supplierTaxId: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  taxDetailsJson: string | null
  vatAmount: number
}

function GroupRows({
  bucket,
  detailsMap,
  expandedCode,
  onToggle,
}: {
  bucket: { groupName: string; rows: TaxRow[]; taxable: number; tax: number }
  detailsMap: Record<string, TaxDetailRow[]>
  expandedCode: string | null
  onToggle: (code: string) => void
}) {
  return (
    <>
      <tr className="bg-gray-50/70 dark:bg-gray-800/40">
        <td colSpan={7} className="py-2 px-4 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          {bucket.groupName}
        </td>
      </tr>
      {bucket.rows.map((t, i) => {
        const details = detailsMap[t.vatCode] || []
        const isOpen = expandedCode === t.vatCode
        return (
          <Fragment key={i}>
            <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <td className="py-2.5 px-2 text-left">
                <button
                  type="button"
                  onClick={() => onToggle(t.vatCode)}
                  disabled={details.length === 0}
                  className={`p-1 rounded-md transition-colors ${details.length === 0 ? 'text-gray-200 dark:text-gray-700 cursor-default' : 'text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30'}`}
                  title={details.length > 0 ? `${details.length} document${details.length !== 1 ? 's' : ''}` : 'No captured details'}
                >
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </td>
              <td className="py-2.5 px-3 text-sm font-mono text-brand-600 dark:text-brand-400">{t.vatCode}</td>
              <td className="py-2.5 px-3 text-sm text-gray-900 dark:text-white">{t.vatName}</td>
              <td className="py-2.5 px-3 text-sm text-center">
                <span className="inline-flex text-xs font-medium px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-300">{t.rate}%</span>
              </td>
              <td className="py-2.5 px-3 text-sm text-right text-gray-600 dark:text-gray-400">{formatCurrency(t.taxableAmount)}</td>
              <td className="py-2.5 px-3 text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(t.taxAmount)}</td>
              <td className="py-2.5 px-3 text-sm text-right text-gray-500 dark:text-gray-400">{t.invoiceCount}</td>
            </tr>
            {isOpen && (
              <tr className="bg-gray-50/60 dark:bg-gray-800/30">
                <td colSpan={7} className="py-0 px-4">
                  {details.length === 0 ? (
                    <p className="py-3 text-xs text-gray-400">No captured detail documents for this tax code in the period.</p>
                  ) : (
                    <div className="overflow-x-auto py-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Entry</th>
                            <th className="text-left py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Date</th>
                            <th className="text-left py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Supplier</th>
                            <th className="text-left py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Tax ID</th>
                            <th className="text-left py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Invoice #</th>
                            <th className="text-left py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Invoice Date</th>
                            <th className="text-right py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">VAT Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {details.map((d, j) => (
                            <tr key={j}>
                              <td className="py-1.5 px-2 font-mono text-gray-700 dark:text-gray-300">{d.entryNumber}</td>
                              <td className="py-1.5 px-2 text-gray-500 dark:text-gray-400">{d.entryDate}</td>
                              <td className="py-1.5 px-2 text-gray-700 dark:text-gray-300">{d.supplierName || d.lineDescription || '—'}</td>
                              <td className="py-1.5 px-2 text-gray-500 dark:text-gray-400">{d.supplierTaxId || '—'}</td>
                              <td className="py-1.5 px-2 text-gray-700 dark:text-gray-300">{d.invoiceNumber || '—'}</td>
                              <td className="py-1.5 px-2 text-gray-500 dark:text-gray-400">{d.invoiceDate || '—'}</td>
                              <td className="py-1.5 px-2 text-right font-medium text-gray-700 dark:text-gray-300">{formatCurrency(d.vatAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {details.some(d => {
                        try { return Object.keys(JSON.parse(d.taxDetailsJson || '{}')).length > 0 } catch { return false }
                      }) && (
                        <div className="mt-1.5 space-y-0.5">
                          {details.map((d, j) => {
                            let extras: [string, unknown][] = []
                            try { extras = Object.entries(JSON.parse(d.taxDetailsJson || '{}')) } catch { /* ignore */ }
                            if (extras.length === 0) return null
                            return (
                              <p key={j} className="text-[11px] text-gray-500 dark:text-gray-400">
                                <FileText className="inline w-3 h-3 mr-1 text-gray-400" />
                                <span className="font-mono">{d.entryNumber}</span>: {extras.map(([k, v]) => `${k}: ${v}`).join(' · ')}
                              </p>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )}
          </Fragment>
        )
      })}
      <tr className="bg-gray-50 dark:bg-gray-900/50">
        <td colSpan={3} className="py-2 px-4 text-xs font-medium text-gray-500 dark:text-gray-400">Group subtotal</td>
        <td className="py-2 px-4 text-sm text-right text-gray-700 dark:text-gray-300">{formatCurrency(bucket.taxable)}</td>
        <td className="py-2 px-4 text-sm text-right text-brand-600 dark:text-brand-400">{formatCurrency(bucket.tax)}</td>
        <td className="py-2 px-4 text-sm text-right text-gray-500 dark:text-gray-400">{bucket.rows.reduce((s, r) => s + r.invoiceCount, 0)}</td>
      </tr>
    </>
  )
}

export default function TaxSummaryPage() {
  const [rows, setRows] = useState<TaxRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [groupFilter, setGroupFilter] = useState('all')
  const [detailsMap, setDetailsMap] = useState<Record<string, TaxDetailRow[]>>({})
  const [expandedCode, setExpandedCode] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const qs = params.toString()
      const res = await fetch(`/api/reports/tax-summary${qs ? `?${qs}` : ''}`)
      if (!res.ok) throw new Error('Failed to load tax summary')
      const json = await res.json()
      setRows(json.success ? json.data : json)
      // Captured detail documents (Phase 6) — grouped by tax code for the expandable rows
      const dRes = await fetch(`/api/reports/tax-details${qs ? `?${qs}` : ''}`)
      if (dRes.ok) {
        const dJson = await dRes.json()
        if (dJson.success) {
          const map: Record<string, TaxDetailRow[]> = {}
          for (const d of dJson.data as TaxDetailRow[]) {
            const key = d.taxCode || `code-${d.vatCodeId}`
            if (!map[key]) map[key] = []
            map[key].push(d)
          }
          setDetailsMap(map)
        }
      }
      setExpandedCode(null)
    } catch (err: any) {
      setError(err?.message || 'Failed to load tax summary')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  const handleExport = (format: 'csv' | 'xls') => {
    const params = new URLSearchParams({ format })
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    window.open(`/api/reports/export/tax-summary?${params.toString()}`, '_blank')
  }

  // Initialize date filters on the client only (avoids hydration mismatch)
  useEffect(() => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const lastDay = now.toISOString().split('T')[0]
    setStartDate(firstDay)
    setEndDate(lastDay)
  }, [])

  useEffect(() => { if (startDate && endDate) fetchData() }, [fetchData, startDate, endDate])

  const groups = useMemo(() => {
    const set = new Set<string>(['all'])
    rows.forEach(r => set.add(r.groupName || 'Ungrouped'))
    return Array.from(set)
  }, [rows])

  const filteredRows = useMemo(() => {
    if (groupFilter === 'all') return rows
    return rows.filter(r => (r.groupName || 'Ungrouped') === groupFilter)
  }, [rows, groupFilter])

  const groupedRows = useMemo(() => {
    const out: { groupName: string; rows: TaxRow[]; taxable: number; tax: number }[] = []
    for (const r of filteredRows) {
      const name = r.groupName || 'Ungrouped'
      let bucket = out.find(b => b.groupName === name)
      if (!bucket) { bucket = { groupName: name, rows: [], taxable: 0, tax: 0 }; out.push(bucket) }
      bucket.rows.push(r)
      bucket.taxable += r.taxableAmount
      bucket.tax += r.taxAmount
    }
    return out
  }, [filteredRows])

  const totalTaxable = filteredRows.reduce((s, r) => s + r.taxableAmount, 0)
  const totalTax = filteredRows.reduce((s, r) => s + r.taxAmount, 0)

  const periodLabel = `${formatDate(startDate, 'monthDay')} - ${formatDate(endDate, 'long')}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Tax Summary</h1>
          {startDate && endDate && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">VAT collected &amp; recoverable for period: {periodLabel}</p>
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
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Group</label>
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
            {groups.map(g => <option key={g} value={g}>{g === 'all' ? 'All groups' : g}</option>)}
          </select>
        </div>
      </div>

      {/* Loading / Error */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading tax summary...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={fetchData} className="mt-3 text-sm font-medium text-brand-500">Try again</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center">
          <DollarSign className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-400 dark:text-gray-500">No VAT transactions in this period. Post invoices with VAT to see the summary.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Tax Codes" value={filteredRows.length} size="lg"  />
            <StatCard label="Taxable Amount" value={formatCurrency(totalTaxable)} size="lg"  />
            <StatCard label="Total VAT" value={formatCurrency(totalTax)} size="lg" color="text-brand-600 dark:text-brand-400" />
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 dark:bg-gray-900/50">
                    <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 uppercase"></th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">VAT Code</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="text-center py-3 px-3 text-xs font-medium text-gray-500 uppercase">Rate</th>
                    <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 uppercase">Taxable Amount</th>
                    <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 uppercase">Tax Amount</th>
                    <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 uppercase">Invoices</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {groupedRows.map(bucket => (
                    <GroupRows key={bucket.groupName} bucket={bucket} detailsMap={detailsMap} expandedCode={expandedCode} onToggle={(code) => setExpandedCode(expandedCode === code ? null : code)} />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 dark:bg-gray-900/50 font-semibold">
                    <td colSpan={4} className="py-3 px-4 text-sm text-gray-900 dark:text-white">Total</td>
                    <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white">{formatCurrency(filteredRows.reduce((s, r) => s + r.taxableAmount, 0))}</td>
                    <td className="py-3 px-4 text-sm text-right text-brand-600 dark:text-brand-400">{formatCurrency(filteredRows.reduce((s, r) => s + r.taxAmount, 0))}</td>
                    <td className="py-3 px-4 text-sm text-right text-gray-500 dark:text-gray-400">{filteredRows.reduce((s, r) => s + r.invoiceCount, 0)}</td>
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
