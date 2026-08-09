'use client'
import { formatCurrency } from '@/lib/formatters'
import { ModalHeader, StatusBadge } from '@/components/ui'

import { Loader2, X, Link2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import type { Invoice, InvoiceLine } from '@/types/erp'

interface ViewInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  invoice: Invoice | null
  lines: InvoiceLine[]
  loading: boolean
  showPoNumber?: string | null
  statusLabels: Record<string, string>
  statusStyles: Record<string, string>
  showMatchPO?: boolean
  onMatchPO?: () => void
  onUnlinkPO?: () => void
}

export default function ViewInvoiceModal({
  isOpen,
  onClose,
  invoice,
  lines,
  loading,
  showPoNumber = null,
  statusLabels,
  statusStyles,
  showMatchPO = false,
  onMatchPO,
  onUnlinkPO,
}: ViewInvoiceModalProps) {
  const partnerLabel = invoice && 'partnerName' in invoice ? 'Partner' : 'Partner'

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl p-0" showCloseButton={false}>
      <ModalHeader title={invoice ? `Invoice ${invoice.invoiceNumber}` : 'Invoice'} onClose={onClose}>
        {invoice && (
          <StatusBadge label={statusLabels[invoice.status] || invoice.status} color={statusStyles[invoice.status]} size="sm" className="mt-1" />
        )}
      </ModalHeader>

      <div className="p-6 max-h-[70vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
            <span className="ml-2 text-sm text-gray-400">Loading...</span>
          </div>
        ) : invoice ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{partnerLabel}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{invoice.partnerName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Invoice Date</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{invoice.invoiceDate}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Due Date</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{invoice.dueDate}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Reference</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{invoice.referenceNumber || '—'}</p>
              </div>
              {'subtotal' in invoice && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Subtotal</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{formatCurrency((invoice as Invoice).subtotal)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                <p className="text-sm font-semibold text-brand-600 dark:text-brand-400 mt-0.5">{formatCurrency(invoice.totalAmount)}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Line Items</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Product</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Description</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Qty</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Price</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Disc%</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">VAT</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {lines.length === 0 ? (
                    <tr><td colSpan={8} className="py-8 text-center text-sm text-gray-400">No line items</td></tr>
                  ) : (
                    lines.map(line => (
                      <tr key={line.id}>
                        <td className="py-2 px-3 text-xs text-gray-400">{line.lineNumber}</td>
                        <td className="py-2 px-3 text-xs font-medium text-gray-900 dark:text-white">#{line.productId}</td>
                        <td className="py-2 px-3 text-xs text-gray-600 dark:text-gray-300">{line.description}</td>
                        <td className="py-2 px-3 text-xs text-right text-gray-900 dark:text-white">{line.quantity}</td>
                        <td className="py-2 px-3 text-xs text-right text-gray-900 dark:text-white">{formatCurrency(line.unitPrice)}</td>
                        <td className="py-2 px-3 text-xs text-right text-gray-500">{line.discountPercent}%</td>
                        <td className="py-2 px-3 text-xs text-right text-gray-500">{formatCurrency(line.vatAmount)}</td>
                        <td className="py-2 px-3 text-xs text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(line.lineTotal)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {invoice.notes && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Notes:</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{invoice.notes}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-center text-sm text-gray-400 py-8">Invoice not found.</p>
        )}
      </div>

      <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
        <div>
          {showMatchPO && invoice && invoice.status !== 'cancelled' && onMatchPO && onUnlinkPO && (
            showPoNumber ? (
              <Button variant="outline" size="sm" onClick={onUnlinkPO}
                className="flex items-center gap-2 !text-red-600 !border-red-300 hover:!bg-red-50 dark:!border-red-700 dark:hover:!bg-red-950/30">
                <X className="w-3.5 h-3.5" /> Unlink {showPoNumber}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onMatchPO}
                className="flex items-center gap-2 !text-brand-600 !border-brand-300 hover:!bg-brand-50 dark:!border-brand-700 dark:hover:!bg-brand-950/30">
                <Link2 className="w-3.5 h-3.5" /> Match to PO
              </Button>
            )
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}


