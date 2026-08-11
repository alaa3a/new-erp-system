'use client'
import { formatCurrency } from '@/lib/formatters'
import { StatusBadge, ModalHeader, EmptyState, SearchInput } from '@/components/ui'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
   Plus, Eye, Loader2, Trash2,
  X, AlertTriangle, CheckCircle, Package, BookOpen,
} from 'lucide-react'
import SearchSelect from '@/components/form/SearchSelect'
import DatePicker from '@/components/form/input/DatePicker'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type { Invoice, InvoiceLine } from '@/types/erp'

// ─── Constants ─────────────────────────────────────────────────────────

const statusStyles: Record<string, string> = {
  draft: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400',
  posted: 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  partial_paid: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400',
  paid: 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  cancelled: 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  posted: 'Applied',
  partial_paid: 'Partial',
  paid: 'Applied',
  cancelled: 'Cancelled',
}

const statusFilters = ['all', 'draft', 'posted', 'cancelled'] as const

// ─── Types ──────────────────────────────────────────────────────────────

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
}

interface NoteFormData {
  linkedInvoiceId: number | null
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

interface BusinessPartner {
  id: number
  code: string
  name: string
  type: string
  taxRegistrationNumber: string
}

interface Product {
  id: number
  code: string
  name: string
  itemType: 'stock' | 'service'
  unitOfMeasure: string
  salesPrice: number
  purchasePrice: number
  vatCodeId: number | null
  purchaseVatCodeId: number | null
  isActive: boolean | undefined
  defaultWarehouseId: number | null
}

interface TaxCode {
  id: number
  code: string
  name: string
  rate: number
  type: 'output' | 'input'
  isGroup: boolean
  accountCode: string
}

interface Warehouse {
  id: number
  code: string
  name: string
}

interface PostingProfile {
  id: number
  name: string
  invoiceType: string
  accountsReceivableCode: string
  accountsPayableCode: string
  inventoryAccountCode: string | null
  cogsAccountCode: string | null
}

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

// ─── Helpers ────────────────────────────────────────────────────────────

const emptyForm = (): NoteFormData => ({
  linkedInvoiceId: null,
  businessPartnerId: null,
  partnerName: '',
  partnerTaxReg: '',
  invoiceDate: '',
  dueDate: '',
  postingProfileId: null,
  warehouseId: null,
  referenceNumber: '',
  notes: '',
  lines: [],
})

let _lineKey = 0
const nextLineId = () => `line_${++_lineKey}`

const newLine = (): LineFormData => ({
  id: nextLineId(),
  productId: null,
  productCode: '',
  productName: '',
  description: '',
  quantity: 1,
  unitPrice: 0,
  discountPercent: 0,
  vatCodeId: null,
  vatRate: 0,
  warehouseId: null,
  lineType: 'stock',
})

// ─── Main Component ─────────────────────────────────────────────────────

export default function DebitNotePage() {
  const toast = useToast()
  const [notes, setNotes] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const [purchaseInvoices, setPurchaseInvoices] = useState<Invoice[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([])
  const [postingProfiles, setPostingProfiles] = useState<PostingProfile[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [partners, setPartners] = useState<BusinessPartner[]>([])

  const [showForm, setShowForm] = useState(false)
  const [editingNote, setEditingNote] = useState<Invoice | null>(null)
  const [formData, setFormData] = useState<NoteFormData>(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [viewNote, setViewNote] = useState<Invoice | null>(null)
  const [viewLines, setViewLines] = useState<InvoiceLine[]>([])
  const [viewLoading, setViewLoading] = useState(false)

  const [previewNote, setPreviewNote] = useState<Invoice | null>(null)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const [postTarget, setPostTarget] = useState<Invoice | null>(null)
  const [posting, setPosting] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null)

  const fetchNotes = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/invoices?type=debit_note'); if (r.ok) { const json = await r.json(); if (json.success) setNotes(json.data) } } catch {}
    finally { setLoading(false) }
  }, [])

  const fetchRefData = useCallback(async () => {
    try {
      const [piR, prR, txR, ppR, whR, pR] = await Promise.all([
        fetch('/api/invoices?type=purchase&status=posted'), fetch('/api/products'),
        fetch('/api/tax-codes'), fetch('/api/posting-profiles'), fetch('/api/warehouses'), fetch('/api/partners'),
      ])
      if (piR.ok) { const json = await piR.json(); if (json.success) setPurchaseInvoices(json.data) }
      if (prR.ok) { const json = await prR.json(); if (json.success) setProducts(json.data) }
      if (txR.ok) { const json = await txR.json(); if (json.success) setTaxCodes(json.data) }
      if (ppR.ok) { const json = await ppR.json(); setPostingProfiles((json.data || []).filter((p: any) => p.invoiceType === 'sales')) }
      if (whR.ok) { const json = await whR.json(); if (json.success) setWarehouses(json.data) }
      if (pR.ok) { const json = await pR.json(); if (json.success) setPartners(json.data) }
    } catch {}
  }, [])

  useEffect(() => { fetchNotes() }, [fetchNotes])
  useEffect(() => { fetchRefData() }, [fetchRefData])

  const filtered = useMemo(() => notes.filter(n => {
    if (statusFilter !== 'all' && n.status !== statusFilter) return false
    if (searchQuery) { const q = searchQuery.toLowerCase(); return n.invoiceNumber.toLowerCase().includes(q) || n.partnerName.toLowerCase().includes(q) }
    return true
  }), [notes, statusFilter, searchQuery])

  const lineTotals = useMemo(() => {
    let s = 0, v = 0
    for (const l of formData.lines) { const lt = l.quantity * l.unitPrice * (1 - l.discountPercent / 100); const vt = lt * (l.vatRate / 100); s += lt; v += vt }
    return { subtotal: s, vatAmount: v, total: s + v }
  }, [formData.lines])

  const openAddForm = () => {
    setEditingNote(null)
    const now = new Date()
    setFormData({
      ...emptyForm(),
      invoiceDate: now.toISOString().split('T')[0],
      dueDate: new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0],
    })
    setFormError('')
    setShowForm(true)
  }

