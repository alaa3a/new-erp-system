'use client'
import { formatCurrency } from '@/lib/formatters'
import { ModalHeader } from '@/components/ui'

import { Plus, Edit3, Trash2, Loader2, FileText, Scale } from 'lucide-react'
import SearchSelect from '@/components/form/SearchSelect'
import DatePicker from '@/components/form/input/DatePicker'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import type { EntryLineType, Account } from '@/types/erp'

interface LineFormData {
  id: string
  lineType: EntryLineType
  accountCode: string
  description: string
  debitAmount: number
  creditAmount: number
  costCenterId: number | null
  businessPartnerId: number | null
  employeeId: number | null
  vatCodeId: number | null
  vatAmount: number
  supplierName: string
  supplierTaxId: string
  invoiceNumber: string
  invoiceDate: string
  taxDetailsJson: Record<string, string>
  allocations: { id: string; invoiceId: number; amount: number; notes: string }[]
  generated?: boolean
}

interface EntryFormData {
  entryDate: string
  description: string
  referenceNumber: string
  entryCategoryId: number | null
  lines: LineFormData[]
}

interface EntryFormModalProps {
  isOpen: boolean
  onClose: () => void
  formData: EntryFormData
  setFormData: React.Dispatch<React.SetStateAction<EntryFormData>>
  editingEntry: { entryNumber: string } | null
  submitting: boolean
  formError: string
  formTotals: { debit: number; credit: number; balanced: boolean }
  categoryOptions: { id: number; label: string }[]
  categoryMap: Map<number, { code: string; name: string }>
  accountMap: Map<string, Account>
  onAddLine: () => void
  onEditLine: (id: string) => void
  onRemoveLine: (id: string) => void
  onSave: () => void
}

const lineTypeConfig: Record<EntryLineType, { label: string; bg: string; text: string }> = {
  normal: { label: 'Normal', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-300' },
  tax: { label: 'Tax', bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-400' },
  payment: { label: 'Payment', bg: 'bg-blue-50 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-400' },
}

export default function EntryFormModal({
  isOpen,
  onClose,
  formData,
  setFormData,
  editingEntry,
  submitting,
  formError,
  formTotals,
  categoryOptions,
  categoryMap,
  accountMap,
  onAddLine,
  onEditLine,
  onRemoveLine,
  onSave,
}: EntryFormModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-7xl p-0" showCloseButton={false}>
      <ModalHeader title={editingEntry ? `Edit Entry ${editingEntry.entryNumber}` : 'New Journal Entry'} onClose={onClose} />

      <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Entry Date *</label>
              <DatePicker value={formData.entryDate} onChange={(v) => setFormData(prev => ({ ...prev, entryDate: v }))} />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Category</label>
              <SearchSelect
                options={categoryOptions}
                value={formData.entryCategoryId}
                onChange={(val) => setFormData(prev => ({ ...prev, entryCategoryId: val ? Number(val) : null }))}
                placeholder="Select category..."
                noneLabel="No category"
                searchPlaceholder="Search categories..."
                notFoundLabel="No categories found"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Description *</label>
              <input type="text" value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Entry description"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Reference #</label>
              <input type="text" value={formData.referenceNumber}
                onChange={e => setFormData(prev => ({ ...prev, referenceNumber: e.target.value }))}
                placeholder="Optional ref"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
            </div>
          </div>

          {formData.entryCategoryId && categoryMap.has(formData.entryCategoryId) && (
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-400 dark:text-gray-500">
              <span>Numbered as</span>
              <span className="px-1.5 py-0.5 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-mono text-gray-600 dark:text-gray-300">
                JE-{categoryMap.get(formData.entryCategoryId)!.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'GEN'}-NNNNNN
              </span>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Line Items</h4>
            <button type="button" onClick={onAddLine}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 text-xs font-medium hover:bg-brand-100 dark:hover:bg-brand-950/50 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Line
            </button>
          </div>

          {formData.lines.length > 0 && (
            <div className={`flex items-center gap-1.5 mb-3 px-3 py-2 rounded-lg text-xs font-medium ${
              formTotals.balanced
                ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
            }`}>
              <Scale className="w-3.5 h-3.5" />
              {formTotals.balanced
                ? `Balanced: $${formTotals.debit.toFixed(2)} = $${formTotals.credit.toFixed(2)}`
                : `Not balanced: Debit $${formTotals.debit.toFixed(2)} vs Credit $${formTotals.credit.toFixed(2)} (Diff: $${Math.abs(formTotals.debit - formTotals.credit).toFixed(2)})`
              }
            </div>
          )}

          {formData.lines.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
              <FileText className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-400 dark:text-gray-500">No line items yet. Click &quot;Add Line&quot; to add debit/credit lines.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400">Type</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400">Account</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400">Description</th>
                    <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400">Debit</th>
                    <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400">Credit</th>
                    <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {formData.lines.map((line, idx) => {
                    const acct = line.accountCode ? accountMap.get(line.accountCode) : undefined
                    const t = lineTypeConfig[line.lineType] || lineTypeConfig.normal
                    const isTaxLine = line.lineType === 'tax'
                    const isGeneratedPayment = !!line.generated && !isTaxLine
                    return (
                      <tr key={line.id} className={`${isTaxLine ? 'bg-amber-50/40 dark:bg-amber-950/10' : isGeneratedPayment ? 'bg-blue-50/40 dark:bg-blue-950/10' : ''} hover:bg-gray-50 dark:hover:bg-gray-800/30`}>
                        <td className="py-2.5 px-4 text-sm text-gray-400">{idx + 1}</td>
                        <td className="py-2.5 px-4">
                          <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${t.bg} ${t.text}`}>{t.label}</span>
                          {(isTaxLine || isGeneratedPayment) && (
                            <span className={`ml-1 inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${isTaxLine ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'}`}
                              title="Auto-generated line — part of a generated payment/tax set">
                              auto
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-sm font-mono font-medium text-gray-900 dark:text-white">
                          {line.accountCode}
                          {acct && <span className="text-gray-400 ml-1">({acct.name})</span>}
                        </td>
                        <td className="py-2.5 px-4 text-sm text-gray-600 dark:text-gray-300">{line.description}</td>
                        <td className="py-2.5 px-4 text-sm text-right font-medium text-green-600 dark:text-green-400">
                          {line.debitAmount > 0 ? formatCurrency(Math.round(line.debitAmount * 100)) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-sm text-right font-medium text-red-600 dark:text-red-400">
                          {line.creditAmount > 0 ? formatCurrency(Math.round(line.creditAmount * 100)) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" onClick={() => onEditLine(line.id)}
                              className="p-1 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                              title="Edit line"><Edit3 className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => onRemoveLine(line.id)}
                              className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                              title="Remove line"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {formError && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-2.5">
            <p className="text-sm text-red-700 dark:text-red-400">{formError}</p>
          </div>
        )}
      </div>

      <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
        <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button size="sm" onClick={onSave} disabled={submitting || !formTotals.balanced || formData.lines.length === 0}
          className="flex items-center gap-2">
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {editingEntry ? 'Update Entry' : 'Create Entry'}
        </Button>
      </div>
    </Modal>
  )
}
