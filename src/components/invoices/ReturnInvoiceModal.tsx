'use client'
import { useState, useEffect } from 'react'
import { Loader2, Undo2, X } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import Button from '@/components/ui/button/Button'

interface InvoiceLine {
  id: number
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
  lineType: string
}

interface Props {
  invoice: { id: number; invoiceNumber: string; partnerName: string } | null
  onClose: () => void
  onSuccess: () => void
}

export default function ReturnInvoiceModal({ invoice, onClose, onSuccess }: Props) {
  const [lines, setLines] = useState<InvoiceLine[]>([])
  const [qty, setQty] = useState<Record<number, number>>({})
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!invoice) return
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/invoices/${invoice.id}`)
      .then(res => res.json())
      .then(json => {
        if (cancelled) return
        if (!json.success) throw new Error(json.error || 'Failed to load invoice')
        const ls: InvoiceLine[] = (json.data?.lines || []) as InvoiceLine[]
        setLines(ls)
        const initial: Record<number, number> = {}
        for (const l of ls) initial[l.id] = Math.min(l.quantity, 1)
        setQty(initial)
      })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Failed to load invoice') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [invoice])

  const totalReturn = lines.reduce((sum, l) => sum + (qty[l.id] || 0) * (l.lineTotal / Math.max(1, l.quantity)), 0)

  const handleSubmit = async () => {
    if (!invoice) return
    const selected = lines
      .filter(l => (qty[l.id] || 0) > 0)
      .map(l => ({ lineId: l.id, quantity: Math.min(qty[l.id] || 0, l.quantity) }))
    if (selected.length === 0) {
      setError('Select at least one line to return')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: selected, reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to process return')
      onSuccess()
    } catch (err: any) {
      setError(err?.message || 'Failed to process return')
    } finally {
      setSubmitting(false)
    }
  }

  if (!invoice) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Undo2 className="w-5 h-5 text-brand-500" /> Return / Credit Note
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{invoice.invoiceNumber} — {invoice.partnerName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">A credit note will be created and stock will be reversed for the returned quantities.</p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
                    <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Invoiced</th>
                    <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Return Qty</th>
                    <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {lines.map(l => {
                    const unit = l.lineTotal / Math.max(1, l.quantity)
                    return (
                      <tr key={l.id}>
                        <td className="py-2.5 px-4 text-sm text-gray-900 dark:text-white">{l.description}</td>
                        <td className="py-2.5 px-4 text-right text-sm text-gray-600 dark:text-gray-400">{l.quantity}</td>
                        <td className="py-2.5 px-4 text-right">
                          <input
                            type="number" min="0" max={l.quantity}
                            value={qty[l.id] || 0}
                            onChange={e => setQty(prev => ({ ...prev, [l.id]: Math.max(0, Math.min(l.quantity, Number(e.target.value) || 0)) }))}
                            className="w-20 ml-auto text-right rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                          />
                        </td>
                        <td className="py-2.5 px-4 text-right text-sm font-medium text-gray-900 dark:text-white">
                          {formatCurrency((qty[l.id] || 0) * unit)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <td colSpan={3} className="py-2.5 px-4 text-right text-sm font-semibold text-gray-900 dark:text-white">Total Return</td>
                    <td className="py-2.5 px-4 text-right text-sm font-bold text-brand-600 dark:text-brand-400">{formatCurrency(totalReturn)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reason</label>
            <textarea
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Damaged goods, wrong item shipped"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting || loading}>
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Processing...' : 'Create Credit Note'}
          </Button>
        </div>
      </div>
    </div>
  )
}
