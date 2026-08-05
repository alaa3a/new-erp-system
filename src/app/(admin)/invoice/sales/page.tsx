'use client'
import { formatCurrency } from '@/lib/formatters'
import { ClearFiltersButton, StatusBadge, ModalHeader, EmptyState, SearchInput, StatCard } from '@/components/ui'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { usePagination } from '@/hooks/usePagination'
import {
   Plus, Eye, Edit3, Loader2, Trash2, DollarSign,
  X, AlertTriangle, CheckCircle, BadgeCheck, Package, BookOpen, Link2,
} from 'lucide-react'
import SearchSelect from '@/components/form/SearchSelect'
import DatePicker from '@/components/form/input/DatePicker'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import RecordPaymentModal from '@/components/invoices/RecordPaymentModal'
import { Pagination } from '@/components/Pagination'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type { Invoice, InvoiceLine } from '@/types/erp'

// ─── Constants ─────────────────────────────────────────────────────────

const statusStyles: Record<string, string> = {
  draft: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400',
  posted: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
  partial_paid: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400',
  paid: 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  cancelled: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400',
}

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  posted: 'Posted',
  partial_paid: 'Partial Paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

const statusFilters = ['all', 'draft', 'posted', 'partial_paid', 'paid', 'cancelled'] as const

// ─── Types ──────────────────────────────────────────────────────────────

interface LineFormData {
  id: string
  productId: number | null
  productCode: string
  productName: string
  description: string
  quantity: number
  unitPrice: number // dollars
  discountPercent: number
  vatCodeId: number | null
  vatRate: number
  warehouseId: number | null
  lineType: 'stock' | 'service'
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

interface BusinessPartner {
  id: number
  code: string
  name: string
  type: string
  email: string
  phone: string
  taxRegistrationNumber: string
  creditLimit: number
}

interface Product {
  id: number
  code: string
  name: string
  itemType: 'stock' | 'service'
  unitOfMeasure: string
  salesPrice: number
  isActive: boolean | undefined
  vatCodeId: number | null
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

interface PostingProfile {
  id: number
  name: string
  invoiceType: string
  accountsReceivableCode: string
  accountsPayableCode: string
  inventoryAccountCode: string | null
  cogsAccountCode: string | null
}

interface Warehouse {
  id: number
  code: string
  name: string
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

const emptyForm = (): InvoiceFormData => ({
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

export default function SalesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /><span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading sales...</span></div>}>
      <SalesPageContent />
    </Suspense>
  )
}

function SalesPageContent() {
  const toast = useToast()
  // ── Data state ──
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const { page, pageSize, setFilterAndResetPage } = usePagination()

  // ── Reference data ──
  const [partners, setPartners] = useState<BusinessPartner[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([])
  const [postingProfiles, setPostingProfiles] = useState<PostingProfile[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  // ── Form state ──
  const [showForm, setShowForm] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [formData, setFormData] = useState<InvoiceFormData>(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // ── View detail ──
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null)
  const [viewLines, setViewLines] = useState<InvoiceLine[]>([])
  const [viewLoading, setViewLoading] = useState(false)

  // ── Preview posting ──
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // ── Post confirmation ──
  const [postTarget, setPostTarget] = useState<Invoice | null>(null)
  const [posting, setPosting] = useState(false)

  // ── Approve confirmation ──
  const [approveTarget, setApproveTarget] = useState<Invoice | null>(null)
  const [approving, setApproving] = useState(false)

  // ── Cancel confirmation ──
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null)

  // ── Match to PO ──
  const [matchPOOpen, setMatchPOOpen] = useState(false)
  const [matchInvoiceTarget, setMatchInvoiceTarget] = useState<Invoice | null>(null)
  const [matchPOList, setMatchPOList] = useState<{ id: number; poNumber: string; partnerName: string; status: string }[]>([])
  const [matchPOLoading, setMatchPOLoading] = useState(false)
  const [matchPOSearch, setMatchPOSearch] = useState('')
  const [selectedPOId, setSelectedPOId] = useState<number | null>(null)
  const [matchPOSubmitting, setMatchPOSubmitting] = useState(false)
  const [matchPOError, setMatchPOError] = useState('')

  // ── Unlink PO ──
  const [unlinkPOTarget, setUnlinkPOTarget] = useState<Invoice | null>(null)
  const [unlinkPOSubmitting, setUnlinkPOSubmitting] = useState(false)

  // ── Record Payment ──
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null)

  // ── Fetch invoices ──
  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('type', 'sales')
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (searchQuery) params.set('search', searchQuery)
      const res = await fetch(`/api/invoices?${params}`)
      if (res.ok) { const json = await res.json(); if (json.success) { setInvoices(json.data); setTotal(json.total) } }
    } catch (err) {
      console.error('Failed to fetch sales invoices:', err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter, searchQuery])

