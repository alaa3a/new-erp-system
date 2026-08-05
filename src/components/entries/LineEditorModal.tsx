'use client'
import { formatCurrency } from '@/lib/formatters'
import { ModalHeader } from '@/components/ui'

import { Plus, Loader2, AlertTriangle, Receipt, Percent, Link2, X } from 'lucide-react'
import SearchSelect from '@/components/form/SearchSelect'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import type { EntryLineType, Account, CostCenter, BusinessPartner, TaxCode, Invoice, PostingProfile } from '@/types/erp'

interface LineAllocationFormData {
  id: string
  invoiceId: number
  amount: number
  notes: string
}

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
  allocations: LineAllocationFormData[]
  generated?: boolean
}

interface TaxPanelForm {
  groupId: number | null
  vatCodeId: number | null
  base: number
  supplierName: string
  supplierTaxId: string
  invoiceNumber: string
  invoiceDate: string
  details: Record<string, string>
}

interface LineEditorModalProps {
  isOpen: boolean
  onClose: () => void
  draftLine: LineFormData | null
  editingLineId: string | null
  formDataLines: LineFormData[]
  lineEditorAccount: Account | undefined
  lineEditorLinkType: string | null | undefined
  showLineDimension: boolean
  taxPanelOpen: boolean
  paymentPanelOpen: boolean
  arApGuardOpen: boolean
  taxPanelForm: TaxPanelForm
  paymentError: string
  loadingInvoices: number | null
  openInvoices: Record<number, Invoice[]>
  accountMap: Map<string, Account>
  costCenterMap: Map<number, CostCenter>
  partnerMap: Map<number, BusinessPartner>
  taxCodeMap: Map<number, TaxCode>
  postingProfiles: PostingProfile[]
  accountOptions: { id: string; label: string; disabled?: boolean; indent?: number }[]
  costCenterOptions: { id: number; label: string; disabled?: boolean; indent: number }[]
  partnerOptionsForRole: { id: number; label: string }[]
  employeeOptions: { id: number; label: string }[]
  taxGroupOptions: { id: number; label: string }[]
  taxTypeOptions: { id: number; label: string; groupId: number | null; groupLabel: string }[]
  linkedCostCenter: CostCenter | undefined
  onUpdateDraftLine: (updates: Partial<LineFormData>) => void
  onUpdateDraftAllocation: (invoiceId: number, updates: Partial<LineAllocationFormData>) => void
  onRemoveDraftAllocation: (invoiceId: number) => void
  onSaveLine: () => void
  onAppendTaxLine: () => void
  onApplyPaymentLinks: () => void
  onTogglePaymentPanel: () => void
  onOpenPaymentPanel: () => void
  onCancelArApGuard: () => void
  onConfirmArApGuard: () => void
  onSetTaxPanelForm: React.Dispatch<React.SetStateAction<TaxPanelForm>>
  onSetTaxPanelOpen: (open: boolean) => void
  onSetPaymentPanelOpen: (open: boolean) => void
  onFetchOpenInvoices: (partnerId: number, force?: boolean) => void
}

type CoreTaxDetailKey = 'supplierName' | 'supplierTaxId' | 'invoiceNumber' | 'invoiceDate'

const CORE_TAX_KEY_VARIANTS: Record<string, CoreTaxDetailKey> = {
  supplierName: 'supplierName', supplier_name: 'supplierName',
  supplierTaxId: 'supplierTaxId', supplier_tax_id: 'supplierTaxId',
  invoiceNumber: 'invoiceNumber', invoice_number: 'invoiceNumber', invoice: 'invoiceNumber',
  invoiceDate: 'invoiceDate', invoice_date: 'invoiceDate',
}

const coreTaxKeyFor = (k: string): CoreTaxDetailKey | null => CORE_TAX_KEY_VARIANTS[k] || null