  const handleLinkedInvoiceSelect = (val: string | number | null) => {
    const id = val ? Number(val) : null; const inv = id ? purchaseInvoices.find(i => i.id === id) : null
    if (inv) {
      const p = partners.find(pp => pp.name === inv.partnerName)
      setFormData(prev => ({ ...prev, linkedInvoiceId: id, businessPartnerId: inv.businessPartnerId, partnerName: inv.partnerName, partnerTaxReg: p?.taxRegistrationNumber || '' }))
    } else { setFormData(prev => ({ ...prev, linkedInvoiceId: null, businessPartnerId: null, partnerName: '', partnerTaxReg: '' })) }
  }

  const handleSave = async (action: 'draft' | 'post') => {
    setSubmitting(true); setFormError('')
    if (!formData.partnerName.trim()) { setFormError('Vendor is required'); setSubmitting(false); return }
    if (formData.lines.length === 0) { setFormError('At least one line item is required'); setSubmitting(false); return }
    try {
      const body = { type: 'debit_note', businessPartnerId: formData.businessPartnerId, partnerName: formData.partnerName.trim(),
        linkedInvoiceId: formData.linkedInvoiceId, postingProfileId: formData.postingProfileId, invoiceDate: formData.invoiceDate,
        dueDate: formData.dueDate, warehouseId: formData.warehouseId, referenceNumber: formData.referenceNumber.trim(),
        notes: formData.notes.trim(), lines: formData.lines.map(l => ({ productId: l.productId, description: l.description || l.productName,
          quantity: l.quantity, unitPrice: Math.round(l.unitPrice * 100), discountPercent: l.discountPercent, vatCodeId: l.vatCodeId,
          vatRate: l.vatRate, warehouseId: l.warehouseId, lineType: l.lineType })) }
      let id: number
      if (editingNote) {
        const r = await fetch(`/api/invoices/${editingNote.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!r.ok) throw new Error((await r.json()).error || 'Failed'); id = (await r.json()).id
      } else {
        const r = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!r.ok) throw new Error((await r.json()).error || 'Failed'); id = (await r.json()).id
      }
      if (action === 'post') { const pr = await fetch(`/api/invoices/${id}/post`, { method: 'POST' }); if (!pr.ok) throw new Error((await pr.json()).error || 'Failed') }
      closeForm(); await fetchNotes()
      toast.success(action === 'post' ? 'Debit note saved & posted' : 'Debit note saved as draft')
    } catch (err: any) { setFormError(err?.message || 'Error'); toast.error(err?.message || 'Failed to save debit note') } finally { setSubmitting(false) }
  }

  const closeForm = () => { setShowForm(false); setEditingNote(null); setFormError('') }
  const addLine = () => setFormData(p => ({ ...p, lines: [...p.lines, newLine()] }))
  const removeLine = (id: string) => setFormData(p => ({ ...p, lines: p.lines.filter(l => l.id !== id) }))
  const updateLine = (id: string, u: Partial<LineFormData>) => setFormData(p => ({ ...p, lines: p.lines.map(l => l.id === id ? { ...l, ...u } : l) }))

  const handleProductSelect = (lineId: string, pid: number | null) => {
    if (!pid) { updateLine(lineId, { productId: null, productCode: '', productName: '', description: '', unitPrice: 0, lineType: 'stock', warehouseId: null }); return }
    const p = products.find(pp => pp.id === pid)
    if (p) {
      updateLine(lineId, { productId: p.id, productCode: p.code, productName: p.name, description: p.name,
        unitPrice: Math.round(p.salesPrice / 100), lineType: p.itemType, warehouseId: p.defaultWarehouseId || formData.warehouseId,
        vatCodeId: p.vatCodeId, vatRate: taxCodes.find(t => t.id === p.vatCodeId)?.rate || 0 })
    }
  }

  const openViewDetail = async (n: Invoice) => {
    setViewNote(n); setViewLoading(true)
    try { const r = await fetch(`/api/invoices/${n.id}`); if (r.ok) { const d = await r.json(); setViewLines(d.lines || []) } else setViewLines([]) } catch { setViewLines([]) } finally { setViewLoading(false) }
  }

  const openPreview = async (n: Invoice) => {
    setPreviewNote(n); setPreviewData(null); setPreviewLoading(true)
    try { const r = await fetch(`/api/invoices/${n.id}/preview`, { method: 'POST' }); if (r.ok) { const json = await r.json(); if (json.success) setPreviewData(json.data) } } catch {} finally { setPreviewLoading(false) }
  }

  const handlePost = async () => {
    if (!postTarget) return; setPosting(true)
    try { const r = await fetch(`/api/invoices/${postTarget.id}/post`, { method: 'POST' }); if (!r.ok) throw new Error((await r.json()).error || 'Failed'); setPostTarget(null); await fetchNotes(); toast.success(`Debit note ${postTarget.invoiceNumber} posted`) } catch (err: any) { toast.error(err.message || 'Failed to post debit note') } finally { setPosting(false) }
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    try { const r = await fetch(`/api/invoices/${cancelTarget.id}`, { method: 'DELETE' }); if (!r.ok) throw new Error((await r.json()).error || 'Failed'); setCancelTarget(null); await fetchNotes(); toast.success(`Debit note ${cancelTarget.invoiceNumber} cancelled`) } catch (err: any) { toast.error(err.message || 'Failed to cancel debit note') }
  }

  const purchaseInvOptions = useMemo(() => purchaseInvoices.map(i => ({ id: i.id, label: `${i.invoiceNumber} — ${i.partnerName} (${formatCurrency(i.totalAmount)})` })), [purchaseInvoices])
  const productOptions = useMemo(() => products.filter(p => p.isActive !== false).map(p => ({ id: p.id, label: `${p.code} — ${p.name} (${p.unitOfMeasure})` })), [products])
  const outputTaxCodes = useMemo(() => taxCodes.filter(t => t.type === 'output' && !t.isGroup).map(t => ({ id: t.id, label: `${t.code} — ${t.name} (${t.rate}%)`, rate: t.rate })), [taxCodes])
  const profileOptions = useMemo(() => postingProfiles.map(p => ({ id: p.id, label: p.name })), [postingProfiles])
  const warehouseOptions = useMemo(() => warehouses.map(w => ({ id: w.id, label: `${w.code} — ${w.name}` })), [warehouses])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Debit Notes</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage debit notes and vendor adjustments against purchase invoices.</p>
        </div>
        <button onClick={openAddForm}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> New Debit Note
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {statusFilters.map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${statusFilter === f ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{f === 'all' ? 'All' : statusLabels[f] || f}</button>
        ))}
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search debit notes..." className="ml-auto max-w-xs" />
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /><span className="ml-2 text-sm text-gray-500">Loading...</span></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Note #</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Original Invoice</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.length === 0 ? <tr><td colSpan={7}><EmptyState compact title="No debit notes found." /></td></tr> : (
                  filtered.map(n => (
                    <tr key={n.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-3 px-4 text-sm font-mono font-medium text-brand-600">{n.invoiceNumber}</td>
                      <td className="py-3 px-4 text-sm text-gray-500">{n.invoiceDate}</td>
                      <td className="py-3 px-4 text-sm text-gray-900">{n.partnerName}</td>
                      <td className="py-3 px-4 text-sm text-gray-500">{n.linkedInvoiceId ? purchaseInvoices.find(i => i.id === n.linkedInvoiceId)?.invoiceNumber || `#${n.linkedInvoiceId}` : '-'}</td>
                      <td className="py-3 px-4 text-sm text-right font-medium text-gray-900">{formatCurrency(n.totalAmount)}</td>
                      <td className="py-3 px-4 text-center"><StatusBadge label={statusLabels[n.status] || n.status} color={statusStyles[n.status]} /></td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openViewDetail(n)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors" title="View"><Eye className="w-3.5 h-3.5" /></button>
                          {n.status === 'draft' && (
                            <>
                              <button onClick={() => openPreview(n)} className="p-1.5 rounded-lg text-gray-400 hover:text-purple-500 hover:bg-purple-50 transition-colors" title="Preview"><BookOpen className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setPostTarget(n)} className="p-1.5 rounded-lg text-gray-400 hover:text-green-500 hover:bg-green-50 transition-colors" title="Post"><CheckCircle className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setCancelTarget(n)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Cancel"><X className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ═══ CREATE/EDIT MODAL ═══ */}
      <Modal isOpen={showForm} onClose={closeForm} className="max-w-4xl p-0" showCloseButton={false}>
        <ModalHeader title={editingNote ? `Edit ${editingNote.invoiceNumber}` : 'New Debit Note'} onClose={closeForm} />
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Link to Purchase Invoice</label>
              <SearchSelect options={purchaseInvOptions} value={formData.linkedInvoiceId} onChange={handleLinkedInvoiceSelect}
                placeholder="Select original..." searchPlaceholder="Search invoices..." notFoundLabel="No posted invoices" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Vendor *</label>
              <input type="text" value={formData.partnerName} onChange={e => setFormData(p => ({ ...p, partnerName: e.target.value }))}
                placeholder="Auto-filled" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Date</label>
              <DatePicker value={formData.invoiceDate} onChange={(v) => setFormData(p => ({ ...p, invoiceDate: v }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Due Date</label>
              <DatePicker value={formData.dueDate} onChange={(v) => setFormData(p => ({ ...p, dueDate: v }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Posting Profile</label>
              <SearchSelect options={profileOptions} value={formData.postingProfileId}
                onChange={(v) => setFormData(p => ({ ...p, postingProfileId: v ? Number(v) : null }))} placeholder="Select profile..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Warehouse</label>
              <SearchSelect options={warehouseOptions} value={formData.warehouseId}
                onChange={(v) => setFormData(p => ({ ...p, warehouseId: v ? Number(v) : null }))} placeholder="Default..." noneLabel="None" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reference #</label>
              <input type="text" value={formData.referenceNumber} onChange={e => setFormData(p => ({ ...p, referenceNumber: e.target.value }))}
                placeholder="Ref" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Notes</label>
              <input type="text" value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                placeholder="Optional" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Line Items</h4>
              <button type="button" onClick={addLine}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 text-xs font-medium hover:bg-brand-100 dark:hover:bg-brand-950/50 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Item</button>
            </div>
            {formData.lines.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
                <Package className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-400 dark:text-gray-500">No line items yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {formData.lines.map((line, idx) => {
                  const lt = line.quantity * line.unitPrice * (1 - line.discountPercent / 100)
                  return (
                    <div key={line.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <span className="text-xs font-medium text-gray-400 shrink-0">#{idx + 1}</span>
                        <button onClick={() => removeLine(line.id)} className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2">
                        <div className="lg:col-span-3"><label className="block text-[11px] font-medium text-gray-500 mb-1">Product</label>
                          <SearchSelect options={productOptions} value={line.productId} onChange={(v) => handleProductSelect(line.id, v ? Number(v) : null)} placeholder="Select..." searchPlaceholder="Search..." notFoundLabel="No products" /></div>
                        <div className="lg:col-span-2"><label className="block text-[11px] font-medium text-gray-500 mb-1">Description</label>
                          <input type="text" value={line.description} onChange={e => updateLine(line.id, { description: e.target.value })} placeholder="Desc" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white" /></div>
                        <div className="lg:col-span-1"><label className="block text-[11px] font-medium text-gray-500 mb-1">Qty</label>
                          <input type="number" value={line.quantity || ''} min={1} onChange={e => updateLine(line.id, { quantity: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white text-center" /></div>
                        <div className="lg:col-span-2"><label className="block text-[11px] font-medium text-gray-500 mb-1">Unit Price ($)</label>
                          <input type="number" value={line.unitPrice || ''} min={0} step="0.01" onChange={e => updateLine(line.id, { unitPrice: Number(e.target.value) || 0 })} className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white text-right" /></div>
                        <div className="lg:col-span-1"><label className="block text-[11px] font-medium text-gray-500 mb-1">Disc %</label>
                          <input type="number" value={line.discountPercent || ''} min={0} max={100} step="0.01" onChange={e => updateLine(line.id, { discountPercent: Number(e.target.value) || 0 })} className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white text-center" /></div>
                        <div className="lg:col-span-2"><label className="block text-[11px] font-medium text-gray-500 mb-1">Output VAT</label>
                          <SearchSelect options={outputTaxCodes} value={line.vatCodeId} onChange={(v, item) => { updateLine(line.id, { vatCodeId: v ? Number(v) : null, vatRate: (item as any)?.rate || 0 }) }} placeholder="VAT..." noneLabel="No VAT" searchPlaceholder="Search..." notFoundLabel="No VAT" /></div>
                        <div className="lg:col-span-1 flex flex-col justify-end"><label className="block text-[11px] font-medium text-gray-500 mb-1">Total</label>
                          <div className="px-2.5 py-1.5 text-xs font-semibold text-gray-900 dark:text-white text-right bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">${lt.toFixed(2)}</div></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="ml-auto max-w-xs space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="text-gray-900 font-medium">${lineTotals.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">VAT</span><span className="text-gray-900 font-medium">${lineTotals.vatAmount.toFixed(2)}</span></div>
              <div className="flex justify-between text-base border-t border-gray-200 pt-1.5"><span className="font-semibold text-gray-900">Total</span><span className="font-bold text-brand-600">${lineTotals.total.toFixed(2)}</span></div>
            </div>
          </div>
          {formError && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5"><p className="text-sm text-red-700">{formError}</p></div>}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <Button variant="outline" size="sm" onClick={closeForm} disabled={submitting}>Cancel</Button>
          <Button size="sm" onClick={() => handleSave('draft')} disabled={submitting} className="flex items-center gap-2">
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}Save as Draft</Button>
          <Button size="sm" onClick={() => handleSave('post')} disabled={submitting}
            className="flex items-center gap-2 !bg-green-600 hover:!bg-green-700">
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}Save & Post</Button>
        </div>
      </Modal>

      {/* ═══ VIEW DETAIL ═══ */}
      <Modal isOpen={!!viewNote} onClose={() => setViewNote(null)} className="max-w-3xl p-0" showCloseButton={false}>
        <ModalHeader title={`Debit Note ${viewNote?.invoiceNumber}`} onClose={() => setViewNote(null)}>
          {viewNote && <StatusBadge label={statusLabels[viewNote.status]} color={statusStyles[viewNote.status]} size="sm" className="mt-1" />}
        </ModalHeader>
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {viewLoading ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-brand-500 animate-spin" /></div> : viewNote ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <div><p className="text-xs text-gray-500">Vendor</p><p className="text-sm font-medium text-gray-900 mt-0.5">{viewNote.partnerName}</p></div>
                <div><p className="text-xs text-gray-500">Date</p><p className="text-sm font-medium text-gray-900 mt-0.5">{viewNote.invoiceDate}</p></div>
                <div><p className="text-xs text-gray-500">Linked</p><p className="text-sm font-medium text-gray-900 mt-0.5">{viewNote.linkedInvoiceId ? `#${viewNote.linkedInvoiceId}` : '—'}</p></div>
                <div><p className="text-xs text-gray-500">Subtotal</p><p className="text-sm font-medium text-gray-900 mt-0.5">{formatCurrency(viewNote.subtotal)}</p></div>
                <div><p className="text-xs text-gray-500">VAT</p><p className="text-sm font-medium text-gray-900 mt-0.5">{formatCurrency(viewNote.vatAmount)}</p></div>
                <div><p className="text-xs text-gray-500">Total</p><p className="text-sm font-semibold text-brand-600 mt-0.5">{formatCurrency(viewNote.totalAmount)}</p></div>
              </div>
              <div><h4 className="text-sm font-semibold text-gray-900 mb-3">Line Items</h4>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-200"><th className="text-left py-2 px-3 text-xs font-medium text-gray-500">#</th><th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Product</th><th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Description</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Qty</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Price</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Disc%</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-500">VAT</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Total</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {viewLines.length === 0 ? <tr><td colSpan={8} className="py-8 text-center text-sm text-gray-400">No line items</td></tr> : viewLines.map(l => (
                      <tr key={l.id}><td className="py-2 px-3 text-xs text-gray-400">{l.lineNumber}</td><td className="py-2 px-3 text-xs font-medium text-gray-900">#{l.productId}</td><td className="py-2 px-3 text-xs text-gray-600">{l.description}</td><td className="py-2 px-3 text-xs text-right">{l.quantity}</td><td className="py-2 px-3 text-xs text-right">{formatCurrency(l.unitPrice)}</td><td className="py-2 px-3 text-xs text-right">{l.discountPercent}%</td><td className="py-2 px-3 text-xs text-right">{formatCurrency(l.vatAmount)}</td><td className="py-2 px-3 text-xs text-right font-semibold">{formatCurrency(l.lineTotal)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <p className="text-center text-sm text-gray-400 py-8">Not found.</p>}
        </div>
        <div className="p-6 border-t border-gray-200 flex justify-end bg-gray-50 rounded-b-3xl"><Button variant="outline" size="sm" onClick={() => setViewNote(null)}>Close</Button></div>
      </Modal>

      {/* ═══ PREVIEW ═══ */}
      <Modal isOpen={!!previewNote} onClose={() => setPreviewNote(null)} className="max-w-3xl p-0" showCloseButton={false}>
        <ModalHeader title="Posting Preview" subtitle={previewNote ? `${previewNote.invoiceNumber} — ${previewNote.partnerName}` : undefined} onClose={() => setPreviewNote(null)} />
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
          {previewLoading ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-brand-500 animate-spin" /></div> : previewData ? (
            <>
              <div><h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4 text-brand-500" /> Accounting Entries</h4>
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 border-b border-gray-200"><th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Account</th><th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Description</th><th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Debit ($)</th><th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Credit ($)</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewData.entries.map((e, i) => (
                        <tr key={i} className="hover:bg-gray-50"><td className="py-2 px-3 text-xs font-mono font-medium text-gray-900">{e.accountCode}</td><td className="py-2 px-3 text-xs text-gray-600">{e.description}</td>
                          <td className="py-2 px-3 text-xs text-right font-medium text-green-600">{e.debitAmount > 0 ? `$${(e.debitAmount / 100).toFixed(2)}` : '—'}</td>
                          <td className="py-2 px-3 text-xs text-right font-medium text-red-600">{e.creditAmount > 0 ? `$${(e.creditAmount / 100).toFixed(2)}` : '—'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {previewData.stockMovements.length > 0 && (
                <div><h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2"><Package className="w-4 h-4 text-amber-500" /> Stock Movements</h4>
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50 border-b border-gray-200"><th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Product ID</th><th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Qty</th><th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Cost</th><th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Type</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {previewData.stockMovements.map((sm, i) => (
                          <tr key={i}><td className="py-2 px-3 text-xs font-mono">#{sm.productId}</td><td className="py-2 px-3 text-xs text-right font-medium text-gray-900">{sm.quantity}</td>
                            <td className="py-2 px-3 text-xs text-right">${(sm.unitCost / 100).toFixed(2)}</td>
                            <td className="py-2 px-3 text-xs"><span className={`inline-flex text-[11px] font-medium px-1.5 py-0.5 rounded-full ${sm.quantity < 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{sm.quantity < 0 ? 'Issue (Out)' : 'Receipt (In)'}</span></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : <div className="flex justify-center py-12"><AlertTriangle className="w-5 h-5 text-amber-500 mr-2" /><span className="text-sm text-gray-500">Failed to generate preview.</span></div>}
        </div>
        <div className="p-6 border-t border-gray-200 flex items-center justify-between bg-gray-50 rounded-b-3xl">
          <Button variant="outline" size="sm" onClick={() => setPreviewNote(null)}>Close</Button>
          {previewNote && previewNote.status === 'draft' && (
            <Button size="sm" onClick={() => { setPostTarget(previewNote); setPreviewNote(null) }} className="flex items-center gap-2 !bg-green-600 hover:!bg-green-700">
              <CheckCircle className="w-3.5 h-3.5" /> Post Debit Note</Button>)}
        </div>
      </Modal>

      {/* ═══ POST CONFIRM ═══ */}
      <Modal isOpen={!!postTarget} onClose={() => setPostTarget(null)} className="max-w-sm p-6">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-4"><CheckCircle className="w-6 h-6 text-green-500" /></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Post Debit Note</h3>
          <p className="text-sm text-gray-500 mb-2">Post <strong>{postTarget?.invoiceNumber}</strong>?</p>
          <p className="text-xs text-amber-600 flex items-center justify-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Cannot be undone.</p>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
          <Button variant="outline" size="sm" onClick={() => setPostTarget(null)} disabled={posting}>Cancel</Button>
          <Button size="sm" onClick={handlePost} disabled={posting} className="flex items-center gap-2 !bg-green-600 hover:!bg-green-700">
            {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}{posting ? 'Posting...' : 'Confirm'}</Button>
        </div>
      </Modal>

      {/* ═══ CANCEL CONFIRM ═══ */}
      <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} className="max-w-sm p-6">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4"><AlertTriangle className="w-6 h-6 text-red-500" /></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Cancel Debit Note</h3>
          <p className="text-sm text-gray-500">Cancel <strong>{cancelTarget?.invoiceNumber}</strong>?</p>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
          <Button variant="outline" size="sm" onClick={() => setCancelTarget(null)}>Keep</Button>
          <Button size="sm" onClick={handleCancel} className="flex items-center gap-2 !bg-red-600 hover:!bg-red-700"><X className="w-3.5 h-3.5" /> Cancel</Button>
        </div>
      </Modal>
    </div>
  )
}
