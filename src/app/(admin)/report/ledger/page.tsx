'use client'
import { formatCurrency } from '@/lib/formatters'
import { StatCard } from '@/components/ui'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, Download, Loader2, AlertTriangle } from 'lucide-react'
import DatePicker from '@/components/form/input/DatePicker'

interface LedgerRow {
  entryNumber: string
  entryDate: string
  entryDescription: string
  accountCode: string
  accountName: string
  lineDescription: string
  debitAmount: number
  creditAmount: number
  vatAmount: number
  costCenterId: number | null
  businessPartnerId: number | null
  lineType: 'normal' | 'tax' | 'payment'
  costCenterName: string | null
  partnerName: string | null
}

interface AccountOption {
  code: string
  name: string
}

interface CostCenterOption {
  id: number
  code: string
  name: string
}

interface PartnerOption {
  id: number
  code: string
  name: string
  type: string
}

const lineTypeBadge: Record<string, string> = {
  normal: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  tax: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
  payment: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
}


export default function LedgerPage() {
  const today = new Date().toISOString().split('T')[0]
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

  const [allRows, setAllRows] = useState<LedgerRow[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([])
  const [partners, setPartners] = useState<PartnerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [startDate, setStartDate] = useState(firstDay)
  const [endDate, setEndDate] = useState(today)
  const [selectedAccount, setSelectedAccount] = useState<string>('')
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>('')
  const [selectedPartner, setSelectedPartner] = useState<string>('')
  const [selectedLineType, setSelectedLineType] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ startDate, endDate })
      if (selectedAccount) params.set('accountCode', selectedAccount)
      if (selectedCostCenter) params.set('costCenterId', selectedCostCenter)
      if (selectedPartner) params.set('businessPartnerId', selectedPartner)
      if (selectedLineType) params.set('lineType', selectedLineType)
      const [ledgerRes, acctRes, ccRes, partnerRes] = await Promise.all([
        fetch(`/api/reports/ledger?${params}`),
        fetch('/api/accounts'),
        fetch('/api/cost-centers'),
        fetch('/api/partners'),
      ])

      if (!ledgerRes.ok) throw new Error('Failed to fetch ledger')
      const ledgerJson = await ledgerRes.json()
      setAllRows(ledgerJson.data || ledgerJson)

      if (acctRes.ok) {
        const acctJson = await acctRes.json()
        const acctData = acctJson.data || acctJson
        setAccounts(acctData.map((a: any) => ({ code: a.code, name: a.name })))
      }
      if (ccRes.ok) {
        const ccJson = await ccRes.json()
        const ccData = ccJson.data || ccJson
        setCostCenters(ccData.map((c: any) => ({ id: c.id, code: c.code, name: c.name })))
      }
      if (partnerRes.ok) {
        const pJson = await partnerRes.json()
        const pData = pJson.data || pJson
        setPartners(pData.map((p: any) => ({ id: p.id, code: p.code, name: p.name, type: p.type })))
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load ledger')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, selectedAccount, selectedCostCenter, selectedPartner, selectedLineType])

  const handleExport = (format: 'csv' | 'xls') => {
    window.open(`/api/reports/export/ledger?format=${format}&startDate=${startDate}&endDate=${endDate}`, '_blank')
  }

  useEffect(() => { fetchData() }, [fetchData])

  // Build running balance per account
  const enrichedRows = useMemo(() => {
    // Group by account and compute running balance
    const accountBalances: Record<string, number> = {}
    const result: (LedgerRow & { runningBalance: number })[] = []

    const sorted = [...allRows].sort((a, b) =>
      a.accountCode.localeCompare(b.accountCode) ||
      a.entryDate.localeCompare(b.entryDate)
    )

    for (const row of sorted) {
      const prevBalance = accountBalances[row.accountCode] || 0
      const newBalance = prevBalance + row.debitAmount - row.creditAmount
      accountBalances[row.accountCode] = newBalance
      result.push({ ...row, runningBalance: newBalance })
    }

    return result
  }, [allRows])

  // Filter by selected account and search
  const filteredRows = useMemo(() => {
    let filtered = enrichedRows
    if (selectedAccount) {
      filtered = filtered.filter(r => r.accountCode === selectedAccount)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(r =>
        r.entryNumber.toLowerCase().includes(q) ||
        r.entryDescription.toLowerCase().includes(q) ||
        r.lineDescription.toLowerCase().includes(q) ||
        r.accountName.toLowerCase().includes(q)
      )
    }
    return filtered
  }, [enrichedRows, selectedAccount, searchQuery])

  const totalDebits = filteredRows.reduce((s, r) => s + r.debitAmount, 0)
  const totalCredits = filteredRows.reduce((s, r) => s + r.creditAmount, 0)

  // Distinct account codes for the dropdown from enriched data
  const accountOptions = useMemo(() => {
    const codes = new Set(enrichedRows.map(r => r.accountCode))
    return accounts.filter(a => codes.has(a.code))
  }, [accounts, enrichedRows])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">General Ledger</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">View detailed account transactions and balances from posted entries.</p>
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

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Account</label>
          <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 min-w-[200px]">
            <option value="">All Accounts</option>
            {accountOptions.map(a => (
              <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Cost Center</label>
          <select value={selectedCostCenter} onChange={e => setSelectedCostCenter(e.target.value)}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 min-w-[180px]">
            <option value="">All Cost Centers</option>
            {costCenters.map(c => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Partner</label>
          <select value={selectedPartner} onChange={e => setSelectedPartner(e.target.value)}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 min-w-[180px]">
            <option value="">All Partners</option>
            {partners.map(p => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Line Type</label>
          <select value={selectedLineType} onChange={e => setSelectedLineType(e.target.value)}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 min-w-[140px]">
            <option value="">All Types</option>
            <option value="normal">Normal</option>
            <option value="tax">Tax</option>
            <option value="payment">Payment</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">From</label>
          <DatePicker value={startDate} onChange={setStartDate} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">To</label>
          <DatePicker value={endDate} onChange={setEndDate} />
        </div>
        <div className="relative min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Search</label>
          <Search className="absolute left-3 top-[40px] -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search entries..."
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-9 pr-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
        </div>
      </div>

      {/* Summary */}
      {!loading && !error && filteredRows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Entries', value: filteredRows.length },
            { label: 'Total Debits', value: totalDebits },
            { label: 'Total Credits', value: totalCredits },
            { label: 'Net Difference', value: Math.abs(totalDebits - totalCredits) },
          ].map(s => (
            <StatCard label={s.label} value={s.label === 'Total Entries' ? s.value : formatCurrency(s.value)} valueClass={`text-lg font-semibold ${s.label === 'Total Debits' ? 'text-green-600' : s.label === 'Total Credits' ? 'text-red-600' : 'text-gray-900 dark:text-white'}`} />
          ))}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading ledger...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 p-5 text-center">
          <AlertTriangle className="w-6 h-6 mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <button onClick={fetchData} className="mt-3 text-xs font-medium text-red-600 hover:text-red-700 underline">Retry</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredRows.length === 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">No ledger entries found for the selected criteria. Try adjusting your filters or posting some entries first.</p>
        </div>
      )}

      {/* Ledger Table */}
      {!loading && !error && filteredRows.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Entry #</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Account</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Debit</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Credit</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredRows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="py-2.5 px-4 text-sm text-gray-900 dark:text-white whitespace-nowrap">{row.entryDate}</td>
                    <td className="py-2.5 px-4 text-sm font-mono text-brand-600 dark:text-brand-400 whitespace-nowrap">{row.entryNumber}</td>
                    <td className="py-2.5 px-4 text-sm whitespace-nowrap">
                      <span className="font-mono text-xs text-gray-500">{row.accountCode}</span>
                      <span className="ml-1.5 text-gray-900 dark:text-white">{row.accountName}</span>
                      <span className={`ml-1.5 inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full ${lineTypeBadge[row.lineType] || lineTypeBadge.normal}`}>
                        {(row.lineType || 'normal').charAt(0).toUpperCase() + (row.lineType || 'normal').slice(1)}
                      </span>
                      {row.partnerName && (
                        <span className="ml-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          {row.partnerName}
                        </span>
                      )}
                      {row.costCenterName && (
                        <span className="ml-1.5 text-[10px] font-medium text-indigo-500 dark:text-indigo-400">
                          {row.costCenterName}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                      {row.lineDescription || row.entryDescription}
                    </td>
                    <td className="py-2.5 px-4 text-sm text-right text-green-600 dark:text-green-400 whitespace-nowrap">
                      {row.debitAmount > 0 ? formatCurrency(row.debitAmount) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-sm text-right text-red-600 dark:text-red-400 whitespace-nowrap">
                      {row.creditAmount > 0 ? formatCurrency(row.creditAmount) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-sm text-right font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {formatCurrency(row.runningBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