export default function LineEditorModal({
  isOpen,
  onClose,
  draftLine,
  editingLineId,
  formDataLines,
  lineEditorAccount,
  lineEditorLinkType,
  showLineDimension,
  taxPanelOpen,
  paymentPanelOpen,
  arApGuardOpen,
  taxPanelForm,
  paymentError,
  loadingInvoices,
  openInvoices,
  accountMap,
  costCenterMap,
  partnerMap,
  taxCodeMap,
  accountOptions,
  costCenterOptions,
  partnerOptionsForRole,
  employeeOptions,
  taxGroupOptions,
  taxTypeOptions,
  linkedCostCenter,
  onUpdateDraftLine,
  onUpdateDraftAllocation,
  onRemoveDraftAllocation,
  onSaveLine,
  onAppendTaxLine,
  onApplyPaymentLinks,
  onTogglePaymentPanel,
  onOpenPaymentPanel,
  onCancelArApGuard,
  onConfirmArApGuard,
  onSetTaxPanelForm,
  onSetTaxPanelOpen,
  onSetPaymentPanelOpen,
  onFetchOpenInvoices,
}: LineEditorModalProps) {
  if (!draftLine) return null

  const allocTotal = draftLine.allocations.reduce((s, a) => s + (a.amount || 0), 0)
  const lineAmount = draftLine.debitAmount || draftLine.creditAmount
  const invoices = draftLine.businessPartnerId ? (openInvoices[draftLine.businessPartnerId] || []) : []
  const partner = draftLine.businessPartnerId ? partnerMap.get(draftLine.businessPartnerId) : undefined

  return (
    <Modal isOpen={isOpen && !!draftLine} onClose={onClose} className="max-w-5xl p-0" showCloseButton={false}>
      <ModalHeader
        title={editingLineId ? `Edit Line #${formDataLines.findIndex(l => l.id === editingLineId) + 1 || ''}` : 'Add Line'}
        onClose={onClose}
      />

      <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-6 sm:row-start-1">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Account *</label>
              <SearchSelect
                options={accountOptions}
                value={draftLine.accountCode || ''}
                onChange={(val) => {
                  onUpdateDraftLine({
                    accountCode: val ? String(val) : '',
                    costCenterId: null,
                    businessPartnerId: null,
                    employeeId: null,
                    allocations: [],
                  })
                  onSetTaxPanelOpen(false)
                  onSetPaymentPanelOpen(false)
                }}
                placeholder="Select account..."
                searchPlaceholder="Search accounts..."
                notFoundLabel="No accounts found"
              />
              {draftLine.accountCode && (() => {
                const a = draftLine.accountCode ? accountMap.get(draftLine.accountCode) : undefined
                const lt = a?.linkType ?? (a?.costCenterId ? 'cost_center' : null)
                if (!lt && a?.linkType === 'partner') return (
                  <p className="mt-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">Requires partner — AR/AP account</p>
                )
                if (!lt) return (
                  <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">No linked dimension</p>
                )
                if (lt === 'cost_center') {
                  const cc = linkedCostCenter
                  return (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400">
                      <Link2 className="w-3.5 h-3.5" /> Linked to Cost Center{cc ? `: ${cc.code} — ${cc.name}` : ''}
                    </p>
                  )
                }
                if (lt === 'partner') {
                  const filter = a?.linkPartnerFilter || 'both'
                  const desc = filter === 'customer' ? 'customers only' : filter === 'vendor' ? 'vendors only' : 'customers & vendors'
                  const partnerName = a?.linkId ? partnerMap.get(a.linkId)?.name : undefined
                  return (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">
                      <Link2 className="w-3.5 h-3.5" /> Linked to Partner{partnerName ? `: ${partnerName}` : ` (${desc})`}
                    </p>
                  )
                }
                const empName = a?.linkId ? employeeOptions.find(e => e.id === a.linkId)?.label : undefined
                return (
                  <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400">
                    <Link2 className="w-3.5 h-3.5" /> Linked to Employee{empName ? `: ${empName}` : ''}
                  </p>
                )
              })()}
            </div>

            <div className="sm:col-span-9 sm:row-start-2">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Description</label>
              <input type="text" value={draftLine.description}
                onChange={e => onUpdateDraftLine({ description: e.target.value })}
                placeholder="Line description"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
            </div>
            <div className="sm:col-span-3 sm:row-start-2">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Amount ($)</label>
              <div className="flex items-center gap-1.5">
                <input type="number" value={draftLine.debitAmount || ''} min={0} step="0.01" placeholder="Dr"
                  onChange={e => {
                    const val = Number(e.target.value) || 0
                    onUpdateDraftLine({ debitAmount: val, ...(val > 0 ? { creditAmount: 0 } : {}) })
                  }}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-2 text-sm text-gray-900 dark:text-white text-right font-mono placeholder:text-gray-400" />
                <input type="number" value={draftLine.creditAmount || ''} min={0} step="0.01" placeholder="Cr"
                  onChange={e => {
                    const val = Number(e.target.value) || 0
                    onUpdateDraftLine({ creditAmount: val, ...(val > 0 ? { debitAmount: 0 } : {}) })
                  }}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-2 text-sm text-gray-900 dark:text-white text-right font-mono placeholder:text-gray-400" />
              </div>
            </div>

            {showLineDimension && lineEditorLinkType === 'cost_center' && (
              <div className="sm:col-span-6 sm:row-start-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Cost Center <span className="text-red-400">*</span></label>
                <SearchSelect
                  options={costCenterOptions}
                  value={draftLine.costCenterId}
                  onChange={(val) => onUpdateDraftLine({ costCenterId: val ? Number(val) : null })}
                  placeholder="Select cost center..."
                  noneLabel="None"
                  searchPlaceholder="Search cost centers..."
                  notFoundLabel="No cost centers"
                />
                <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                  The linked cost center ({linkedCostCenter ? `${linkedCostCenter.code} — ${linkedCostCenter.name}` : '—'}) is shown at the top for context.
                </p>
              </div>
            )}

            {showLineDimension && lineEditorLinkType === 'partner' && (
              <div className="sm:col-span-6 sm:row-start-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Partner <span className="text-red-400">*</span></label>
                <SearchSelect
                  options={partnerOptionsForRole}
                  value={draftLine.businessPartnerId}
                  onChange={(val) => {
                    const pid = val ? Number(val) : null
                    onUpdateDraftLine({ businessPartnerId: pid, allocations: [] })
                    if (pid) onFetchOpenInvoices(pid)
                  }}
                  placeholder="Select partner..."
                  noneLabel="None"
                  searchPlaceholder="Search partners..."
                  notFoundLabel="No partners"
                />
              </div>
            )}

            {showLineDimension && !lineEditorLinkType && (
              <div className="sm:col-span-6 sm:row-start-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Employee <span className="text-red-400">*</span></label>
                <SearchSelect
                  options={employeeOptions}
                  value={draftLine.employeeId}
                  onChange={(val) => onUpdateDraftLine({ employeeId: val ? Number(val) : null })}
                  placeholder="Select employee..."
                  noneLabel="None"
                  searchPlaceholder="Search employees..."
                  notFoundLabel="No employees"
                />
              </div>
            )}
          </div>

          {draftLine.lineType === 'tax' && (() => {
            const tax = draftLine.vatCodeId ? taxCodeMap.get(draftLine.vatCodeId) : undefined
            const cfg = tax?.detailsConfig || []
            return (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/10 p-2 space-y-2">
                {cfg.length === 0 && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    No detail fields configured for this tax type — add them in Settings → Tax Setup.
                  </p>
                )}
                {cfg.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {cfg.map(f => {
                      const coreKey = coreTaxKeyFor(f.key)
                      const value = coreKey
                        ? (coreKey === 'supplierName' ? draftLine.supplierName
                          : coreKey === 'supplierTaxId' ? draftLine.supplierTaxId
                          : coreKey === 'invoiceNumber' ? draftLine.invoiceNumber
                          : draftLine.invoiceDate)
                        : draftLine.taxDetailsJson?.[f.key] || ''
                      return (
                        <div key={f.key}>
                          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{f.label}</label>
                          <input type={f.inputType === 'date' ? 'date' : f.inputType === 'number' ? 'number' : 'text'} step="0.01"
                            value={value}
                            onChange={e => {
                              const v = e.target.value
                              if (coreKey === 'supplierName') onUpdateDraftLine({ supplierName: v })
                              else if (coreKey === 'supplierTaxId') onUpdateDraftLine({ supplierTaxId: v })
                              else if (coreKey === 'invoiceNumber') onUpdateDraftLine({ invoiceNumber: v })
                              else if (coreKey === 'invoiceDate') onUpdateDraftLine({ invoiceDate: v })
                              else onUpdateDraftLine({ taxDetailsJson: { ...draftLine.taxDetailsJson, [f.key]: v } })
                            }}
                            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {draftLine.accountCode && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={onTogglePaymentPanel}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
              <Receipt className="w-4 h-4" /> Link Invoices
            </button>
            <button type="button"
              onClick={() => {
                const next = !taxPanelOpen
                onSetTaxPanelOpen(next)
                onSetPaymentPanelOpen(false)
                if (next) {
                  const amount = draftLine.debitAmount || draftLine.creditAmount
                  if (amount > 0) onSetTaxPanelForm(prev => prev.base === amount ? prev : { ...prev, base: amount })
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 text-sm font-medium hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors">
              <Percent className="w-4 h-4" /> Add Tax
            </button>
            <span className="text-xs text-gray-400 dark:text-gray-500">Linking attaches the invoices to this line; the cash/bank line you add yourself.</span>
          </div>
        )}

        {paymentError && (
          <div className="flex items-center gap-1.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-400">{paymentError}</p>
          </div>
        )}

        {taxPanelOpen && draftLine.accountCode && (
          <div className="space-y-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/10 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-4">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Tax Group</label>
                <SearchSelect
                  options={taxGroupOptions}
                  value={taxPanelForm.groupId}
                  onChange={(val) => onSetTaxPanelForm({ ...taxPanelForm, groupId: val ? Number(val) : null, vatCodeId: null, details: {} })}
                  placeholder="Select group..."
                  searchPlaceholder="Search groups..."
                  notFoundLabel="No groups"
                />
              </div>
              <div className="lg:col-span-4">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Tax Type *</label>
                <SearchSelect
                  options={taxTypeOptions.filter(t => taxPanelForm.groupId == null || t.groupId === taxPanelForm.groupId)}
                  value={taxPanelForm.vatCodeId}
                  onChange={(val) => onSetTaxPanelForm({
                    ...taxPanelForm,
                    vatCodeId: val ? Number(val) : null,
                    details: {},
                    supplierName: '', supplierTaxId: '', invoiceNumber: '', invoiceDate: '',
                  })}
                  placeholder="Select tax type..."
                  searchPlaceholder="Search tax types..."
                  notFoundLabel="No tax types in this group"
                />
              </div>
              <div className="lg:col-span-4">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Tax Base ($) *</label>
                <input type="number" value={taxPanelForm.base || ''} min={0} step="0.01"
                  onChange={e => onSetTaxPanelForm({ ...taxPanelForm, base: Number(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white text-right font-mono" />
              </div>
            </div>
            {(() => {
              const tax = taxPanelForm.vatCodeId ? taxCodeMap.get(taxPanelForm.vatCodeId) : undefined
              const amount = tax && taxPanelForm.base > 0 ? Math.round(taxPanelForm.base * tax.rate) / 100 : 0
              const cfg = tax?.detailsConfig || []
              return (
                <>
                  {tax && taxPanelForm.base > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Tax amount: <strong className="text-gray-900 dark:text-white">{formatCurrency(Math.round(amount * 100))}</strong>
                      <span className="block text-gray-400 dark:text-gray-500">{tax.rate}% · {tax.type === 'input' ? 'debit (input VAT)' : 'credit (output VAT)'} on {tax.accountCode}</span>
                    </p>
                  )}
                  {tax && cfg.length === 0 && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      No detail fields configured for this tax type — add them in Settings → Tax Setup.
                    </p>
                  )}
                  {tax && cfg.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {cfg.map(f => {
                        const coreKey = coreTaxKeyFor(f.key)
                        const value = coreKey
                          ? (coreKey === 'supplierName' ? taxPanelForm.supplierName
                            : coreKey === 'supplierTaxId' ? taxPanelForm.supplierTaxId
                            : coreKey === 'invoiceNumber' ? taxPanelForm.invoiceNumber
                            : taxPanelForm.invoiceDate)
                          : taxPanelForm.details[f.key] || ''
                        return (
                          <div key={f.key}>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{f.label}</label>
                            <input
                              type={f.inputType === 'date' ? 'date' : f.inputType === 'number' ? 'number' : 'text'}
                              step="0.01"
                              value={value}
                              onChange={e => {
                                const v = e.target.value
                                if (coreKey === 'supplierName') onSetTaxPanelForm({ ...taxPanelForm, supplierName: v })
                                else if (coreKey === 'supplierTaxId') onSetTaxPanelForm({ ...taxPanelForm, supplierTaxId: v })
                                else if (coreKey === 'invoiceNumber') onSetTaxPanelForm({ ...taxPanelForm, invoiceNumber: v })
                                else if (coreKey === 'invoiceDate') onSetTaxPanelForm({ ...taxPanelForm, invoiceDate: v })
                                else onSetTaxPanelForm({ ...taxPanelForm, details: { ...taxPanelForm.details, [f.key]: v } })
                              }}
                              placeholder={f.label}
                              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Adds the base line ({formatCurrency(Math.round(taxPanelForm.base * 100))}) + computed {tax ? `${tax.code} — ${tax.name}` : 'tax'} line together.
                    </p>
                    <button type="button" onClick={onAppendTaxLine} disabled={!taxPanelForm.vatCodeId || taxPanelForm.base <= 0}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors">
                      <Plus className="w-4 h-4" /> Add Tax Lines
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {paymentPanelOpen && draftLine.accountCode && (() => {
          const invoiceBalanceSum = invoices.reduce((s, inv) => s + (inv.totalAmount - inv.paidAmount) / 100, 0)
          const overAllocated = allocTotal > invoiceBalanceSum + 0.005
          const diff = Math.round((allocTotal - lineAmount) * 100) / 100
          const matched = Math.abs(diff) <= 0.005 && allocTotal > 0
          return (
            <div className="space-y-3 rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/10 p-4">
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Payment amount: <strong className="text-gray-700 dark:text-gray-300">{formatCurrency(Math.round(lineAmount * 100))}</strong>
                {partner && <span> · Linking to {partner.code} — {partner.name}</span>}
                {' '}· the cash/bank line you add yourself.
              </p>
              {loadingInvoices === draftLine.businessPartnerId ? (
                <div className="flex items-center gap-2 text-[11px] text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading open invoices...
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Open invoices for {partner?.name}</p>
                    <button type="button" onClick={() => onFetchOpenInvoices(draftLine.businessPartnerId!, true)}
                      className="text-[11px] font-medium text-brand-500 hover:text-brand-600">Refresh</button>
                  </div>
                  {invoices.length === 0 ? (
                    <p className="text-[11px] text-gray-400 py-2">No open invoices for this partner.</p>
                  ) : (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Pay</th>
                            <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Invoice</th>
                            <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Date</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Original</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Paid before</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Remaining</th>
                            <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">To pay</th>
                            <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {invoices.map(inv => {
                            const alloc = draftLine.allocations.find(a => a.invoiceId === inv.id)
                            const original = inv.totalAmount / 100
                            const paidBefore = inv.paidAmount / 100
                            const remaining = original - paidBefore
                            return (
                              <tr key={inv.id} className={`bg-white dark:bg-gray-800 ${alloc ? 'bg-blue-50/50 dark:bg-blue-950/10' : ''}`}>
                                <td className="py-2 px-3">
                                  <input type="checkbox"
                                    checked={!!alloc}
                                    onChange={e => e.target.checked ? onUpdateDraftAllocation(inv.id, { amount: remaining }) : onRemoveDraftAllocation(inv.id)}
                                    className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500" />
                                </td>
                                <td className="py-2 px-3 font-mono text-gray-700 dark:text-gray-300">{inv.invoiceNumber}</td>
                                <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{inv.invoiceDate}</td>
                                <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-300">{formatCurrency(inv.totalAmount)}</td>
                                <td className="py-2 px-3 text-right text-gray-500 dark:text-gray-400">{paidBefore > 0 ? formatCurrency(Math.round(paidBefore * 100)) : '—'}</td>
                                <td className="py-2 px-3 text-right font-medium text-gray-700 dark:text-gray-300">{formatCurrency(inv.totalAmount - inv.paidAmount)}</td>
                                <td className="py-2 px-3">
                                  <input type="number" min={0} step="0.01" value={alloc?.amount ?? ''}
                                    onChange={e => onUpdateDraftAllocation(inv.id, { amount: Number(e.target.value) || 0 })}
                                    placeholder="0.00"
                                    className="w-28 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-right font-mono text-gray-900 dark:text-white" />
                                </td>
                                <td className="py-2 px-3">
                                  <input type="text" value={alloc?.notes ?? ''}
                                    onChange={e => onUpdateDraftAllocation(inv.id, { notes: e.target.value })}
                                    placeholder="Note"
                                    className="w-full min-w-24 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-900 dark:text-white" />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
                    <div className="text-xs">
                      <p className="text-gray-500 dark:text-gray-400">
                        Linked: <strong className={matched ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>{formatCurrency(Math.round(allocTotal * 100))}</strong>
                        {' '}of <strong className="text-gray-900 dark:text-white">{formatCurrency(Math.round(lineAmount * 100))}</strong> (payment)
                      </p>
                      {diff < -0.005 && <p className="text-amber-600 dark:text-amber-400 mt-0.5">Still {Math.abs(diff).toFixed(2)} to allocate</p>}
                      {diff > 0.005 && <p className="text-red-500 mt-0.5">Over by {diff.toFixed(2)} — exceeds the payment amount</p>}
                      {overAllocated && diff <= 0.005 && <p className="text-red-500 mt-0.5">Exceeds the partner open balance</p>}
                      {matched && <p className="text-green-600 dark:text-green-400 mt-0.5">Matched — ready to link</p>}
                    </div>
                    <button type="button"
                      onClick={onApplyPaymentLinks}
                      disabled={!matched || overAllocated}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors">
                      <Receipt className="w-4 h-4" /> Link & Finish
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {arApGuardOpen && draftLine && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-gray-900 dark:text-white">Not an AR/AP account</p>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                  This account is not an Accounts Receivable/Payable account — payment allocations update invoice ageing and normally belong on an AR/AP control account. Continue anyway?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onCancelArApGuard}>Cancel</Button>
              <Button size="sm" onClick={onConfirmArApGuard}>Continue</Button>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={onSaveLine} disabled={!draftLine || !draftLine.accountCode}
          className="flex items-center gap-2">
          <Plus className="w-3.5 h-3.5" />
          {editingLineId ? 'Save Line' : 'Add Line'}
        </Button>
      </div>
    </Modal>
  )
}
