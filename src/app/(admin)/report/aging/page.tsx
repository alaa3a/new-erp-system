'use client'
import { formatNumber } from '@/lib/formatters'
import { formatCurrency } from '@/lib/formatters'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Download, Loader2, AlertTriangle, Users, DollarSign, Package,
} from 'lucide-react'


interface AgingPartner {
  id: number
  code: string
  name: string
  type: string
  current: number
  days1_30: number
  days31_60: number
  days61_90: number
  days91_180: number
  days180_plus: number
  totalDue: number
}

interface OverdueItem {
  id: number
  code: string
  name: string
  invoiceId: number
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  balance: number
  daysOverdue: number
}

interface InventoryItem {
  code: string
  name: string
  warehouseName: string
  quantity: number
  averageCost: number
  totalValue: number
}

interface TaxSummaryItem {
  vatCodeId: number | null
  taxCode: string | null
  taxName: string | null
  taxRate: number
  taxType: string | null
  totalVat: number
}

interface AgingData {
  partnerAging: AgingPartner[]
  overdueReceivables: OverdueItem[]
  overduePayables: OverdueItem[]
  inventoryValuation: InventoryItem[]
  taxSummary: TaxSummaryItem[]
}

type Tab = 'receivables' | 'payables' | 'inventory' | 'tax'

