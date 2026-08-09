'use client'
import { ModalHeader } from '@/components/ui'

import { Loader2, AlertTriangle, BookOpen, Package, CheckCircle } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import type { Invoice } from '@/types/erp'

interface PreviewEntry {
  accountCode: string
  description: string
  debitAmount: number
  creditAmount: number
}

interface PreviewData {
  entries: PreviewEntry[]
  stockMovements: { productId: number; warehouseId: number; quantity: number; unitCost: number }[]
}

interface PostingPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  invoice: Invoice | null
  previewData: PreviewData | null
  loading: boolean
  onPost?: () => void
  stockDirection: 'issue' | 'receipt'
}

export default function PostingPreviewModal({
  isOpen,
  onClose,
  invoice,
  previewData,
  loading,
  onPost,
  stockDirection,
}: PostingPreviewModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl p-0" showCloseButton={false}>
      <ModalHeader
        title="Posting Preview"
        subtitle={invoice ? `${invoice.invoiceNumber} — ${invoice.partnerName}` : undefined}
        onClose={onClose}
      />

      <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
            <span className="ml-2 text-sm text-gray-400">Generating preview...</span>
          </div>
        ) : previewData ? (
          <>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-brand-500" /> Accounting Entries
              </h4>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Account</th>
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Description</th>
                      <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Debit ($)</th>
                      <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Credit ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {previewData.entries.map((e, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="py-2 px-3 text-xs font-mono font-medium text-gray-900 dark:text-white">{e.accountCode}</td>
                        <td className="py-2 px-3 text-xs text-gray-600 dark:text-gray-400">{e.description}</td>
                        <td className="py-2 px-3 text-xs text-right font-medium text-green-600 dark:text-green-400">
                          {e.debitAmount > 0 ? `$${(e.debitAmount / 100).toFixed(2)}` : '—'}
                        </td>
                        <td className="py-2 px-3 text-xs text-right font-medium text-red-600 dark:text-red-400">
                          {e.creditAmount > 0 ? `$${(e.creditAmount / 100).toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                      <td colSpan={2} className="py-2.5 px-3 text-xs font-semibold text-gray-900 dark:text-white text-right">Totals</td>
                      <td className="py-2.5 px-3 text-xs font-semibold text-green-600 dark:text-green-400 text-right">
                        ${(previewData.entries.reduce((s, e) => s + e.debitAmount, 0) / 100).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-semibold text-red-600 dark:text-red-400 text-right">
                        ${(previewData.entries.reduce((s, e) => s + e.creditAmount, 0) / 100).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {previewData.stockMovements.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-500" /> Stock Movements
                </h4>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Product ID</th>
                        <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Qty</th>
                        <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Unit Cost ($)</th>
                        <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {previewData.stockMovements.map((sm, i) => (
                        <tr key={i}>
                          <td className="py-2 px-3 text-xs font-mono text-gray-900 dark:text-white">#{sm.productId}</td>
                          <td className="py-2 px-3 text-xs text-right font-medium text-gray-900 dark:text-white">{sm.quantity}</td>
                          <td className="py-2 px-3 text-xs text-right text-gray-600 dark:text-gray-400">${(sm.unitCost / 100).toFixed(2)}</td>
                          <td className="py-2 px-3 text-xs">
                            <span className={`inline-flex text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                              (stockDirection === 'issue' ? sm.quantity < 0 : sm.quantity > 0)
                                ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
                                : 'bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400'
                            }`}>
                              {sm.quantity < 0 ? 'Issue (Out)' : 'Receipt (In)'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {previewData.stockMovements.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-6 text-center">
                <Package className="w-6 h-6 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-400 dark:text-gray-500">No stock movements — all items are services.</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center py-12">
            <AlertTriangle className="w-5 h-5 text-amber-500 mr-2" />
            <span className="text-sm text-gray-500">Failed to generate preview.</span>
          </div>
        )}
      </div>

      <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        {invoice && invoice.status === 'draft' && onPost && (
          <Button size="sm" onClick={onPost}
            className="flex items-center gap-2 !bg-green-600 hover:!bg-green-700">
            <CheckCircle className="w-3.5 h-3.5" /> Post Invoice
          </Button>
        )}
      </div>
    </Modal>
  )
}