  // ── Fetch reference data ──
  const fetchRefData = useCallback(async () => {
    try {
      const [pRes, prodRes, taxRes, ppRes, whRes] = await Promise.all([
        fetch('/api/partners'),
        fetch('/api/products'),
        fetch('/api/tax-codes'),
        fetch('/api/posting-profiles'),
        fetch('/api/warehouses'),
      ])
      if (pRes.ok) setPartners(await pRes.json())
      if (prodRes.ok) setProducts(await prodRes.json())
      if (taxRes.ok) setTaxCodes(await taxRes.json())
      if (ppRes.ok) {
        const all = await ppRes.json()
        setPostingProfiles(all.filter((p: PostingProfile) => p.invoiceType === 'sales'))
      }
      if (whRes.ok) setWarehouses(await whRes.json())
    } catch (err) {
      console.error('Failed to fetch reference data:', err)
    }
  }, [])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])
  useEffect(() => { fetchRefData() }, [fetchRefData])

  // ── Filtered list ──
  const filtered = useMemo(() => invoices.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return inv.invoiceNumber.toLowerCase().includes(q) || inv.partnerName.toLowerCase().includes(q)
    }
    return true
  }), [invoices, statusFilter, searchQuery])

  const totalSales = useMemo(() => filtered.reduce((s, i) => s + i.totalAmount, 0), [filtered])
  const totalPaid = useMemo(() => filtered.reduce((s, i) => s + i.paidAmount, 0), [filtered])
  const totalPending = useMemo(() =>
    filtered.filter(i => i.status === 'posted' || i.status === 'partial_paid')
      .reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0), [filtered])
  const totalCancelled = useMemo(() =>
    filtered.filter(i => i.status === 'cancelled').reduce((s, i) => s + i.totalAmount, 0), [filtered])

  // Unfiltered totals for summary when filters are active
  const allSales = useMemo(() => invoices.reduce((s, i) => s + i.totalAmount, 0), [invoices])
  const allPaidTotal = useMemo(() => invoices.reduce((s, i) => s + i.paidAmount, 0), [invoices])
  const allPendingTotal = useMemo(() =>
    invoices.filter(i => i.status === 'posted' || i.status === 'partial_paid')
      .reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0), [invoices])
  const allCancelledTotal = useMemo(() =>
    invoices.filter(i => i.status === 'cancelled').reduce((s, i) => s + i.totalAmount, 0), [invoices])
  const isFilterActive = statusFilter !== 'all' || searchQuery !== ''

  // ── Derived totals ──
  const lineTotals = useMemo(() => {
    let subtotal = 0
    let vatAmt = 0
    for (const line of formData.lines) {
      const lineTotal = line.quantity * line.unitPrice * (1 - line.discountPercent / 100)
      const vat = lineTotal * (line.vatRate / 100)
      subtotal += lineTotal
      vatAmt += vat
    }
    return { subtotal, vatAmount: vatAmt, total: subtotal + vatAmt }
  }, [formData.lines])

  // ── Form helpers ──
  const openAddForm = () => {
    setEditingInvoice(null)
    const now = new Date()
    setFormData({
      ...emptyForm(),
      invoiceDate: now.toISOString().split('T')[0],
      dueDate: new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0],
    })
    setFormError('')
    setShowForm(true)
  }

  const openEditForm = async (inv: Invoice) => {
    setEditingInvoice(inv)
    setFormError('')
    setFormData({
      businessPartnerId: inv.businessPartnerId,
      partnerName: inv.partnerName,
      partnerTaxReg: '',
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      postingProfileId: inv.postingProfileId,
      warehouseId: inv.warehouseId,
      referenceNumber: inv.referenceNumber,
      notes: inv.notes,
      lines: [],
    })
    // Fetch lines
    try {
      const res = await fetch(`/api/invoices/${inv.id}`)
      if (res.ok) {
        const json = await res.json()
        if (!json.success) throw new Error(json.error || 'Request failed')
        const data = json.data
        if (data.lines) {
          setFormData(prev => ({
            ...prev,
            lines: data.lines.map((l: InvoiceLine) => ({
              id: nextLineId(),
              productId: l.productId,
              productCode: '',
              productName: '',
              description: l.description,
              quantity: l.quantity,
              unitPrice: Math.round(l.unitPrice / 100),
              discountPercent: l.discountPercent,
              vatCodeId: l.vatCodeId,
              vatRate: l.vatRate,
              warehouseId: l.warehouseId,
              lineType: l.lineType,
            })),
          }))
        }
      }
    } catch (err) {
      console.error('Failed to fetch invoice lines:', err)
    }
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingInvoice(null)
    setFormError('')
  }

  const addLine = () => {
    setFormData(prev => ({ ...prev, lines: [...prev.lines, newLine()] }))
  }

  const removeLine = (id: string) => {
    setFormData(prev => ({ ...prev, lines: prev.lines.filter(l => l.id !== id) }))
  }

  const updateLine = (id: string, updates: Partial<LineFormData>) => {
    setFormData(prev => ({
      ...prev,
      lines: prev.lines.map(l => l.id === id ? { ...l, ...updates } : l),
    }))
  }

  const handleProductSelect = (lineId: string, productId: number | null) => {
    if (productId === null) {
      updateLine(lineId, { productId: null, productCode: '', productName: '', description: '', unitPrice: 0, lineType: 'stock', warehouseId: null })
      return
    }
    const product = products.find(p => p.id === productId)
    if (product) {
      const salesTaxCodes = taxCodes.filter(t => t.type === 'output' && !t.isGroup)
      const defaultVat = product.vatCodeId
        ? taxCodes.find(t => t.id === product.vatCodeId)
        : null

      updateLine(lineId, {
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        description: product.name,
        unitPrice: Math.round(product.salesPrice / 100),
        lineType: product.itemType,
        warehouseId: product.defaultWarehouseId || formData.warehouseId,
        vatCodeId: defaultVat?.id || null,
        vatRate: defaultVat?.rate || 0,
      })
    }
  }

  const handlePartnerSelect = (partnerId: string | number | null) => {
    const id = partnerId ? Number(partnerId) : null
    const partner = id ? partners.find(p => p.id === id) : null
    setFormData(prev => ({
      ...prev,
      businessPartnerId: id,
      partnerName: partner?.name || '',
      partnerTaxReg: partner?.taxRegistrationNumber || '',
    }))
  }

  const handleSave = async (action: 'draft' | 'post') => {
    setSubmitting(true)
    setFormError('')

    if (!formData.partnerName.trim()) {
      setFormError('Partner is required')
      setSubmitting(false)
      return
    }
    if (formData.lines.length === 0) {
      setFormError('At least one line item is required')
      setSubmitting(false)
      return
    }

    try {
      const body = {
        type: 'sales',
        businessPartnerId: formData.businessPartnerId,
        partnerName: formData.partnerName.trim(),
        postingProfileId: formData.postingProfileId,
        invoiceDate: formData.invoiceDate,
        dueDate: formData.dueDate,
        warehouseId: formData.warehouseId,
        referenceNumber: formData.referenceNumber.trim(),
        notes: formData.notes.trim(),
        lines: formData.lines.map(l => ({
          productId: l.productId,
          description: l.description || l.productName,
          quantity: l.quantity,
          unitPrice: Math.round(l.unitPrice * 100),
          discountPercent: l.discountPercent,
          vatCodeId: l.vatCodeId,
          vatRate: l.vatRate,
          warehouseId: l.warehouseId,
          lineType: l.lineType,
        })),
      }

      let invoiceId: number

      if (editingInvoice) {
        const res = await fetch(`/api/invoices/${editingInvoice.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to update invoice')
        }
        const json = await res.json()
        invoiceId = json.data?.id
      } else {
        const res = await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to create invoice')
        }
        const json = await res.json()
        invoiceId = json.data?.id
      }

      // If action is 'post', post the invoice
      if (action === 'post') {
        const postRes = await fetch(`/api/invoices/${invoiceId}/post`, { method: 'POST' })
        if (!postRes.ok) {
          const err = await postRes.json()
          throw new Error(err.error || 'Failed to post invoice')
        }
      }

      closeForm()
      await fetchInvoices()
      const invoiceNumber = editingInvoice?.invoiceNumber || ''
      if (action === 'post') {
        toast.success(invoiceNumber ? `Invoice ${invoiceNumber} saved & posted` : 'Invoice saved & posted')
      } else {
        toast.success(invoiceNumber ? `Invoice ${invoiceNumber} saved as draft` : 'Invoice saved as draft')
      }
    } catch (err: any) {
      setFormError(err?.message || 'An error occurred')
      toast.error(err?.message || 'Failed to save invoice')
    } finally {
      setSubmitting(false)
    }
  }

  // ── View invoice detail ──
  const openViewDetail = async (inv: Invoice) => {
    setViewInvoice(inv)
    setViewLoading(true)
    try {
      const res = await fetch(`/api/invoices/${inv.id}`)
      if (res.ok) {
        const json = await res.json()
        if (!json.success) throw new Error(json.error || 'Request failed')
        const data = json.data
        setViewLines(data.lines || [])
      } else {
        setViewLines([])
      }
    } catch (err) {
      console.error('Failed to fetch invoice detail:', err)
      setViewLines([])
    } finally {
      setViewLoading(false)
    }
  }

  // ── Preview posting ──
  const openPreview = async (inv: Invoice) => {
    setPreviewInvoice(inv)
    setPreviewData(null)
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/invoices/${inv.id}/preview`, { method: 'POST' })
      if (res.ok) { const json = await res.json(); if (json.success) setPreviewData(json.data) }
    } catch (err) {
      console.error('Failed to preview posting:', err)
    } finally {
      setPreviewLoading(false)
    }
  }

  // ── Approve invoice ──
  const handleApprove = async () => {
    if (!approveTarget) return
    setApproving(true)
    try {
      const res = await fetch(`/api/invoices/${approveTarget.id}/approve`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to approve invoice')
      }
      setApproveTarget(null)
      await fetchInvoices()
      toast.success(`Invoice ${approveTarget.invoiceNumber} approved`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve invoice')
    } finally {
      setApproving(false)
    }
  }

  // ── Post invoice ──
  const handlePost = async () => {
    if (!postTarget) return
    setPosting(true)
    try {
      const res = await fetch(`/api/invoices/${postTarget.id}/post`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to post invoice')
      }
      setPostTarget(null)
      await fetchInvoices()
      toast.success(`Invoice ${postTarget.invoiceNumber} posted`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to post invoice')
    } finally {
      setPosting(false)
    }
  }

  // ── Match to PO ──
  const openMatchPOModal = async (inv: Invoice) => {
    setMatchInvoiceTarget(inv)
    setMatchPOOpen(true)
    setSelectedPOId(null)
    setMatchPOSearch('')
    setMatchPOError('')
    setMatchPOLoading(true)
    setMatchPOList([])
    try {
      const res = await fetch('/api/purchase-orders')
      if (res.ok) {
        const json = await res.json()
        const all = json.data
        setMatchPOList(all.filter((po: any) => po.status !== 'cancelled' && po.status !== 'draft'))
      }
    } catch (err) {
      console.error('Failed to fetch POs:', err)
    } finally {
      setMatchPOLoading(false)
    }
  }

  const handleMatchToPO = async () => {
    if (!matchInvoiceTarget || !selectedPOId) return
    setMatchPOSubmitting(true)
    setMatchPOError('')
    try {
      const res = await fetch(`/api/purchase-orders/${selectedPOId}/match-invoice/${matchInvoiceTarget.id}`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to match invoice')
      }
      setMatchPOOpen(false)
      setMatchInvoiceTarget(null)
      setSelectedPOId(null)
      await fetchInvoices()
      toast.success(`Invoice ${matchInvoiceTarget.invoiceNumber} matched to purchase order`)
    } catch (err: any) {
      setMatchPOError(err?.message || 'An error occurred')
      toast.error(err?.message || 'Failed to match invoice')
    } finally {
      setMatchPOSubmitting(false)
    }
  }

  // ── Unlink PO ──
  const handleUnlinkPO = async () => {
    if (!unlinkPOTarget || !unlinkPOTarget.purchaseOrderId) return
    setUnlinkPOSubmitting(true)
    try {
      const res = await fetch(`/api/purchase-orders/${unlinkPOTarget.purchaseOrderId}/match-invoice/${unlinkPOTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to unlink invoice')
      }
      setUnlinkPOTarget(null)
      await fetchInvoices()
      toast.success(`Invoice ${unlinkPOTarget.invoiceNumber} unlinked from purchase order`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to unlink invoice')
    } finally {
      setUnlinkPOSubmitting(false)
    }
  }

  // ── Cancel invoice ──
  const handleCancel = async () => {
    if (!cancelTarget) return
    try {
      const res = await fetch(`/api/invoices/${cancelTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to cancel invoice')
      }
      setCancelTarget(null)
      await fetchInvoices()
      toast.success(`Invoice ${cancelTarget.invoiceNumber} cancelled`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to cancel invoice')
    }
  }

  // ── Partner options ──
  const partnerOptions = useMemo(() => partners
    .filter(p => p.type === 'customer' || p.type === 'both')
    .map(p => ({ id: p.id, label: `${p.code} — ${p.name} (${p.type})` })),
  [partners])

  const productOptions = useMemo(() => products
    .filter(p => p.isActive !== false)
    .map(p => ({ id: p.id, label: `${p.code} — ${p.name} (${p.unitOfMeasure})` })),
  [products])

  const outputTaxCodes = useMemo(() => taxCodes
    .filter(t => t.type === 'output' && !t.isGroup)
    .map(t => ({ id: t.id, label: `${t.code} — ${t.name} (${t.rate}%)`, rate: t.rate })),
  [taxCodes])

  const profileOptions = useMemo(() => postingProfiles
    .map(p => ({ id: p.id, label: p.name })),
  [postingProfiles])

  const warehouseOptions = useMemo(() => warehouses
    .map(w => ({ id: w.id, label: `${w.code} — ${w.name}` })),
  [warehouses])

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Sales Invoices</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Create and manage customer sales invoices.</p>
        </div>
        <button onClick={openAddForm}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> New Invoice
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Sales', value: formatCurrency(totalSales), total: formatCurrency(allSales), color: 'text-brand-500' },
          { label: 'Paid', value: formatCurrency(totalPaid), total: formatCurrency(allPaidTotal), color: 'text-green-500' },
          { label: 'Pending', value: formatCurrency(totalPending), total: formatCurrency(allPendingTotal), color: 'text-amber-500' },
          { label: 'Cancelled', value: formatCurrency(totalCancelled), total: formatCurrency(allCancelledTotal), color: 'text-red-500' },
        ].map(s => (
          <StatCard key={s.label} label={s.label} value={s.value} color={s.color} subtext={isFilterActive && s.total ? `of ${s.total}` : undefined} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {statusFilters.map(f => (
          <button key={f} onClick={() => setFilterAndResetPage(setStatusFilter, f)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              statusFilter === f
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}>{f === 'all' ? 'All' : statusLabels[f] || f}</button>
        ))}
        <ClearFiltersButton
          filters={{ status: statusFilter !== 'all', search: searchQuery !== '' }}
          onClear={() => {
            setFilterAndResetPage(setStatusFilter, 'all')
            setFilterAndResetPage(setSearchQuery, '')
          }}
        />
        <SearchInput value={searchQuery} onChange={v => setFilterAndResetPage(setSearchQuery, v)} placeholder="Search invoices..." className="ml-auto max-w-xs" />
      </div>

      {/* Invoice table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading invoices...</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Invoice #</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Partner</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">VAT</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7}><EmptyState compact title="No invoices found." /></td>
                  </tr>
                ) : (
                  filtered.map(inv => (
                    <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-3 px-4 text-sm font-mono font-medium text-brand-600 dark:text-brand-400">{inv.invoiceNumber}</td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">{inv.invoiceDate}</td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">{inv.partnerName}</td>
                      <td className="py-3 px-4 text-sm text-right font-medium text-gray-900 dark:text-white">{formatCurrency(inv.totalAmount)}</td>
                      <td className="py-3 px-4 text-sm text-right text-gray-500 dark:text-gray-400">{formatCurrency(inv.vatAmount)}</td>
                      <td className="py-3 px-4 text-center">
                        <StatusBadge label={statusLabels[inv.status] || inv.status} color={statusStyles[inv.status]} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openViewDetail(inv)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                            title="View detail"><Eye className="w-3.5 h-3.5" /></button>
                          {inv.status !== 'cancelled' && (
                            (inv as any).purchaseOrderId ? (
                              <button onClick={() => setUnlinkPOTarget(inv)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                title="Unlink PO"><X className="w-3.5 h-3.5" /></button>
                            ) : (
                              <button onClick={() => openMatchPOModal(inv)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                                title="Match to PO"><Link2 className="w-3.5 h-3.5" /></button>
                            )
                          )}
                          {inv.status === 'draft' && (
                            <>
                              <button onClick={() => openEditForm(inv)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                                title="Edit"><Edit3 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => openPreview(inv)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors"
                                title="Preview posting"><BookOpen className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setApproveTarget(inv)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                                title="Approve"><BadgeCheck className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setPostTarget(inv)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                                title="Post"><CheckCircle className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setCancelTarget(inv)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                title="Cancel"><X className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                          {(inv.status === 'posted' || inv.status === 'partial_paid') && (
                            <button onClick={() => setPaymentTarget(inv)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                              title="Record payment"><DollarSign className="w-3.5 h-3.5" /></button>
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
        <Pagination page={page} pageSize={pageSize} total={total} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          CREATE / EDIT INVOICE MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={showForm} onClose={closeForm} className="max-w-4xl p-0" showCloseButton={false}>
        <ModalHeader title={editingInvoice ? `Edit Invoice ${editingInvoice.invoiceNumber}` : 'New Sales Invoice'} onClose={closeForm} />

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* ── Header Fields ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Partner *</label>
              <SearchSelect
                options={partnerOptions}
                value={formData.businessPartnerId}
                onChange={handlePartnerSelect}
                placeholder="Select customer..."
                searchPlaceholder="Search customers..."
                notFoundLabel="No customers found"
              />
              {formData.businessPartnerId && formData.partnerTaxReg && (
                <p className="mt-1 text-[11px] text-gray-400">Tax Reg: {formData.partnerTaxReg}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Partner Name</label>
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
                placeholder="Select posting profile..."
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

          {/* ── Line Items ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Line Items</h4>
              <button type="button" onClick={addLine}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 text-xs font-medium hover:bg-brand-100 dark:hover:bg-brand-950/50 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>

            {formData.lines.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
                <Package className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-400 dark:text-gray-500">No line items yet. Click "Add Item" to add products or services.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {formData.lines.map((line, idx) => {
                  const lineTotal = line.quantity * line.unitPrice * (1 - line.discountPercent / 100)
                  const vatAmt = lineTotal * (line.vatRate / 100)

                  return (
                    <div key={line.id}
                      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <span className="text-xs font-medium text-gray-400 dark:text-gray-500 shrink-0">#{idx + 1}</span>
                        <button onClick={() => removeLine(line.id)}
                          className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2">
                        {/* Product */}
                        <div className="lg:col-span-3">
                          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Product</label>
                          <SearchSelect
                            options={productOptions}
                            value={line.productId}
                            onChange={(val) => handleProductSelect(line.id, val ? Number(val) : null)}
                            placeholder="Select product..."
                            searchPlaceholder="Search products..."
                            notFoundLabel="No products found"
                          />
                        </div>

                        {/* Description */}
                        <div className="lg:col-span-2">
                          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
                          <input type="text" value={line.description}
                            onChange={e => updateLine(line.id, { description: e.target.value })}
                            placeholder="Description"
                            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white placeholder:text-gray-400" />
                        </div>

                        {/* Qty */}
                        <div className="lg:col-span-1">
                          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Qty</label>
                          <input type="number" value={line.quantity || ''} min={1}
                            onChange={e => updateLine(line.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white text-center"
                          />
                        </div>

                        {/* Unit Price */}
                        <div className="lg:col-span-2">
                          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Unit Price ($)</label>
                          <input type="number" value={line.unitPrice || ''} min={0} step="0.01"
                            onChange={e => updateLine(line.id, { unitPrice: Number(e.target.value) || 0 })}
                            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white text-right"
                          />
                        </div>

                        {/* Discount */}
                        <div className="lg:col-span-1">
                          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Disc %</label>
                          <input type="number" value={line.discountPercent || ''} min={0} max={100} step="0.01"
                            onChange={e => updateLine(line.id, { discountPercent: Number(e.target.value) || 0 })}
                            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white text-center"
                          />
                        </div>

                        {/* VAT Code */}
                        <div className="lg:col-span-2">
                          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">VAT Code</label>
                          <SearchSelect
                            options={outputTaxCodes}
                            value={line.vatCodeId}
                            onChange={(val, item) => {
                              const id = val ? Number(val) : null
                              updateLine(line.id, {
                                vatCodeId: id,
                                vatRate: (item as any)?.rate || 0,
                              })
                            }}
                            placeholder="VAT..."
                            noneLabel="No VAT"
                            searchPlaceholder="Search VAT codes..."
                            notFoundLabel="No VAT codes"
                          />
                        </div>

                        {/* Line Total display */}
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

          {/* ── Totals ── */}
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

          {/* Error */}
          {formError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-2.5">
              <p className="text-sm text-red-700 dark:text-red-400">{formError}</p>
            </div>
          )}
        </div>

        {/* Form footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <Button variant="outline" size="sm" onClick={closeForm} disabled={submitting}>Cancel</Button>
          <Button size="sm" onClick={() => handleSave('draft')} disabled={submitting}
            className="flex items-center gap-2">
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {editingInvoice ? 'Update Draft' : 'Save as Draft'}
          </Button>
          <Button size="sm" onClick={() => handleSave('post')} disabled={submitting}
            className="flex items-center gap-2 !bg-green-600 hover:!bg-green-700">
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            Save & Post
          </Button>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          VIEW INVOICE DETAIL MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={!!viewInvoice} onClose={() => setViewInvoice(null)} className="max-w-3xl p-0" showCloseButton={false}>
        <ModalHeader title={`Invoice ${viewInvoice?.invoiceNumber}`} onClose={() => setViewInvoice(null)}>
          {viewInvoice && (
            <StatusBadge label={statusLabels[viewInvoice.status]} color={statusStyles[viewInvoice.status]} size="sm" className="mt-1" />
          )}
        </ModalHeader>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {viewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
              <span className="ml-2 text-sm text-gray-400">Loading...</span>
            </div>
          ) : viewInvoice ? (
            <div className="space-y-6">
              {/* Header info */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Partner</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{viewInvoice.partnerName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Invoice Date</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{viewInvoice.invoiceDate}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Due Date</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{viewInvoice.dueDate}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Reference</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{viewInvoice.referenceNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Subtotal</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{formatCurrency(viewInvoice.subtotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                  <p className="text-sm font-semibold text-brand-600 dark:text-brand-400 mt-0.5">{formatCurrency(viewInvoice.totalAmount)}</p>
                </div>
              </div>

              {/* Lines */}
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
                    {viewLines.length === 0 ? (
                      <tr><td colSpan={8} className="py-8 text-center text-sm text-gray-400">No line items</td></tr>
                    ) : (
                      viewLines.map(line => (
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

              {viewInvoice.notes && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Notes:</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{viewInvoice.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-gray-400 py-8">Invoice not found.</p>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <Button variant="outline" size="sm" onClick={() => setViewInvoice(null)}>Close</Button>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          POSTING PREVIEW MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={!!previewInvoice} onClose={() => setPreviewInvoice(null)} className="max-w-3xl p-0" showCloseButton={false}>        <ModalHeader title="Posting Preview" subtitle={previewInvoice ? `${previewInvoice.invoiceNumber} — ${previewInvoice.partnerName}` : undefined} onClose={() => setPreviewInvoice(null)} />

        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
          {previewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
              <span className="ml-2 text-sm text-gray-400">Generating preview...</span>
            </div>
          ) : previewData ? (
            <>
              {/* Accounting entries */}
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

              {/* Stock movements */}
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
                                sm.quantity < 0
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
          <Button variant="outline" size="sm" onClick={() => setPreviewInvoice(null)}>Close</Button>
          {previewInvoice && previewInvoice.status === 'draft' && (
            <Button size="sm" onClick={() => { setPostTarget(previewInvoice); setPreviewInvoice(null) }}
              className="flex items-center gap-2 !bg-green-600 hover:!bg-green-700">
              <CheckCircle className="w-3.5 h-3.5" /> Post Invoice
            </Button>
          )}
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          APPROVE CONFIRMATION MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={!!approveTarget} onClose={() => setApproveTarget(null)} className="max-w-sm p-6">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center mb-4">
            <BadgeCheck className="w-6 h-6 text-indigo-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Approve Invoice</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Are you sure you want to approve <span className="font-medium text-gray-700 dark:text-gray-300">{approveTarget?.invoiceNumber}</span>?
            Approved invoices can still be edited before posting.
          </p>
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button variant="outline" size="sm" onClick={() => setApproveTarget(null)} disabled={approving}>Cancel</Button>
            <Button size="sm" onClick={handleApprove} disabled={approving}
              className="flex items-center gap-2 !bg-indigo-600 hover:!bg-indigo-700">
              {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />}
              Approve
            </Button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          POST CONFIRMATION MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={!!postTarget} onClose={() => setPostTarget(null)} className="max-w-sm p-6">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-green-50 dark:bg-green-950/50 flex items-center justify-center mb-4">
            <CheckCircle className="w-6 h-6 text-green-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Post Invoice</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            This will create journal entries, update stock, and post invoice <strong>{postTarget?.invoiceNumber}</strong>.
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> This action cannot be undone.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" size="sm" onClick={() => setPostTarget(null)} disabled={posting}>Cancel</Button>
          <Button size="sm" onClick={handlePost} disabled={posting}
            className="flex items-center gap-2 !bg-green-600 hover:!bg-green-700">
            {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            {posting ? 'Posting...' : 'Confirm Post'}
          </Button>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          UNLINK PO CONFIRMATION MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={!!unlinkPOTarget} onClose={() => setUnlinkPOTarget(null)} className="max-w-sm p-6">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/50 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Unlink Purchase Order</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Unlink <strong>{unlinkPOTarget?.invoiceNumber}</strong> from its linked purchase order? This will reset the invoiced quantities on the PO lines.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" size="sm" onClick={() => setUnlinkPOTarget(null)} disabled={unlinkPOSubmitting}>Cancel</Button>
          <Button size="sm" onClick={handleUnlinkPO} disabled={unlinkPOSubmitting}
            className="flex items-center gap-2 !bg-red-600 hover:!bg-red-700">
            {unlinkPOSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
            Unlink PO
          </Button>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          MATCH TO PURCHASE ORDER MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={matchPOOpen} onClose={() => { setMatchPOOpen(false); setMatchInvoiceTarget(null); setSelectedPOId(null); setMatchPOError('') }} className="max-w-lg p-0" showCloseButton={false}>        <ModalHeader title="Match to Purchase Order" subtitle={matchInvoiceTarget ? `${matchInvoiceTarget.invoiceNumber} — ${matchInvoiceTarget.partnerName}` : undefined} onClose={() => { setMatchPOOpen(false); setMatchInvoiceTarget(null); setSelectedPOId(null); setMatchPOError('') }} />
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <SearchInput value={matchPOSearch} onChange={setMatchPOSearch} placeholder="Search by PO number or vendor..." />

          {matchPOLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading POs...
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(() => {
                const filtered = matchPOSearch.trim()
                  ? matchPOList.filter(po =>
                      po.poNumber.toLowerCase().includes(matchPOSearch.toLowerCase()) ||
                      po.partnerName.toLowerCase().includes(matchPOSearch.toLowerCase())
                    )
                  : matchPOList
                return filtered.length === 0 ? (
                  <p className="text-center py-8 text-sm text-gray-400">No matching purchase orders found.</p>
                ) : (
                  filtered.map(po => (
                    <button key={po.id} onClick={() => setSelectedPOId(po.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        selectedPOId === po.id
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 dark:border-brand-400'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white font-mono">{po.poNumber}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{po.partnerName}</p>
                        </div>
                        <span className={`inline-flex text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                          po.status === 'draft' ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400' :
                          po.status === 'approved' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400' :
                          po.status === 'fully_received' ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400' :
                          'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}>{po.status.replace(/_/g, ' ')}</span>
                      </div>
                    </button>
                  ))
                )
              })()}
            </div>
          )}

          {matchPOError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-2.5">
              <p className="text-sm text-red-700 dark:text-red-400">{matchPOError}</p>
            </div>
          )}
        </div>
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <Button variant="outline" size="sm" onClick={() => { setMatchPOOpen(false); setMatchInvoiceTarget(null); setSelectedPOId(null); setMatchPOError('') }}>Cancel</Button>
          <Button size="sm" onClick={handleMatchToPO} disabled={!selectedPOId || matchPOSubmitting}
            className="flex items-center gap-2 !bg-brand-600 hover:!bg-brand-700">
            {matchPOSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            Match Invoice
          </Button>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          RECORD PAYMENT MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      {paymentTarget && (
        <RecordPaymentModal
          isOpen={!!paymentTarget}
          onClose={() => setPaymentTarget(null)}
          invoice={paymentTarget}
          invoiceType="sales"
          onSuccess={() => { setPaymentTarget(null); fetchInvoices() }}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          CANCEL CONFIRMATION MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} className="max-w-sm p-6">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/50 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Cancel Invoice</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Cancel invoice <strong>{cancelTarget?.invoiceNumber}</strong>? It will be marked as cancelled and cannot be posted.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" size="sm" onClick={() => setCancelTarget(null)}>Keep</Button>
          <Button size="sm" onClick={handleCancel}
            className="flex items-center gap-2 !bg-red-600 hover:!bg-red-700">
            <X className="w-3.5 h-3.5" /> Cancel Invoice
          </Button>
        </div>
      </Modal>
    </div>
  )
}