export default function AgingReportPage() {
  const [data, setData] = useState<AgingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('receivables')


  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/reports/aging')
      if (!res.ok) throw new Error('Failed to load aging report')
      const json = await res.json(); if (json.success) setData(json.data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleExport = (format: 'csv' | 'xls') => {
    window.open(`/api/reports/export/aging?format=${format}`, '_blank')
  }

  useEffect(() => { fetchData() }, [fetchData])

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = useMemo(() => [
    { key: 'receivables', label: 'Receivables Aging', icon: <DollarSign className="w-4 h-4" /> },
    { key: 'payables', label: 'Payables Aging', icon: <DollarSign className="w-4 h-4" /> },
    { key: 'inventory', label: 'Inventory Valuation', icon: <Package className="w-4 h-4" /> },
    { key: 'tax', label: 'Tax Summary', icon: <DollarSign className="w-4 h-4" /> },
  ], [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Aging & Analysis Report</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Partner aging, inventory valuation, and tax summary.</p>
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

      {/* Tab bar */}
      <div className="flex items-center gap-1 flex-wrap rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1.5">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Loading / Error */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading report data...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={fetchData} className="mt-3 text-sm font-medium text-brand-500">Try again</button>
        </div>
      ) : !data ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-gray-400 dark:text-gray-500">No data available.</p>
        </div>
      ) : (
        <>
          {/* ─── RECEIVABLES AGING ─── */}
          {activeTab === 'receivables' && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {(() => {
                  const totals = data.partnerAging.reduce((acc, p) => ({
                    current: acc.current + p.current,
                    d1_30: acc.d1_30 + p.days1_30,
                    d31_60: acc.d31_60 + p.days31_60,
                    d61_90: acc.d61_90 + p.days61_90,
                    d90plus: acc.d90plus + p.days91_180 + p.days180_plus,
                    total: acc.total + p.totalDue,
                  }), { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 })
                  return [
                    { label: 'Current', value: totals.current, color: 'text-green-600', bg: 'bg-green-50' },
                    { label: '1-30 days', value: totals.d1_30, color: 'text-yellow-600', bg: 'bg-yellow-50' },
                    { label: '31-60 days', value: totals.d31_60, color: 'text-orange-600', bg: 'bg-orange-50' },
                    { label: '61-90 days', value: totals.d61_90, color: 'text-red-600', bg: 'bg-red-50' },
                    { label: '90+ days', value: totals.d90plus, color: 'text-red-700', bg: 'bg-red-100' },
                  ].map(b => (
                    <div key={b.label} className={`rounded-xl ${b.bg} dark:bg-gray-800 p-3`}>
                      <p className={`text-[11px] font-medium ${b.color}`}>{b.label}</p>
                      <p className={`mt-1 text-base font-bold ${b.color}`}>{formatCurrency(b.value)}</p>
                    </div>
                  ))
                })()}
              </div>

              {/* Partner aging table */}
              {data.partnerAging.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center">
                  <Users className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">No outstanding receivables. All customer invoices are paid.</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Partner</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Current</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">1-30</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">31-60</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">61-90</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">91-180</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">180+</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Total Due</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {data.partnerAging.map(p => (
                          <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                            <td className="py-2.5 px-4 text-sm font-medium text-gray-900 dark:text-white">
                              <div className="flex items-center gap-2">
                                <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <div>
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</p>
                                  <p className="text-xs text-gray-400">{p.code}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-sm text-right text-green-600 font-medium">{formatCurrency(p.current)}</td>
                            <td className="py-2.5 px-4 text-sm text-right text-yellow-600">{p.days1_30 > 0 ? formatCurrency(p.days1_30) : '-'}</td>
                            <td className="py-2.5 px-4 text-sm text-right text-orange-600">{p.days31_60 > 0 ? formatCurrency(p.days31_60) : '-'}</td>
                            <td className="py-2.5 px-4 text-sm text-right text-red-500">{p.days61_90 > 0 ? formatCurrency(p.days61_90) : '-'}</td>
                            <td className="py-2.5 px-4 text-sm text-right text-red-600">{p.days91_180 > 0 ? formatCurrency(p.days91_180) : '-'}</td>
                            <td className="py-2.5 px-4 text-sm text-right text-red-700 font-medium">{p.days180_plus > 0 ? formatCurrency(p.days180_plus) : '-'}</td>
                            <td className="py-2.5 px-4 text-sm text-right font-bold text-gray-900 dark:text-white">{formatCurrency(p.totalDue)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 font-semibold">
                          <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">Total</td>
                          <td className="py-3 px-4 text-sm text-right text-green-600">{formatCurrency(data.partnerAging.reduce((s, p) => s + p.current, 0))}</td>
                          <td className="py-3 px-4 text-sm text-right text-yellow-600">{formatCurrency(data.partnerAging.reduce((s, p) => s + p.days1_30, 0))}</td>
                          <td className="py-3 px-4 text-sm text-right text-orange-600">{formatCurrency(data.partnerAging.reduce((s, p) => s + p.days31_60, 0))}</td>
                          <td className="py-3 px-4 text-sm text-right text-red-500">{formatCurrency(data.partnerAging.reduce((s, p) => s + p.days61_90, 0))}</td>
                          <td className="py-3 px-4 text-sm text-right text-red-600">{formatCurrency(data.partnerAging.reduce((s, p) => s + p.days91_180, 0))}</td>
                          <td className="py-3 px-4 text-sm text-right text-red-700">{formatCurrency(data.partnerAging.reduce((s, p) => s + p.days180_plus, 0))}</td>
                          <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white">{formatCurrency(data.partnerAging.reduce((s, p) => s + p.totalDue, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── PAYABLES AGING ─── */}
          {activeTab === 'payables' && (
            <div className="space-y-4">
              {data.overduePayables.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center">
                  <Users className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">No overdue payables. All vendor invoices are paid on time.</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">Overdue Payables</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Vendor invoices past their due date</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50 dark:bg-gray-900/50">
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Vendor</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Invoice</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Due</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Balance</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Days Overdue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {data.overduePayables.map(item => (
                          <tr key={item.invoiceId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                            <td className="py-2.5 px-4 text-sm font-medium text-gray-900 dark:text-white">{item.name}</td>
                            <td className="py-2.5 px-4 text-sm font-mono text-brand-600 dark:text-brand-400">{item.invoiceNumber}</td>
                            <td className="py-2.5 px-4 text-sm text-gray-500 dark:text-gray-400">{item.invoiceDate}</td>
                            <td className="py-2.5 px-4 text-sm text-gray-500 dark:text-gray-400">{item.dueDate}</td>
                            <td className="py-2.5 px-4 text-sm text-right font-medium text-red-600">{formatCurrency(item.balance)}</td>
                            <td className="py-2.5 px-4 text-sm text-right">
                              <span className="inline-flex text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400">
                                {item.daysOverdue} days
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50 dark:bg-gray-900/50 font-semibold">
                          <td colSpan={4} className="py-3 px-4 text-sm text-gray-900 dark:text-white">Total</td>
                          <td className="py-3 px-4 text-sm text-right text-red-600">{formatCurrency(data.overduePayables.reduce((s, i) => s + i.balance, 0))}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── INVENTORY VALUATION ─── */}
          {activeTab === 'inventory' && (
            <div className="space-y-4">
              {data.inventoryValuation.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center">
                  <Package className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">No inventory items with stock. Add products and post inventory movements first.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Total Items</p>
                      <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{data.inventoryValuation.length}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Total Units</p>
                      <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                        {formatNumber(data.inventoryValuation.reduce((s, i) => s + i.quantity, 0))}
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Total Value</p>
                      <p className="mt-1 text-xl font-bold text-brand-600 dark:text-brand-400">
                        {formatCurrency(data.inventoryValuation.reduce((s, i) => s + i.totalValue, 0))}
                      </p>
                    </div>
                  </div>
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
                          {data.inventoryValuation.map((item, i) => (
                            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                              <td className="py-2.5 px-4 text-sm font-medium text-gray-900 dark:text-white">{item.name}</td>
                              <td className="py-2.5 px-4 text-sm font-mono text-gray-500">{item.code}</td>
                              <td className="py-2.5 px-4 text-sm text-gray-500 dark:text-gray-400">{item.warehouseName}</td>
                              <td className="py-2.5 px-4 text-sm text-right text-gray-900 dark:text-white">{formatNumber(item.quantity)}</td>
                              <td className="py-2.5 px-4 text-sm text-right text-gray-600 dark:text-gray-400">{formatCurrency(item.averageCost)}</td>
                              <td className="py-2.5 px-4 text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(item.totalValue)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-200 bg-gray-50 dark:bg-gray-900/50 font-semibold">
                            <td colSpan={3} className="py-3 px-4 text-sm text-gray-900 dark:text-white">Total</td>
                            <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white">{formatNumber(data.inventoryValuation.reduce((s, i) => s + i.quantity, 0))}</td>
                            <td></td>
                            <td className="py-3 px-4 text-sm text-right text-brand-600 dark:text-brand-400">{formatCurrency(data.inventoryValuation.reduce((s, i) => s + i.totalValue, 0))}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── TAX SUMMARY ─── */}
          {activeTab === 'tax' && (
            <div className="space-y-4">
              {data.taxSummary.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center">
                  <DollarSign className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">No VAT transactions recorded yet. Post invoices with VAT to see the summary.</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">VAT Summary</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Output (collected) vs Input (recoverable) VAT</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50 dark:bg-gray-900/50">
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Tax Code</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Name</th>
                          <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Rate</th>
                          <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Total VAT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {data.taxSummary.map((t, i) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                            <td className="py-2.5 px-4 text-sm font-mono text-brand-600 dark:text-brand-400">{t.taxCode || 'N/A'}</td>
                            <td className="py-2.5 px-4 text-sm text-gray-900 dark:text-white">{t.taxName || 'Unmapped'}</td>
                            <td className="py-2.5 px-4 text-sm text-center text-gray-500 dark:text-gray-400">{t.taxRate}%</td>
                            <td className="py-2.5 px-4 text-sm text-center">
                              <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${
                                t.taxType === 'output' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400' : 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400'
                              }`}>{t.taxType === 'output' ? 'Out' : 'In'}</span>
                            </td>
                            <td className="py-2.5 px-4 text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(t.totalVat)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50 dark:bg-gray-900/50 font-semibold">
                          <td colSpan={4} className="py-3 px-4 text-sm text-gray-900 dark:text-white">Total VAT</td>
                          <td className="py-3 px-4 text-sm text-right text-brand-600 dark:text-brand-400">
                            {formatCurrency(data.taxSummary.reduce((s, t) => s + t.totalVat, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
