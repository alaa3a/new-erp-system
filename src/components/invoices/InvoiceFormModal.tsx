'use client'
import { formatCurrency } from '@/lib/formatters'
import { ModalHeader, StatusBadge } from '@/components/ui'

import { Plus, Loader2, Trash2, Package, CheckCircle } from 'lucide-react'
import SearchSelect from '@/components/form/SearchSelect'
import DatePicker from '@/components/form/input/DatePicker'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'

interface LineFormData {
  id: string
  productId: number | null
  productCode: string
  productName: string
  description: string
  quantity: number
  unitPrice: number
  discountPercent: number
  vatCodeId: number | null
  vatRate: number
  warehouseId: number | null
  lineType: 'stock' | 'service'
  costCenterId: number | null
  salesAccountId: number | null
  inventoryAccountId: number | null
  cogsAccountId: number | null
}

interface InvoiceFormData {
  businessPartnerId: number | null
  partnerName: string
  partnerTaxReg: string
  invoiceDate: string
  dueDate: string
  postingProfileId: number | null
  warehouseId: number | null
  referenceNumber: string
  notes: string
  lines: LineFormData[]
}

interface SelectOption {
  id: number
  label: string
  rate?: number
  disabled?: boolean
  indent?: number
}

interface InvoiceFormModalProps {
  isOpen: boolean
  onClose: () => void
  formData: InvoiceFormData
  setFormData: React.Dispatch<React.SetStateAction<InvoiceFormData>>
  editingInvoice: { invoiceNumber: string } | null
  submitting: boolean
  formError: string
  partnerOptions: SelectOption[]
  productOptions: SelectOption[]
  taxCodeOptions: SelectOption[]
  profileOptions: SelectOption[]
  warehouseOptions: SelectOption[]
  lineTotals: { subtotal: number; vatAmount: number; total: number }
  onPartnerSelect: (partnerId: string | number | null) => void
  onProductSelect: (lineId: string, productId: number | null) => void
  onAddLine: () => void
  onRemoveLine: (id: string) => void
  onUpdateLine: (id: string, updates: Partial<LineFormData>) => void
  onSave: (action: 'draft' | 'post') => void
  partnerLabel: string
  partnerPlaceholder: string
  partnerSearchPlaceholder: string
  partnerNotFoundLabel: string
  profilePlaceholder: string
  title: string
  vatLabel: string
  vatSearchPlaceholder: string
  vatNotFoundLabel: string
}

