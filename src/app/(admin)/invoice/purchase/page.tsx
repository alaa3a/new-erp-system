'use client'
import { formatCurrency } from '@/lib/formatters'
import { ClearFiltersButton, StatusBadge, EmptyState, SearchInput, StatCard } from '@/components/ui'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { usePagination } from '@/hooks/usePagination'
import {
  Plus, Eye, Edit3, Loader2, DollarSign,
  X, CheckCircle, BadgeCheck, BookOpen, Link2,
} from 'lucide-react'
import RecordPaymentModal from '@/components/invoices/RecordPaymentModal'
import { Pagination } from '@/components/Pagination'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type { Invoice, InvoiceLine } from '@/types/erp'
import InvoiceFormModal from '@/components/invoices/InvoiceFormModal'
import ViewInvoiceModal from '@/components/invoices/ViewInvoiceModal'
import PostingPreviewModal from '@/components/invoices/PostingPreviewModal'
import InvoiceConfirmationModals from '@/components/invoices/InvoiceConfirmationModals'
import MatchPOModal from '@/components/invoices/MatchPOModal'

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
  purchasePrice: number
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

export default function PurchasePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /><span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading purchase invoices...</span></div>}>
      <PurchasePageContent />
    </Suspense>
  )
}

function PurchasePageContent() {
  const toast = useToast()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'linked' | 'unlinked'>('all')
  const { page, pageSize, setFilterAndResetPage } = usePagination()

  const [partners, setPartners] = useState<BusinessPartner[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([])
  const [postingProfiles, setPostingProfiles] = useState<PostingProfile[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  const [showForm, setShowForm] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [formData, setFormData] = useState<InvoiceFormData>(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null)
  const [viewLines, setViewLines] = useState<InvoiceLine[]>([])
  const [viewLoading, setViewLoading] = useState(false)
  const [viewPONumber, setViewPONumber] = useState<string | null>(null)

  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const [postTarget, setPostTarget] = useState<Invoice | null>(null)
  const [posting, setPosting] = useState(false)

  const [approveTarget, setApproveTarget] = useState<Invoice | null>(null)
  const [approving, setApproving] = useState(false)

  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null)

  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null)

  const [unlinkPOTarget, setUnlinkPOTarget] = useState<Invoice | null>(null)
  const [unlinkPOSubmitting, setUnlinkPOSubmitting] = useState(false)

  const [matchPOOpen, setMatchPOOpen] = useState(false)
  const [matchInvoiceTarget, setMatchInvoiceTarget] = useState<Invoice | null>(null)
  const [matchPOList, setMatchPOList] = useState<{ id: number; poNumber: string; partnerName: string; status: string }[]>([])
  const [matchPOLoading, setMatchPOLoading] = useState(false)
  const [matchPOSearch, setMatchPOSearch] = useState('')
  const [selectedPOId, setSelectedPOId] = useState<number | null>(null)
  const [matchPOSubmitting, setMatchPOSubmitting] = useState(false)
  const [matchPOError, setMatchPOError] = useState('')

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('type', 'purchase')
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (searchQuery) params.set('search', searchQuery)
      const res = await fetch(`/api/invoices?${params}`)
      if (res.ok) { const json = await res.json(); if (json.success) { setInvoices(json.data); setTotal(json.total) } }
    } catch (err) {
      console.error('Failed to fetch purchase invoices:', err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter, searchQuery])

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
        setPostingProfiles(all.filter((p: PostingProfile) => p.invoiceType === 'purchase'))
      }
      if (whRes.ok) setWarehouses(await whRes.json())
    } catch (err) {
      console.error('Failed to fetch reference data:', err)
    }
  }, [])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])
  useEffect(() => { fetchRefData() }, [fetchRefData])

  const filtered = useMemo(() => invoices.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return inv.invoiceNumber.toLowerCase().includes(q) || inv.partnerName.toLowerCase().includes(q)
    }
    if (invoiceFilter === 'linked' && !(inv as { purchaseOrderId?: number }).purchaseOrderId) return false
    if (invoiceFilter === 'unlinked' && (inv as { purchaseOrderId?: number }).purchaseOrderId) return false
    return true
  }), [invoices, statusFilter, searchQuery, invoiceFilter])

  const totalPurchases = useMemo(() => filtered.reduce((s, i) => s + i.totalAmount, 0), [filtered])
  const totalPaid = useMemo(() => filtered.reduce((s, i) => s + i.paidAmount, 0), [filtered])
  const totalPending = useMemo(() =>
    filtered.filter(i => i.status === 'posted' || i.status === 'partial_paid')
      .reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0), [filtered])
  const totalCancelled = useMemo(() =>
    filtered.filter(i => i.status === 'cancelled').reduce((s, i) => s + i.totalAmount, 0), [filtered])

  const allPurchases = useMemo(() => invoices.reduce((s, i) => s + i.totalAmount, 0), [invoices])
  const allPaidTotal = useMemo(() => invoices.reduce((s, i) => s + i.paidAmount, 0), [invoices])
  const allPendingTotal = useMemo(() =>
    invoices.filter(i => i.status === 'posted' || i.status === 'partial_paid')
      .reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0), [invoices])
  const allCancelledTotal = useMemo(() =>
    invoices.filter(i => i.status === 'cancelled').reduce((s, i) => s + i.totalAmount, 0), [invoices])
  const isFilterActive = statusFilter !== 'all' || searchQuery !== '' || invoiceFilter !== 'all'

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
      const defaultVat = product.purchaseVatCodeId
        ? taxCodes.find(t => t.id === product.purchaseVatCodeId)
        : null

      updateLine(lineId, {
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        description: product.name,
        unitPrice: Math.round(product.purchasePrice / 100),
        lineType: product.itemType,
        warehouseId: product.defaultWarehouseId || formData.warehouseId,
        vatCodeId: defaultVat?.id || null,
        vatRate: defaultVat?.rate || 0,
        salesAccountId: product.salesAccountId || null,
        inventoryAccountId: product.inventoryAccountId || null,
        cogsAccountId: product.cogsAccountId || null,
        costCenterId: product.defaultCostCenterId || null,
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
      setFormError('Vendor is required')
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
        type: 'purchase',
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
        toast.success(invoiceNumber ? `Invoice ${invoiceNumber} saved & posted` : 'Purchase invoice saved & posted')
      } else {
        toast.success(invoiceNumber ? `Invoice ${invoiceNumber} saved as draft` : 'Purchase invoice saved as draft')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setFormError(message)
      toast.error(message || 'Failed to save invoice')
    } finally {
      setSubmitting(false)
    }
  }

  const openViewDetail = async (inv: Invoice) => {
    setViewInvoice(inv)
    setViewLoading(true)
    setViewPONumber(null)
    try {
      const res = await fetch(`/api/invoices/${inv.id}`)
      if (res.ok) {
        const json = await res.json()
        if (!json.success) throw new Error(json.error || 'Request failed')
        const data = json.data
        setViewLines(data.lines || [])
        if (data.purchaseOrderId) {
          const poRes = await fetch(`/api/purchase-orders/${data.purchaseOrderId}`)
          if (poRes.ok) {
            const po = await poRes.json()
            setViewPONumber(po.poNumber || null)
          }
        }
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve invoice'
      toast.error(message)
    } finally {
      setApproving(false)
    }
  }

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to post invoice'
      toast.error(message)
    } finally {
      setPosting(false)
    }
  }

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to cancel invoice'
      toast.error(message)
    }
  }

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
        setMatchPOList(all.filter((po: { status: string }) => po.status !== 'cancelled' && po.status !== 'draft'))
      }
    } catch (err) {
      console.error('Failed to fetch POs:', err)
    } finally {
      setMatchPOLoading(false)
    }
  }

  const handleUnlinkPO = async () => {
    if (!unlinkPOTarget || !viewInvoice?.purchaseOrderId) return
    setUnlinkPOSubmitting(true)
    try {
      const res = await fetch(`/api/purchase-orders/${viewInvoice.purchaseOrderId}/match-invoice/${unlinkPOTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to unlink invoice')
      }
      setUnlinkPOTarget(null)
      setViewInvoice(null)
      await fetchInvoices()
      toast.success(`Invoice ${unlinkPOTarget.invoiceNumber} unlinked from purchase order`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to unlink invoice'
      toast.error(message)
    } finally {
      setUnlinkPOSubmitting(false)
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setMatchPOError(message)
      toast.error(message || 'Failed to match invoice')
    } finally {
      setMatchPOSubmitting(false)
    }
  }

  const vendorOptions = useMemo(() => partners
    .filter(p => p.type === 'vendor' || p.type === 'both')
    .map(p => ({ id: p.id, label: `${p.code} — ${p.name} (${p.type})` })),
  [partners])

  const productOptions = useMemo(() => products
    .filter(p => p.isActive !== false)
    .map(p => ({ id: p.id, label: `${p.code} — ${p.name} (${p.unitOfMeasure})` })),
  [products])

  const inputTaxCodes = useMemo(() => taxCodes
    .filter(t => t.type === 'input' && !t.isGroup)
    .map(t => ({ id: t.id, label: `${t.code} — ${t.name} (${t.rate}%)`, rate: t.rate })),
  [taxCodes])

  const profileOptions = useMemo(() => postingProfiles
    .map(p => ({ id: p.id, label: p.name })),
  [postingProfiles])

  const warehouseOptions = useMemo(() => warehouses
    .map(w => ({ id: w.id, label: `${w.code} — ${w.name}` })),
  [warehouses])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Purchase Invoices</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage vendor purchases and accounts payable.</p>
        </div>
        <button onClick={openAddForm}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> New Purchase
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Purchases', value: formatCurrency(totalPurchases), total: formatCurrency(allPurchases), color: 'text-brand-500' },
          { label: 'Paid', value: formatCurrency(totalPaid), total: formatCurrency(allPaidTotal), color: 'text-green-500' },
          { label: 'Pending', value: formatCurrency(totalPending), total: formatCurrency(allPendingTotal), color: 'text-amber-500' },
          { label: 'Cancelled', value: formatCurrency(totalCancelled), total: formatCurrency(allCancelledTotal), color: 'text-red-500' },
        ].map(s => (
          <StatCard key={s.label} label={s.label} value={s.value} color={s.color} subtext={isFilterActive && s.total ? `of ${s.total}` : undefined} />
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {statusFilters.map(f => (
          <button key={f} onClick={() => setFilterAndResetPage(setStatusFilter, f)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              statusFilter === f
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}>{f === 'all' ? 'All' : statusLabels[f] || f}</button>
        ))}
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />
        {(['all', 'linked', 'unlinked'] as const).map(f => (
          <button key={f} onClick={() => setFilterAndResetPage(setInvoiceFilter, f)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              invoiceFilter === f
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}>{f === 'all' ? 'All Invoices' : f === 'linked' ? 'Has PO' : 'No PO'}</button>
        ))}
        <ClearFiltersButton
          filters={{
            status: statusFilter !== 'all',
            search: searchQuery !== '',
            invoice: invoiceFilter !== 'all',
          }}
          onClear={() => {
            setFilterAndResetPage(setStatusFilter, 'all')
            setFilterAndResetPage(setSearchQuery, '')
            setFilterAndResetPage(setInvoiceFilter, 'all')
          }}
        />
        <SearchInput value={searchQuery} onChange={v => setFilterAndResetPage(setSearchQuery, v)} placeholder="Search purchases..." className="ml-auto max-w-xs" />
      </div>

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
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Vendor</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">VAT</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">PO</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8}><EmptyState compact title="No invoices found." /></td>
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
                        {(inv as { purchaseOrderId?: number }).purchaseOrderId ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400">
                            <Link2 className="w-3 h-3" /> PO Linked
                          </span>
                        ) : (
                          <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-50 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                            —
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <StatusBadge label={statusLabels[inv.status] || inv.status} color={statusStyles[inv.status]} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openViewDetail(inv)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                            title="View detail"><Eye className="w-3.5 h-3.5" /></button>
                          {inv.status !== 'cancelled' && (
                            (inv as { purchaseOrderId?: number }).purchaseOrderId ? (
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

      <InvoiceFormModal
        isOpen={showForm}
        onClose={closeForm}
        formData={formData}
        setFormData={setFormData}
        editingInvoice={editingInvoice}
        submitting={submitting}
        formError={formError}
        partnerOptions={vendorOptions}
        productOptions={productOptions}
        taxCodeOptions={inputTaxCodes}
        profileOptions={profileOptions}
        warehouseOptions={warehouseOptions}
        lineTotals={lineTotals}
        onPartnerSelect={handlePartnerSelect}
        onProductSelect={handleProductSelect}
        onAddLine={addLine}
        onRemoveLine={removeLine}
        onUpdateLine={updateLine}
        onSave={handleSave}
        partnerLabel="Vendor"
        partnerPlaceholder="Select vendor..."
        partnerSearchPlaceholder="Search vendors..."
        partnerNotFoundLabel="No vendors found"
        profilePlaceholder="Select purchase profile..."
        title="New Purchase Invoice"
        vatLabel="Input VAT"
        vatSearchPlaceholder="Search input VAT..."
        vatNotFoundLabel="No input VAT codes"
      />

      <ViewInvoiceModal
        isOpen={!!viewInvoice}
        onClose={() => setViewInvoice(null)}
        invoice={viewInvoice}
        lines={viewLines}
        loading={viewLoading}
        statusLabels={statusLabels}
        statusStyles={statusStyles}
        showMatchPO={true}
        onMatchPO={viewInvoice && viewInvoice.status !== 'cancelled' && !viewPONumber ? () => openMatchPOModal(viewInvoice) : undefined}
        onUnlinkPO={viewInvoice && viewInvoice.status !== 'cancelled' && viewPONumber ? () => setUnlinkPOTarget(viewInvoice) : undefined}
      />

      <PostingPreviewModal
        isOpen={!!previewInvoice}
        onClose={() => setPreviewInvoice(null)}
        invoice={previewInvoice}
        previewData={previewData}
        loading={previewLoading}
        onPost={previewInvoice && previewInvoice.status === 'draft' ? () => { setPostTarget(previewInvoice); setPreviewInvoice(null) } : undefined}
        stockDirection="receipt"
      />

      <InvoiceConfirmationModals
        approveTarget={approveTarget}
        approveLoading={approving}
        onApprove={handleApprove}
        onCancelApprove={() => setApproveTarget(null)}
        postTarget={postTarget}
        postLoading={posting}
        onPost={handlePost}
        onCancelPost={() => setPostTarget(null)}
        cancelTarget={cancelTarget}
        onCancel={handleCancel}
        onCancelCancelTarget={() => setCancelTarget(null)}
        unlinkPOTarget={unlinkPOTarget}
        unlinkPOLoading={unlinkPOSubmitting}
        onUnlinkPO={handleUnlinkPO}
        onCancelUnlinkPO={() => setUnlinkPOTarget(null)}
        cancelTitlePrefix="Cancel Purchase Invoice"
      />

      <MatchPOModal
        isOpen={matchPOOpen}
        onClose={() => { setMatchPOOpen(false); setMatchInvoiceTarget(null); setSelectedPOId(null); setMatchPOError('') }}
        invoiceNumber={matchInvoiceTarget?.invoiceNumber}
        partnerName={matchInvoiceTarget?.partnerName}
        poList={matchPOList}
        loading={matchPOLoading}
        search={matchPOSearch}
        onSearchChange={setMatchPOSearch}
        selectedPOId={selectedPOId}
        onSelectPO={setSelectedPOId}
        error={matchPOError}
        submitting={matchPOSubmitting}
        onMatch={handleMatchToPO}
      />

      {paymentTarget && (
        <RecordPaymentModal
          isOpen={!!paymentTarget}
          onClose={() => setPaymentTarget(null)}
          invoice={paymentTarget}
          invoiceType="purchase"
          onSuccess={() => { setPaymentTarget(null); fetchInvoices() }}
        />
      )}
    </div>
  )
}
