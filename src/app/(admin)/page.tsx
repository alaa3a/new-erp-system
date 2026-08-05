'use client'
import { formatNumber } from '@/lib/formatters'
import { formatCurrency } from '@/lib/formatters'
import { StatusBadge } from '@/components/ui'

import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, DollarSign, FileText, Users,
  ShoppingCart, BarChart3, Loader2, AlertTriangle, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'



interface DashboardData {
  revenue: number
  expenses: number
  netIncome: number
  counts: {
    accounts: number
    partners: number
    products: number
    invoices: number
  }
  openInvoices: {
    id: number
    invoiceNumber: string
    type: string
    status: string
    totalAmount: number
    paidAmount: number
    balanceDue: number
    invoiceDate: string
    dueDate: string
    partnerName: string
    daysOverdue: number
  }[]
  aging: {
    current: number
    days1_30: number
    days31_60: number
    days61_90: number
    days90_plus: number
    totalDue: number
  }
  recentEntries: {
    entryNumber: string
    entryDate: string
    description: string
    totalDebit: number
    totalCredit: number
  }[]
}

const invoiceTypeLabels: Record<string, string> = {
  sales: 'Sales', purchase: 'Purchase', credit_note: 'Credit', debit_note: 'Debit',
}

const statusStyles: Record<string, string> = {
  draft: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400',
  posted: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
  partial_paid: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400',
  paid: 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  cancelled: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400',
}