export default function InvoiceFormModal({
  isOpen,
  onClose,
  formData,
  setFormData,
  editingInvoice,
  submitting,
  formError,
  partnerOptions,
  productOptions,
  taxCodeOptions,
  profileOptions,
  warehouseOptions,
  lineTotals,
  onPartnerSelect,
  onProductSelect,
  onAddLine,
  onRemoveLine,
  onUpdateLine,
  onSave,
  partnerLabel,
  partnerPlaceholder,
  partnerSearchPlaceholder,
  partnerNotFoundLabel,
  profilePlaceholder,
  title,
  vatLabel,
  vatSearchPlaceholder,
  vatNotFoundLabel,
}: InvoiceFormModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl p-0" showCloseButton={false}>
      <ModalHeader title={editingInvoice ? `Edit ${editingInvoice.invoiceNumber}` : title} onClose={onClose} />

      <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{partnerLabel} *</label>
            <SearchSelect
              options={partnerOptions}
              value={formData.businessPartnerId}
              onChange={onPartnerSelect}
              placeholder={partnerPlaceholder}
              searchPlaceholder={partnerSearchPlaceholder}
              notFoundLabel={partnerNotFoundLabel}
            />
            {formData.businessPartnerId && formData.partnerTaxReg && (
              <p className="mt-1 text-[11px] text-gray-400">Tax Reg: {formData.partnerTaxReg}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{partnerLabel} Name</label>
            <input type="text" value={formData.partnerName}
              onChange={e => setFormData(prev => ({ ...prev, partnerName: e.target.value }))}
              placeholder="Or type manually"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Invoice Date</label>
            <DatePicker value={formData.invoiceDate} onChange={(v) => setFormData(prev => ({ ...prev, invoiceDate: v }))} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Due Date</label>
            <DatePicker value={formData.dueDate} onChange={(v) => setFormData(prev => ({ ...prev, dueDate: v }))} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Posting Profile</label>
            <SearchSelect
              options={profileOptions}
              value={formData.postingProfileId}
              onChange={(val) => setFormData(prev => ({ ...prev, postingProfileId: val ? Number(val) : null }))}
              placeholder={profilePlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Warehouse</label>
            <SearchSelect
              options={warehouseOptions}
              value={formData.warehouseId}
              onChange={(val) => setFormData(prev => ({ ...prev, warehouseId: val ? Number(val) : null }))}
              placeholder="Default warehouse..."
              noneLabel="None"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reference #</label>
            <input type="text" value={formData.referenceNumber}
              onChange={e => setFormData(prev => ({ ...prev, referenceNumber: e.target.value }))}
              placeholder="PO or external ref"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
          </div>

          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Notes</label>
            <input type="text" value={formData.notes}
              onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional notes"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Line Items</h4>
            <button type="button" onClick={onAddLine}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 text-xs font-medium hover:bg-brand-100 dark:hover:bg-brand-950/50 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
          </div>

          {formData.lines.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
              <Package className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-400 dark:text-gray-500">No line items yet. Click &quot;Add Item&quot; to add products or services.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {formData.lines.map((line, idx) => {
                const lineTotal = line.quantity * line.unitPrice * (1 - line.discountPercent / 100)

                return (
                  <div key={line.id}
                    className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 shrink-0">#{idx + 1}</span>
                      <button onClick={() => onRemoveLine(line.id)}
                        className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2">
                      <div className="lg:col-span-3">
                        <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Product</label>
                        <SearchSelect
                          options={productOptions}
                          value={line.productId}
                          onChange={(val) => onProductSelect(line.id, val ? Number(val) : null)}
                          placeholder="Select product..."
                          searchPlaceholder="Search products..."
                          notFoundLabel="No products found"
                        />
                      </div>

                      <div className="lg:col-span-2">
                        <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
                        <input type="text" value={line.description}
                          onChange={e => onUpdateLine(line.id, { description: e.target.value })}
                          placeholder="Description"
                          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white placeholder:text-gray-400" />
                      </div>

                      <div className="lg:col-span-1">
                        <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Qty</label>
                        <input type="number" value={line.quantity || ''} min={1}
                          onChange={e => onUpdateLine(line.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white text-center"
                        />
                      </div>

                      <div className="lg:col-span-2">
                        <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Unit Price ($)</label>
                        <input type="number" value={line.unitPrice || ''} min={0} step="0.01"
                          onChange={e => onUpdateLine(line.id, { unitPrice: Number(e.target.value) || 0 })}
                          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white text-right"
                        />
                      </div>

                      <div className="lg:col-span-1">
                        <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Disc %</label>
                        <input type="number" value={line.discountPercent || ''} min={0} max={100} step="0.01"
                          onChange={e => onUpdateLine(line.id, { discountPercent: Number(e.target.value) || 0 })}
                          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white text-center"
                        />
                      </div>

                      <div className="lg:col-span-2">
                        <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">{vatLabel}</label>
                        <SearchSelect
                          options={taxCodeOptions}
                          value={line.vatCodeId}
                          onChange={(val, item) => {
                            const id = val ? Number(val) : null
                            onUpdateLine(line.id, {
                              vatCodeId: id,
                              vatRate: (item as { rate?: number })?.rate ?? 0,
                            })
                          }}
                          placeholder="VAT..."
                          noneLabel="No VAT"
                          searchPlaceholder={vatSearchPlaceholder}
                          notFoundLabel={vatNotFoundLabel}
                        />
                      </div>

                      <div className="lg:col-span-1 flex flex-col justify-end">
                        <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Total</label>
                        <div className="px-2.5 py-1.5 text-xs font-semibold text-gray-900 dark:text-white text-right bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          ${lineTotal.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="ml-auto max-w-xs space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
              <span className="text-gray-900 dark:text-white font-medium">${lineTotals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">VAT Amount</span>
              <span className="text-gray-900 dark:text-white font-medium">${lineTotals.vatAmount.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-base border-t border-gray-200 dark:border-gray-700 pt-1.5">
              <span className="font-semibold text-gray-900 dark:text-white">Grand Total</span>
              <span className="font-bold text-brand-600 dark:text-brand-400">${lineTotals.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {formError && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-2.5">
            <p className="text-sm text-red-700 dark:text-red-400">{formError}</p>
          </div>
        )}
      </div>

      <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
        <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button size="sm" onClick={() => onSave('draft')} disabled={submitting}
          className="flex items-center gap-2">
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {editingInvoice ? 'Update Draft' : 'Save as Draft'}
        </Button>
        <Button size="sm" onClick={() => onSave('post')} disabled={submitting}
          className="flex items-center gap-2 !bg-green-600 hover:!bg-green-700">
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
          Save & Post
        </Button>
      </div>
    </Modal>
  )
}
