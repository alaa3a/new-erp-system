'use client'
import { formatCurrency } from '@/lib/formatters'
import { ModalHeader, StatusBadge } from '@/components/ui'

import { Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import type { Entry, EntryLine, Account, EntryCategory } from '@/types/erp'

interface ViewEntryModalProps {
  isOpen: boolean
  onClose: () => void
  entry: Entry | null
  lines: EntryLine[]
  loading: boolean
  accountMap: Map<string, Account>
  categoryMap: Map<number, EntryCategory>
}

const lineTypeConfig: Record<string, { label: string; bg: string; text: string }> = {
  normal: { label: 'Normal', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-300' },
  tax: { label: 'Tax', bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-400' },
  payment: { label: 'Payment', bg: 'bg-blue-50 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-400' },
}

export default function ViewEntryModal({
  isOpen,
  onClose,
  entry,
  lines,
  loading,
  accountMap,
  categoryMap,
}: ViewEntryModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl p-0" showCloseButton={false}>
      <ModalHeader title={entry ? `Entry ${entry.entryNumber}` : 'Entry'} onClose={onClose}>
        {entry && (
          <StatusBadge label={entry.status.charAt(0).toUpperCase() + entry.status.slice(1)} color={
            entry.status === 'draft' ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400' :
            entry.status === 'posted' ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' :
            'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
          } size="sm" className="mt-1" />
        )}
      </ModalHeader>

      <div className="p-6 max-h-[70vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
            <span className="ml-2 text-sm text-gray-400">Loading...</span>
          </div>
        ) : entry ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Date</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{entry.entryDate}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Reference</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{entry.referenceNumber || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Posted By</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{(entry as Entry & { postedBy?: string }).postedBy || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Category</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
                  {entry.categoryId && categoryMap.has(entry.categoryId)
                    ? categoryMap.get(entry.categoryId)!.name
                    : '—'}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Description</p>
              <p className="text-sm text-gray-900 dark:text-white">{entry.description}</p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Line Items</h4>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Type</th>
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Account</th>
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Description</th>
                      <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Debit</th>
                      <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {lines.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-400">No line items</td></tr>
                    ) : (
                      lines.map(line => {
                        const acct = accountMap.get(line.accountCode)
                        const lt = lineTypeConfig[line.lineType || 'normal']
                        const isTaxLine = line.lineType === 'tax'
                        return (
                          <tr key={line.id} className={`${isTaxLine ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''} hover:bg-gray-50 dark:hover:bg-gray-800/30`}>
                            <td className="py-2 px-3 text-xs text-gray-400">{line.lineNumber}</td>
                            <td className="py-2 px-3">
                              <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${lt.bg} ${lt.text}`}>
                                {lt.label}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-xs font-mono font-medium text-gray-900 dark:text-white">
                              {line.accountCode}
                              {acct && <span className="text-gray-400 ml-1">({acct.name})</span>}
                            </td>
                            <td className="py-2 px-3 text-xs text-gray-600 dark:text-gray-300">{line.description}</td>
                            <td className="py-2 px-3 text-xs text-right font-medium text-green-600 dark:text-green-400">
                              {line.debitAmount > 0 ? formatCurrency(line.debitAmount) : '—'}
                            </td>
                            <td className="py-2 px-3 text-xs text-right font-medium text-red-600 dark:text-red-400">
                              {line.creditAmount > 0 ? formatCurrency(line.creditAmount) : '—'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                      <td colSpan={4} className="py-2.5 px-3 text-xs font-semibold text-gray-900 dark:text-white text-right">Totals</td>
                      <td className="py-2.5 px-3 text-xs font-semibold text-green-600 dark:text-green-400 text-right">
                        ${(lines.reduce((s, l) => s + l.debitAmount, 0) / 100).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-semibold text-red-600 dark:text-red-400 text-right">
                        ${(lines.reduce((s, l) => s + l.creditAmount, 0) / 100).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-center text-sm text-gray-400 py-8">Entry not found.</p>
        )}
      </div>

      <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}