const statusLabels: Record<string, string> = {
  draft: 'Draft', posted: 'Posted', partial_paid: 'Partial', paid: 'Paid', cancelled: 'Cancelled',
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/reports/dashboard')
      if (!res.ok) throw new Error('Failed to load dashboard')
      const json = await res.json(); if (json.success) setData(json.data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin mb-4" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading your dashboard...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button onClick={fetchDashboard} className="mt-3 text-sm font-medium text-brand-500 hover:text-brand-600">Try again</button>
      </div>
    )
  }

  const d = data!

  const statsCards = [
    {
      label: 'Total Revenue',
      value: formatCurrency(d.revenue),
      icon: DollarSign,
      color: 'text-green-500',
      bg: 'bg-green-50 dark:bg-green-950/50',
      trend: d.revenue > 0 ? '+12.5%' : '0%',
      up: d.revenue > d.expenses,
    },
    {
      label: 'Total Expenses',
      value: formatCurrency(d.expenses),
      icon: ShoppingCart,
      color: 'text-red-500',
      bg: 'bg-red-50 dark:bg-red-950/50',
      trend: d.expenses > 0 ? `${((d.expenses / Math.max(d.revenue, 1)) * 100).toFixed(1)}% of revenue` : '0%',
      up: false,
    },
    {
      label: 'Net Income',
      value: formatCurrency(d.netIncome),
      icon: TrendingUp,
      color: d.netIncome >= 0 ? 'text-green-500' : 'text-red-500',
      bg: d.netIncome >= 0 ? 'bg-green-50 dark:bg-green-950/50' : 'bg-red-50 dark:bg-red-950/50',
      trend: d.netIncome > 0 ? 'Profitable' : d.netIncome < 0 ? 'Loss' : 'Break-even',
      up: d.netIncome >= 0,
    },
    {
      label: 'Active Accounts',
      value: formatNumber(d.counts.accounts),
      icon: FileText,
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-950/50',
      trend: `${d.counts.invoices} invoices`,
      up: true,
    },
  ]

  const agingBuckets = [
    { label: 'Current', amount: d.aging.current, color: 'bg-green-500' },
    { label: '1-30 days', amount: d.aging.days1_30, color: 'bg-yellow-500' },
    { label: '31-60 days', amount: d.aging.days31_60, color: 'bg-orange-500' },
    { label: '61-90 days', amount: d.aging.days61_90, color: 'bg-red-500' },
    { label: '90+ days', amount: d.aging.days90_plus, color: 'bg-red-700' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">ERP Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Real-time business overview. {d.counts.invoices} invoices processed across {d.counts.partners} partners.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 transition-all hover:shadow-lg hover:-translate-y-0.5 duration-200">
            <div className="flex items-center justify-between">
              <div className={`rounded-xl p-2.5 ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                stat.up ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400' : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
              }`}>
                {stat.trend}
              </span>
            </div>
            <p className="mt-4 text-2xl font-semibold text-gray-900 dark:text-white">{stat.value}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Aging Summary */}
        <div className="lg:col-span-1 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Aging Summary</h2>
            <Link href="/report/aging" className="text-xs font-medium text-brand-500 hover:text-brand-600 flex items-center gap-1">
              Details <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {d.aging.totalDue === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No outstanding invoices.</p>
          ) : (
            <div className="space-y-3">
              {agingBuckets.map(b => (
                <div key={b.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${b.color}`} />
                    <span className="text-gray-600 dark:text-gray-400">{b.label}</span>
                  </div>
                  <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(b.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Total Due</span>
                <span className="text-sm font-bold text-brand-600 dark:text-brand-400">{formatCurrency(d.aging.totalDue)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Open Invoices */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Open Invoices</h2>
            <Link href="/invoice/sales" className="text-xs font-medium text-brand-500 hover:text-brand-600">View All</Link>
          </div>
          {d.openInvoices.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No open invoices. All invoices are paid or cancelled.</p>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="text-left pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Invoice</th>
                    <th className="text-left pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Partner</th>
                    <th className="text-right pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Balance</th>
                    <th className="text-center pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                    <th className="text-right pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {d.openInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-3 text-sm font-mono font-medium text-brand-600 dark:text-brand-400">{inv.invoiceNumber}</td>
                      <td className="py-3 text-sm text-gray-600 dark:text-gray-400">{inv.partnerName}</td>
                      <td className="py-3 text-sm text-right font-medium text-gray-900 dark:text-white">{formatCurrency(inv.balanceDue)}</td>
                      <td className="py-3 text-center">
                        <StatusBadge label={statusLabels[inv.status]} color={statusStyles[inv.status]} />
                      </td>
                      <td className="py-3 text-sm text-right">
                        {inv.daysOverdue > 0 ? (
                          <span className="text-red-500 font-medium">{inv.daysOverdue}d overdue</span>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">{inv.dueDate}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions & Recent Entries */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Link href="/accounting/entries" className="w-full flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <BarChart3 className="w-4 h-4 text-brand-500" /> New Journal Entry
            </Link>
            <Link href="/invoice/sales" className="w-full flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <FileText className="w-4 h-4 text-brand-500" /> Create Sales Invoice
            </Link>
            <Link href="/business-partners" className="w-full flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <Users className="w-4 h-4 text-brand-500" /> Add Partner
            </Link>
          </div>

          {/* Summary stats */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/20 p-3">
              <p className="text-xs text-blue-600 dark:text-blue-400">Partners</p>
              <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{formatNumber(d.counts.partners)}</p>
            </div>
            <div className="rounded-xl bg-purple-50 dark:bg-purple-950/20 p-3">
              <p className="text-xs text-purple-600 dark:text-purple-400">Products</p>
              <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{formatNumber(d.counts.products)}</p>
            </div>
          </div>
        </div>

        {/* Recent Entries */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Recent Journal Entries</h2>
            <Link href="/accounting/entries" className="text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors">View All</Link>
          </div>
          {d.recentEntries.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No posted entries yet.</p>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="text-left pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Entry #</th>
                    <th className="text-left pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                    <th className="text-left pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
                    <th className="text-right pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Debit</th>
                    <th className="text-right pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {d.recentEntries.map((e, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-3 text-sm font-mono font-medium text-brand-600 dark:text-brand-400">{e.entryNumber}</td>
                      <td className="py-3 text-sm text-gray-500 dark:text-gray-400">{e.entryDate}</td>
                      <td className="py-3 text-sm text-gray-600 dark:text-gray-400 truncate max-w-[200px]">{e.description}</td>
                      <td className="py-3 text-sm text-right text-green-600 dark:text-green-400">{formatCurrency(e.totalDebit)}</td>
                      <td className="py-3 text-sm text-right text-red-600 dark:text-red-400">{formatCurrency(e.totalCredit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
