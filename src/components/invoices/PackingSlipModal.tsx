'use client'
import { useState, useEffect } from 'react'
import { Loader2, Printer, Package, X } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/formatters'

interface PackingLine {
  productId: number
  productCode: string
  productName: string
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

interface PackingSlipData {
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  partnerName: string
  warehouseName: string | null
  company: { name?: string; address?: string; phone?: string } | null
  lines: PackingLine[]
}

interface Props {
  invoiceId: number
  onClose: () => void
}

export default function PackingSlipModal({ invoiceId, onClose }: Props) {
  const [data, setData] = useState<PackingSlipData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Reset transient state when a different invoice is opened (loading is
  // intentionally not reset synchronously in the effect — it flips back to
  // true by keying the modal per invoice in the parent).

  useEffect(() => {
    let cancelled = false
    fetch(`/api/invoices/${invoiceId}/packing-slip`)
      .then(res => res.json())
      .then(json => {
        if (cancelled) return
        if (!json.success) throw new Error(json.error || 'Failed to load packing slip')
        setData(json.data)
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Failed to load packing slip')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [invoiceId])

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-500" /> Packing Slip
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-medium hover:bg-brand-600 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto" id="packing-slip-print">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Generating packing slip...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <button onClick={onClose} className="mt-3 text-sm font-medium text-brand-500">Close</button>
            </div>
          ) : data ? (
            <div className="space-y-5 print:space-y-4">
              {/* Company + document header */}
              <div className="flex items-start justify-between border-b-2 border-gray-200 dark:border-gray-700 pb-4">
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{data.company?.name || 'Company'}</p>
                  {data.company?.address && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{data.company.address}</p>}
                  {data.company?.phone && <p className="text-xs text-gray-500 dark:text-gray-400">{data.company.phone}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 uppercase font-medium">Packing Slip</p>
                  <p className="text-base font-mono font-semibold text-brand-600 dark:text-brand-400">{data.invoiceNumber}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Invoice date: {formatDate(data.invoiceDate)}</p>
                </div>
              </div>

              {/* Ship to */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium mb-1">Ship To</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{data.partnerName}</p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium mb-1">From Warehouse</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{data.warehouseName || '—'}</p>
                </div>
              </div>

              {/* Items table */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">#</th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Product</th>
                      <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Qty</th>
                      <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Unit Price</th>
                      <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {data.lines.length === 0 ? (
                      <tr><td colSpan={5} className="py-6 text-center text-sm text-gray-400">No stock items on this invoice.</td></tr>
                    ) : data.lines.map((l, i) => (
                      <tr key={i}>
                        <td className="py-2.5 px-4 text-xs text-gray-400">{i + 1}</td>
                        <td className="py-2.5 px-4">
                          <p className="text-sm text-gray-900 dark:text-white">{l.productName || l.description}</p>
                          {l.productCode && <p className="text-[11px] text-gray-400 font-mono">{l.productCode}</p>}
                        </td>
                        <td className="py-2.5 px-4 text-right text-sm text-gray-900 dark:text-white">{l.quantity}</td>
                        <td className="py-2.5 px-4 text-right text-sm text-gray-600 dark:text-gray-400">{formatCurrency(l.unitPrice)}</td>
                        <td className="py-2.5 px-4 text-right text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(l.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Packed-by line */}
              <div className="flex items-end justify-between pt-4 print:pt-6">
                <div className="text-xs text-gray-400">Items listed are packed and ready for shipment.</div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 mb-8 print:mb-10">Signature</p>
                  <div className="w-40 border-t border-gray-300 dark:border-gray-600" />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
