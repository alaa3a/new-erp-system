'use client'
import { formatCurrency } from '@/lib/formatters'
import { ClearFiltersButton, StatusBadge, ModalHeader, EmptyState, SearchInput, StatCard } from '@/components/ui'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { usePagination } from '@/hooks/usePagination'
import {
   Plus, Eye, Edit3, Loader2, Trash2,
  X, BadgeCheck, Package, Archive, Link2, AlertTriangle,
} from 'lucide-react'
import SearchSelect from '@/components/form/SearchSelect'
import DatePicker from '@/components/form/input/DatePicker'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { Pagination } from '@/components/Pagination'
import { useToast } from '@/components/ui/toast/ToastProvider'

// ─── Types ──────────────────────────────────────────────────────────────

interface PurchaseOrder {
  id: number; poNumber: string; status: string; businessPartnerId: number | null;
  partnerName: string; orderDate: string; expectedDate: string;
  warehouseId: number | null; referenceNumber: string; notes: string;
  subtotal: number; vatAmount: number; totalAmount: number;
  approvedBy: string | null; approvedAt: string | null;
  closedBy: string | null; closedAt: string | null;
  createdBy: string; createdAt: string; updatedAt: string; version: number;
}

interface POLine {
  id: number; poId: number; lineNumber: number; productId: number;
  description: string; quantity: number; unitPrice: number;
  receivedQuantity: number; invoicedQuantity: number;
  discountPercent: number; lineTotal: number; lineType: string;
  warehouseId: number | null; costCenterId: number | null; accountCode: string;
}

interface Partner { id: number; code: string; name: string; type: string }
interface Product { id: number; code: string; name: string; itemType: string; unitOfMeasure: string; purchasePrice: number; isActive: boolean | undefined; defaultWarehouseId: number | null }
interface Warehouse { id: number; code: string; name: string }

interface LineForm {
  id: string; productId: number | null; productCode: string; productName: string;
  description: string; quantity: number; unitPrice: number;
  discountPercent: number;
  warehouseId: number | null; lineType: string;
}

interface MatchingInfo {
  lineId: number; productId: number; description: string;
  orderedQty: number; receivedQty: number; invoicedQty: number;
  unitPrice: number; status: string;
}

interface GoodsReceipt { id: number; receiptNumber: string; poId: number; status: string; receiptDate: string; warehouseId: number; notes: string; createdBy: string; createdAt: string; lines: GoodsReceiptLine[] }
interface GoodsReceiptLine { id: number; receiptId: number; poLineId: number; productId: number; description: string; quantity: number; unitCost: number }

// ─── Constants ──────────────────────────────────────────────────────────

const statusStyles: Record<string, string> = {
  draft: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400',
  approved: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
  partially_received: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400',
  fully_received: 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  closed: 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  cancelled: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400',
}

const statusLabels: Record<string, string> = {
  draft: 'Draft', approved: 'Approved',
  partially_received: 'Partial Rcvd', fully_received: 'Full Rcvd',
  closed: 'Closed', cancelled: 'Cancelled',
}

const statusFilters = ['all', 'draft', 'approved', 'partially_received', 'fully_received', 'closed', 'cancelled'] as const

// ─── Helpers ────────────────────────────────────────────────────────────

const emptyForm = () => ({
  businessPartnerId: null as number | null,
  partnerName: '',
  orderDate: '',
  expectedDate: '',
  warehouseId: null as number | null,
  referenceNumber: '',
  notes: '',
  lines: [] as LineForm[],
})

let _lineKey = 0
const nextLineId = () => `line_${++_lineKey}`
const newLine = (): LineForm => ({
  id: nextLineId(), productId: null, productCode: '', productName: '',
  description: '', quantity: 1, unitPrice: 0, discountPercent: 0,
  warehouseId: null, lineType: 'stock',
})

// ─── Main Component ─────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /><span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading purchase orders...</span></div>}>
      <PurchaseOrdersPageContent />
    </Suspense>
  )
}

function PurchaseOrdersPageContent() {
  const toast = useToast()
  // Data
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'linked' | 'unlinked'>('all')
  const { page, pageSize, setFilterAndResetPage } = usePagination()

  // Reference data
  const [partners, setPartners] = useState<Partner[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  // Form
  const [showForm, setShowForm] = useState(false)
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null)
  const [formData, setFormData] = useState(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // Detail view
  const [viewPO, setViewPO] = useState<PurchaseOrder | null>(null)
  const [viewLines, setViewLines] = useState<POLine[]>([])
  const [viewMatching, setViewMatching] = useState<MatchingInfo[]>([])
  const [viewReceipts, setViewReceipts] = useState<GoodsReceipt[]>([])
  const [viewLoading, setViewLoading] = useState(false)
  const [viewLinkedInvoices, setViewLinkedInvoices] = useState<{ id: number; invoiceNumber: string; partnerName: string; totalAmount: number }[]>([])

  // Invoice link modal
  const [linkInvoiceOpen, setLinkInvoiceOpen] = useState(false)
  const [linkInvoiceTarget, setLinkInvoiceTarget] = useState<PurchaseOrder | null>(null)
  const [linkInvoiceList, setLinkInvoiceList] = useState<{ id: number; invoiceNumber: string; partnerName: string; status: string; totalAmount: number }[]>([])
  const [linkInvoiceLoading, setLinkInvoiceLoading] = useState(false)
  const [linkInvoiceSearch, setLinkInvoiceSearch] = useState('')
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null)
  const [linkInvoiceSubmitting, setLinkInvoiceSubmitting] = useState(false)
  const [linkInvoiceError, setLinkInvoiceError] = useState('')

  // Receive modal
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null)
  const [receiveLines, setReceiveLines] = useState<{ poLineId: number; productId: number; description: string; maxQty: number; quantity: number; unitCost: number }[]>([])
  const [receiveWarehouseId, setReceiveWarehouseId] = useState<number | null>(null)
  const [receiveSubmitting, setReceiveSubmitting] = useState(false)

  // Confirmations
  const [approveTarget, setApproveTarget] = useState<PurchaseOrder | null>(null)
  const [closeTarget, setCloseTarget] = useState<PurchaseOrder | null>(null)
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrder | null>(null)
  const [approving, setApproving] = useState(false)

  // Linked invoice count map
  const [invoiceCountMap, setInvoiceCountMap] = useState<Record<number, number>>({})

  // Fetch
  const fetchPOs = useCallback(async () => {
    setLoading(true)
    try {
      const poParams = new URLSearchParams()
      poParams.set('page', String(page))
      poParams.set('pageSize', String(pageSize))
      if (statusFilter !== 'all') poParams.set('status', statusFilter)
      if (searchQuery) poParams.set('search', searchQuery)
      const [poRes, invRes] = await Promise.all([
        fetch(`/api/purchase-orders?${poParams}`),
        fetch('/api/invoices?type=purchase'),
      ])
      if (poRes.ok) { const json = await poRes.json(); if (json.success) { setPos(json.data); setTotal(json.total) } }
      if (invRes.ok) {
        const json = await invRes.json()
        if (!json.success) { setInvoiceCountMap({}); return }
        const countMap: Record<number, number> = {}
        for (const inv of json.data) {
          if (inv.purchaseOrderId) {
            countMap[inv.purchaseOrderId] = (countMap[inv.purchaseOrderId] || 0) + 1
          }
        }
        setInvoiceCountMap(countMap)
      }
    }
    catch (err) { console.error('Failed to fetch POs:', err) }
    finally { setLoading(false) }
  }, [page, pageSize, statusFilter, searchQuery])

  const fetchRefData = useCallback(async () => {
    try {
      const [pRes, prodRes, whRes] = await Promise.all([
        fetch('/api/partners'), fetch('/api/products'), fetch('/api/warehouses'),
      ])
      if (pRes.ok) { const json = await pRes.json(); if (json.success) setPartners(json.data) }
      if (prodRes.ok) { const json = await prodRes.json(); if (json.success) setProducts(json.data) }
      if (whRes.ok) { const json = await whRes.json(); if (json.success) setWarehouses(json.data) }
    } catch (err) { console.error('Failed to fetch ref data:', err) }
  }, [])

  useEffect(() => { fetchPOs() }, [fetchPOs])
  useEffect(() => { fetchRefData() }, [fetchRefData])

  // Filter
  const filtered = useMemo(() => pos.filter(po => {
    if (statusFilter !== 'all' && po.status !== statusFilter) return false
    if (searchQuery) { const q = searchQuery.toLowerCase(); return po.poNumber.toLowerCase().includes(q) || po.partnerName.toLowerCase().includes(q) }
    if (invoiceFilter === 'linked' && !invoiceCountMap[po.id]) return false
    if (invoiceFilter === 'unlinked' && invoiceCountMap[po.id] > 0) return false
    return true
  }), [pos, statusFilter, searchQuery, invoiceFilter, invoiceCountMap])

  const totalPOs = useMemo(() => filtered.reduce((s, p) => s + p.totalAmount, 0), [filtered])

  // Unfiltered totals for summary when filters are active
  const allTotalPOs = useMemo(() => pos.reduce((s, p) => s + p.totalAmount, 0), [pos])
  const isFilterActive = statusFilter !== 'all' || searchQuery !== '' || invoiceFilter !== 'all'

  // Derived totals
  const lineTotals = useMemo(() => {
    let subtotal = 0
    for (const line of formData.lines) {
      const lt = line.quantity * line.unitPrice * (1 - line.discountPercent / 100)
      subtotal += lt
    }
    return { subtotal, total: subtotal }
  }, [formData.lines])

  // Form helpers
  const openAddForm = () => {
    setEditingPO(null)
    const now = new Date(); const future = new Date(now.getTime() + 14 * 86400000)
    setFormData({ ...emptyForm(), orderDate: now.toISOString().split('T')[0], expectedDate: future.toISOString().split('T')[0] })
    setFormError(''); setShowForm(true)
  }

  const openEditForm = async (po: PurchaseOrder) => {
    setEditingPO(po); setFormError('')
    setFormData({
      businessPartnerId: po.businessPartnerId, partnerName: po.partnerName,
      orderDate: po.orderDate, expectedDate: po.expectedDate,
      warehouseId: po.warehouseId, referenceNumber: po.referenceNumber, notes: po.notes,
      lines: [],
    })
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`)
      if (res.ok) {
        const json = await res.json()
        if (json.success && json.data.lines) setFormData(prev => ({ ...prev, lines: json.data.lines.map((l: POLine) => ({
          id: nextLineId(), productId: l.productId, productCode: '', productName: '',
          description: l.description, quantity: l.quantity,
          unitPrice: Math.round(l.unitPrice / 100), discountPercent: l.discountPercent,
          warehouseId: l.warehouseId, lineType: l.lineType,
        })) }))
      }
    } catch (err) { console.error(err) }
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditingPO(null); setFormError('') }
  const addLine = () => setFormData(prev => ({ ...prev, lines: [...prev.lines, newLine()] }))
  const removeLine = (id: string) => setFormData(prev => ({ ...prev, lines: prev.lines.filter(l => l.id !== id) }))
  const updateLine = (id: string, updates: Partial<LineForm>) => setFormData(prev => ({ ...prev, lines: prev.lines.map(l => l.id === id ? { ...l, ...updates } : l) }))

  const handleProductSelect = (lineId: string, productId: number | null) => {
    if (productId === null) { updateLine(lineId, { productId: null, productCode: '', productName: '', description: '', unitPrice: 0, lineType: 'stock', warehouseId: null }); return }
    const product = products.find(p => p.id === productId)
    if (product) {
      updateLine(lineId, {
        productId: product.id, productCode: product.code, productName: product.name,
        description: product.name, unitPrice: Math.round(product.purchasePrice / 100),
        lineType: product.itemType, warehouseId: product.defaultWarehouseId || formData.warehouseId,
      })
    }
  }

  const handlePartnerSelect = (partnerId: string | number | null) => {
    const id = partnerId ? Number(partnerId) : null
    const partner = id ? partners.find(p => p.id === id) : null
    setFormData(prev => ({ ...prev, businessPartnerId: id, partnerName: partner?.name || '' }))
  }

  const handleSave = async () => {
    setSubmitting(true); setFormError('')
    if (!formData.partnerName.trim()) { setFormError('Vendor is required'); setSubmitting(false); return }
    if (formData.lines.length === 0) { setFormError('At least one line item is required'); setSubmitting(false); return }

    try {
      const body = {
        businessPartnerId: formData.businessPartnerId, partnerName: formData.partnerName.trim(),
        orderDate: formData.orderDate, expectedDate: formData.expectedDate,
        warehouseId: formData.warehouseId, referenceNumber: formData.referenceNumber.trim(),
        notes: formData.notes.trim(),
        lines: formData.lines.map(l => ({
          productId: l.productId, description: l.description || l.productName,
          quantity: l.quantity, unitPrice: Math.round(l.unitPrice * 100),
          discountPercent: l.discountPercent,
          warehouseId: l.warehouseId, lineType: l.lineType,
        })),
      }

      if (editingPO) {
        const res = await fetch(`/api/purchase-orders/${editingPO.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to update') }
      } else {
        const res = await fetch('/api/purchase-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to create') }
      }

      closeForm(); await fetchPOs()
      toast.success(editingPO ? `Purchase order ${editingPO.poNumber} updated` : 'Purchase order created')
    } catch (err: any) { setFormError(err?.message || 'An error occurred'); toast.error(err?.message || 'Failed to save purchase order') }
    finally { setSubmitting(false) }
  }

  // View detail
  const openViewDetail = async (po: PurchaseOrder) => {
    setViewPO(po); setViewLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`)
      if (res.ok) { const json = await res.json(); if (json.success) { setViewLines(json.data.lines || []); setViewMatching(json.data.matching || []); setViewReceipts(json.data.receipts || []) } }
      else { setViewLines([]); setViewMatching([]); setViewReceipts([]) }
      // Fetch linked invoices
      const invRes = await fetch('/api/invoices?type=purchase')
      if (invRes.ok) {
        const json = await invRes.json()
        if (json.success) setViewLinkedInvoices(json.data.filter((inv: any) => inv.purchaseOrderId === po.id))
      } else {
        setViewLinkedInvoices([])
      }
    } catch (err) { console.error(err); setViewLines([]); setViewMatching([]); setViewReceipts([]); setViewLinkedInvoices([]) }
    finally { setViewLoading(false) }
  }

  // Approve
  const handleApprove = async () => {
    if (!approveTarget) return; setApproving(true)
    try {
      const res = await fetch(`/api/purchase-orders/${approveTarget.id}/approve`, { method: 'POST' })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to approve') }
      setApproveTarget(null); await fetchPOs()
      toast.success(`Purchase order ${approveTarget.poNumber} approved`)
    } catch (err: any) { toast.error(err?.message || 'Failed to approve purchase order') }
    finally { setApproving(false) }
  }

  // Unlink Invoice
  const [unlinkInvTarget, setUnlinkInvTarget] = useState<{ invoiceId: number; invoiceNumber: string } | null>(null)
  const [unlinkInvSubmitting, setUnlinkInvSubmitting] = useState(false)

  const handleUnlinkInvoice = async () => {
    if (!unlinkInvTarget || !viewPO) return
    setUnlinkInvSubmitting(true)
    try {
      const res = await fetch(`/api/purchase-orders/${viewPO.id}/match-invoice/${unlinkInvTarget.invoiceId}`, { method: 'DELETE' })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to unlink invoice') }
      setUnlinkInvTarget(null)
      openViewDetail(viewPO) // Refresh PO detail and linked invoices
      toast.success('Invoice unlinked from purchase order')
    } catch (err: any) { toast.error(err?.message || 'Failed to unlink invoice') }
    finally { setUnlinkInvSubmitting(false) }
  }

  // Link Invoice
  const openLinkInvoiceModal = async (po: PurchaseOrder) => {
    setLinkInvoiceTarget(po)
    setLinkInvoiceOpen(true)
    setSelectedInvoiceId(null)
    setLinkInvoiceSearch('')
    setLinkInvoiceError('')
    setLinkInvoiceLoading(true)
    setLinkInvoiceList([])
    try {
      const res = await fetch('/api/invoices?type=purchase')
      if (res.ok) {
        const json = await res.json()
        // Only show posted/paid invoices from the same vendor
        if (json.success) setLinkInvoiceList(json.data.filter((inv: any) =>
          inv.status !== 'draft' && inv.status !== 'cancelled' &&
          inv.businessPartnerId === po.businessPartnerId
        ))
      }
    } catch (err) { console.error('Failed to fetch invoices:', err) }
    finally { setLinkInvoiceLoading(false) }
  }

  const handleLinkInvoice = async () => {
    if (!linkInvoiceTarget || !selectedInvoiceId) return
    setLinkInvoiceSubmitting(true)
    setLinkInvoiceError('')
    try {
      const res = await fetch(`/api/purchase-orders/${linkInvoiceTarget.id}/match-invoice/${selectedInvoiceId}`, { method: 'POST' })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to link invoice') }
      setLinkInvoiceOpen(false)
      setLinkInvoiceTarget(null)
      setSelectedInvoiceId(null)
      // Refresh PO detail
      if (viewPO?.id === linkInvoiceTarget.id) openViewDetail(linkInvoiceTarget)
    } catch (err: any) { setLinkInvoiceError(err?.message || 'An error occurred') }
    finally { setLinkInvoiceSubmitting(false) }
  }

  // Cancel
  const handleCancel = async () => {
    if (!cancelTarget) return
    try {
      const res = await fetch(`/api/purchase-orders/${cancelTarget.id}`, { method: 'DELETE' })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to cancel') }
      setCancelTarget(null); await fetchPOs()
      toast.success(`Purchase order ${cancelTarget.poNumber} cancelled`)
    } catch (err: any) { toast.error(err?.message || 'Failed to cancel purchase order') }
  }

  // Close
  const handleClose = async () => {
    if (!closeTarget) return
    try {
      const res = await fetch(`/api/purchase-orders/${closeTarget.id}/close`, { method: 'POST' })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to close') }
      setCloseTarget(null); await fetchPOs()
      toast.success(`Purchase order ${closeTarget.poNumber} closed`)
    } catch (err: any) { toast.error(err?.message || 'Failed to close purchase order') }
  }

  // Receive
  const openReceiveForm = async (po: PurchaseOrder) => {
    setReceiveTarget(po)
    setReceiveWarehouseId(po.warehouseId)
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`)
      if (res.ok) {
        const json = await res.json()
        if (!json.success) return
        const lines = (json.data.lines || [])
          .filter((l: POLine) => l.receivedQuantity < l.quantity && l.lineType === 'stock')
          .map((l: POLine) => ({ poLineId: l.id, productId: l.productId, description: l.description, maxQty: l.quantity - l.receivedQuantity, quantity: l.quantity - l.receivedQuantity, unitCost: l.unitPrice }))
        setReceiveLines(lines)
      }
    } catch (err) { console.error(err) }
  }

  const handleReceive = async () => {
    if (!receiveTarget || !receiveWarehouseId) return
    setReceiveSubmitting(true)
    try {
      const res = await fetch(`/api/purchase-orders/${receiveTarget.id}/receive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: receiveLines.map(l => ({ poLineId: l.poLineId, productId: l.productId, description: l.description, quantity: Math.min(l.quantity, l.maxQty), unitCost: l.unitCost })), warehouseId: receiveWarehouseId }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to receive') }
      setReceiveTarget(null); await fetchPOs()
      toast.success(`Goods received for purchase order ${receiveTarget.poNumber}`)
    } catch (err: any) { toast.error(err?.message || 'Failed to receive goods') }
    finally { setReceiveSubmitting(false) }
  }

  // Options
  const vendorOptions = useMemo(() => partners.filter(p => p.type === 'vendor' || p.type === 'both').map(p => ({ id: p.id, label: `${p.code} — ${p.name}` })), [partners])
  const productOptions = useMemo(() => products.filter(p => p.isActive !== false).map(p => ({ id: p.id, label: `${p.code} — ${p.name} (${p.unitOfMeasure})` })), [products])
  const warehouseOptions = useMemo(() => warehouses.map(w => ({ id: w.id, label: `${w.code} — ${w.name}` })), [warehouses])

  const matchingStatusColor: Record<string, string> = {
    under_received: 'text-orange-600 bg-orange-50 dark:bg-orange-950/50 dark:text-orange-400',
    over_received: 'text-red-600 bg-red-50 dark:bg-red-950/50 dark:text-red-400',
    matched: 'text-green-600 bg-green-50 dark:bg-green-950/50 dark:text-green-400',
    under_invoiced: 'text-blue-600 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400',
    over_invoiced: 'text-red-600 bg-red-50 dark:bg-red-950/50 dark:text-red-400',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Purchase Orders</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Create, approve, receive, and manage purchase orders.</p>
        </div>
        <button onClick={openAddForm}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> New PO
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Orders', value: formatCurrency(totalPOs), total: formatCurrency(allTotalPOs), color: 'text-brand-500' },
          { label: 'Draft', value: filtered.filter(p => p.status === 'draft').length, total: pos.filter(p => p.status === 'draft').length, color: 'text-yellow-500' },
          { label: 'Approved', value: filtered.filter(p => p.status === 'approved').length, total: pos.filter(p => p.status === 'approved').length, color: 'text-blue-500' },
          { label: 'Received', value: filtered.filter(p => p.status === 'fully_received').length, total: pos.filter(p => p.status === 'fully_received').length, color: 'text-green-500' },
        ].map(s => (
          <StatCard key={s.label} label={s.label} value={s.value} color={s.color} subtext={isFilterActive ? `of ${s.total}` : undefined} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {statusFilters.map(f => (
          <button key={f} onClick={() => setFilterAndResetPage(setStatusFilter, f)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${statusFilter === f ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >{f === 'all' ? 'All' : statusLabels[f] || f}</button>
        ))}
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />
        {(['all', 'linked', 'unlinked'] as const).map(f => (
          <button key={f} onClick={() => setFilterAndResetPage(setInvoiceFilter, f)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${invoiceFilter === f ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >{f === 'all' ? 'All Invoices' : f === 'linked' ? 'Has Invoices' : 'No Invoices'}</button>
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
        <SearchInput value={searchQuery} onChange={v => setFilterAndResetPage(setSearchQuery, v)} placeholder="Search POs..." className="ml-auto max-w-xs" />
      </div>

      {/* PO table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /><span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading purchase orders...</span></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">PO #</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Order Date</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Vendor</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Expected</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Inv.</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.length === 0 ? (
                  <tr><td colSpan={8}><EmptyState compact title="No purchase orders found." /></td></tr>
                ) : (
                  filtered.map(po => (
                    <tr key={po.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-3 px-4 text-sm font-mono font-medium text-brand-600 dark:text-brand-400">{po.poNumber}</td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">{po.orderDate}</td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">{po.partnerName}</td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">{po.expectedDate}</td>
                      <td className="py-3 px-4 text-sm text-right font-medium text-gray-900 dark:text-white">{formatCurrency(po.totalAmount)}</td>
                      <td className="py-3 px-4 text-center">
                        {invoiceCountMap[po.id] > 0 ? (
                          <span className="inline-flex items-center justify-center text-[11px] font-medium w-6 h-6 rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400">
                            {invoiceCountMap[po.id]}
                          </span>
                        ) : (
                          <span className="inline-flex text-[11px] text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <StatusBadge label={statusLabels[po.status] || po.status} color={statusStyles[po.status]} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openViewDetail(po)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors" title="View"><Eye className="w-3.5 h-3.5" /></button>
                          {po.status !== 'cancelled' && po.status !== 'closed' && po.status !== 'draft' && (
                            <button onClick={() => openLinkInvoiceModal(po)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors" title="Link Invoice"><Link2 className="w-3.5 h-3.5" /></button>
                          )}
                          {po.status === 'draft' && (
                            <>
                              <button onClick={() => openEditForm(po)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors" title="Edit"><Edit3 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setApproveTarget(po)} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors" title="Approve"><BadgeCheck className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setCancelTarget(po)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Cancel"><X className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                          {(po.status === 'approved' || po.status === 'partially_received') && (
                            <button onClick={() => openReceiveForm(po)} className="p-1.5 rounded-lg text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors" title="Receive"><Package className="w-3.5 h-3.5" /></button>
                          )}
                          {(po.status === 'fully_received' || po.status === 'partially_received') && (
                            <button onClick={() => setCloseTarget(po)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Close"><Archive className="w-3.5 h-3.5" /></button>
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

      {/* ═══ CREATE / EDIT PO MODAL ═══ */}
      <Modal isOpen={showForm} onClose={closeForm} className="max-w-4xl p-0" showCloseButton={false}>
        <ModalHeader title={editingPO ? `Edit ${editingPO.poNumber}` : 'New Purchase Order'} onClose={closeForm} />
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Vendor *</label>
              <SearchSelect options={vendorOptions} value={formData.businessPartnerId} onChange={handlePartnerSelect} placeholder="Select vendor..." searchPlaceholder="Search vendors..." notFoundLabel="No vendors found" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Vendor Name</label>
              <input type="text" value={formData.partnerName} onChange={e => setFormData(prev => ({ ...prev, partnerName: e.target.value }))} placeholder="Or type manually" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Order Date</label>
              <DatePicker value={formData.orderDate} onChange={(v) => setFormData(prev => ({ ...prev, orderDate: v }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Expected Date</label>
              <DatePicker value={formData.expectedDate} onChange={(v) => setFormData(prev => ({ ...prev, expectedDate: v }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Warehouse</label>
              <SearchSelect options={warehouseOptions} value={formData.warehouseId} onChange={(val) => setFormData(prev => ({ ...prev, warehouseId: val ? Number(val) : null }))} placeholder="Default warehouse..." noneLabel="None" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reference #</label>
              <input type="text" value={formData.referenceNumber} onChange={e => setFormData(prev => ({ ...prev, referenceNumber: e.target.value }))} placeholder="Supplier ref" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Notes</label>
              <input type="text" value={formData.notes} onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))} placeholder="Optional notes" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Line Items</h4>
              <button type="button" onClick={addLine} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 text-xs font-medium hover:bg-brand-100 dark:hover:bg-brand-950/50 transition-colors"><Plus className="w-3.5 h-3.5" /> Add Item</button>
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
                        <span className="text-xs font-medium text-gray-400 dark:text-gray-500">#{idx + 1}</span>
                        <button onClick={() => removeLine(line.id)} className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2">
                        <div className="lg:col-span-3">
                          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Product</label>
                          <SearchSelect options={productOptions} value={line.productId} onChange={(val) => handleProductSelect(line.id, val ? Number(val) : null)} placeholder="Select product..." />
                        </div>
                        <div className="lg:col-span-2">
                          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
                          <input type="text" value={line.description} onChange={e => updateLine(line.id, { description: e.target.value })} placeholder="Description" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white placeholder:text-gray-400" />
                        </div>
                        <div className="lg:col-span-1">
                          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Qty</label>
                          <input type="number" value={line.quantity || ''} min={1} onChange={e => updateLine(line.id, { quantity: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white text-center" />
                        </div>
                        <div className="lg:col-span-2">
                          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Unit Price ($)</label>
                          <input type="number" value={line.unitPrice || ''} min={0} step="0.01" onChange={e => updateLine(line.id, { unitPrice: Number(e.target.value) || 0 })} className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white text-right" />
                        </div>
                        <div className="lg:col-span-1">
                          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Disc %</label>
                          <input type="number" value={line.discountPercent || ''} min={0} max={100} onChange={e => updateLine(line.id, { discountPercent: Number(e.target.value) || 0 })} className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white text-center" />
                        </div>
                        <div className="lg:col-span-2">
                          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Total</label>
                          <div className="px-2.5 py-1.5 text-xs font-semibold text-gray-900 dark:text-white text-right bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">${lt.toFixed(2)}</div>
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
              <div className="flex items-center justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Subtotal</span><span className="text-gray-900 dark:text-white font-medium">${lineTotals.subtotal.toFixed(2)}</span></div>
              <div className="flex items-center justify-between text-base border-t border-gray-200 dark:border-gray-700 pt-1.5"><span className="font-semibold text-gray-900 dark:text-white">Total</span><span className="font-bold text-brand-600 dark:text-brand-400">${lineTotals.total.toFixed(2)}</span></div>
            </div>
          </div>

          {formError && <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-2.5"><p className="text-sm text-red-700 dark:text-red-400">{formError}</p></div>}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <Button variant="outline" size="sm" onClick={closeForm} disabled={submitting}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={submitting} className="flex items-center gap-2">
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {editingPO ? 'Update' : 'Create PO'}
          </Button>
        </div>
      </Modal>

      {/* ═══ VIEW PO DETAIL MODAL ═══ */}
      <Modal isOpen={!!viewPO} onClose={() => setViewPO(null)} className="max-w-4xl p-0" showCloseButton={false}>
        <ModalHeader title={`PO ${viewPO?.poNumber}`} onClose={() => setViewPO(null)}>
          {viewPO && <StatusBadge label={statusLabels[viewPO.status]} color={statusStyles[viewPO.status]} size="sm" className="mt-1" />}
        </ModalHeader>
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
          {viewLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-brand-500 animate-spin" /><span className="ml-2 text-sm text-gray-400">Loading...</span></div>
          ) : viewPO ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <div><p className="text-xs text-gray-500 dark:text-gray-400">Vendor</p><p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{viewPO.partnerName}</p></div>
                <div><p className="text-xs text-gray-500 dark:text-gray-400">Order Date</p><p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{viewPO.orderDate}</p></div>
                <div><p className="text-xs text-gray-500 dark:text-gray-400">Expected</p><p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{viewPO.expectedDate}</p></div>
                <div><p className="text-xs text-gray-500 dark:text-gray-400">Total</p><p className="text-sm font-semibold text-brand-600 dark:text-brand-400 mt-0.5">{formatCurrency(viewPO.totalAmount)}</p></div>
              </div>

              {/* Lines */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Line Items</h4>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Product</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Description</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Ordered</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Received</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Price</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Total</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {viewLines.length === 0 ? <tr><td colSpan={7} className="py-8 text-center text-sm text-gray-400">No line items</td></tr> : (
                        viewLines.map(l => (
                          <tr key={l.id}>
                            <td className="py-2 px-3 text-xs text-gray-400">{l.lineNumber}</td>
                            <td className="py-2 px-3 text-xs font-medium text-gray-900 dark:text-white">#{l.productId}</td>
                            <td className="py-2 px-3 text-xs text-gray-600 dark:text-gray-300">{l.description}</td>
                            <td className="py-2 px-3 text-xs text-right text-gray-900 dark:text-white">{l.quantity}</td>
                            <td className="py-2 px-3 text-xs text-right font-medium">{l.receivedQuantity > 0 ? <span className="text-green-600">{l.receivedQuantity}</span> : <span className="text-gray-400">0</span>}</td>
                            <td className="py-2 px-3 text-xs text-right text-gray-900 dark:text-white">{formatCurrency(l.unitPrice)}</td>
                            <td className="py-2 px-3 text-xs text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(l.lineTotal)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Three-way Matching */}
              {viewMatching.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><Link2 className="w-4 h-4 text-brand-500" /> Three-way Matching</h4>
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Line</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Ordered</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Received</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Invoiced</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {viewMatching.map(m => (
                          <tr key={m.lineId}>
                            <td className="py-2 px-3 text-xs text-gray-600 dark:text-gray-300">{m.description}</td>
                            <td className="py-2 px-3 text-xs text-right text-gray-900 dark:text-white font-medium">{m.orderedQty}</td>
                            <td className="py-2 px-3 text-xs text-right text-gray-900 dark:text-white">{m.receivedQty}</td>
                            <td className="py-2 px-3 text-xs text-right text-gray-900 dark:text-white">{m.invoicedQty}</td>
                            <td className="py-2 px-3 text-xs text-center">
                              <span className={`inline-flex text-[11px] font-medium px-1.5 py-0.5 rounded-full ${matchingStatusColor[m.status] || 'text-gray-500 bg-gray-50'}`}>
                                {m.status.replace(/_/g, ' ')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Receipts */}
              {viewReceipts.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><Package className="w-4 h-4 text-green-500" /> Goods Receipts</h4>
                  <div className="space-y-3">
                    {viewReceipts.map(r => (
                      <div key={r.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-900 dark:text-white">{r.receiptNumber}</span>
                          <span className="text-[11px] text-gray-500">{r.receiptDate}</span>
                        </div>
                        <table className="w-full text-xs">
                          <thead><tr className="border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-1 text-gray-500">Product</th>
                            <th className="text-right py-1 text-gray-500">Qty</th>
                            <th className="text-right py-1 text-gray-500">Unit Cost</th>
                          </tr></thead>
                          <tbody>
                            {r.lines.map(l => (
                              <tr key={l.id}>
                                <td className="py-1 text-gray-900 dark:text-white">{l.description || `#${l.productId}`}</td>
                                <td className="py-1 text-right text-gray-900 dark:text-white font-medium">{l.quantity}</td>
                                <td className="py-1 text-right text-gray-600 dark:text-gray-400">{formatCurrency(l.unitCost)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Linked Invoices */}
              {viewLinkedInvoices.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><Link2 className="w-4 h-4 text-brand-500" /> Linked Invoices</h4>
                  <div className="space-y-2">
                    {viewLinkedInvoices.map(inv => (
                      <div key={inv.id} className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                        <div>
                          <p className="text-sm font-mono font-medium text-gray-900 dark:text-white">{inv.invoiceNumber}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatCurrency(inv.totalAmount)}</p>
                        </div>
                        <button onClick={() => setUnlinkInvTarget({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber })}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="Unlink invoice"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : <p className="text-center text-sm text-gray-400 py-8">Purchase order not found.</p>}
        </div>
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <div>
            {viewPO && viewPO.status !== 'cancelled' && viewPO.status !== 'closed' && (
              <Button variant="outline" size="sm" onClick={() => openLinkInvoiceModal(viewPO)}
                className="flex items-center gap-2 !text-brand-600 !border-brand-300 hover:!bg-brand-50 dark:!border-brand-700 dark:hover:!bg-brand-950/30">
                <Link2 className="w-3.5 h-3.5" /> Link Invoice
              </Button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setViewPO(null)}>Close</Button>
        </div>
      </Modal>

      {/* ═══ RECEIVE GOODS MODAL ═══ */}
      <Modal isOpen={!!receiveTarget} onClose={() => setReceiveTarget(null)} className="max-w-2xl p-0" showCloseButton={false}>
        <ModalHeader title="Receive Goods" subtitle={receiveTarget ? `${receiveTarget.poNumber} — ${receiveTarget.partnerName}` : undefined} onClose={() => setReceiveTarget(null)} />
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {receiveLines.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No stock items available to receive (all items are fully received or services).</p>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Warehouse</label>
                <SearchSelect options={warehouseOptions} value={receiveWarehouseId} onChange={(val) => setReceiveWarehouseId(val ? Number(val) : null)} placeholder="Select warehouse..." />
              </div>
              <div className="space-y-3">
                {receiveLines.map((rl, idx) => (
                  <div key={rl.poLineId} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-900 dark:text-white">{rl.description}</span>
                      <span className="text-[11px] text-gray-500">Max: {rl.maxQty}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Quantity</label>
                        <input type="number" min={1} max={rl.maxQty} value={rl.quantity} onChange={e => {
                          const newLines = [...receiveLines]; newLines[idx] = { ...newLines[idx], quantity: Math.min(Math.max(1, Number(e.target.value) || 1), rl.maxQty) }; setReceiveLines(newLines)
                        }} className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white text-center" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Unit Cost ($)</label>
                        <input type="number" min={0} step="0.01" value={(rl.unitCost / 100).toFixed(2)} onChange={e => {
                          const newLines = [...receiveLines]; newLines[idx] = { ...newLines[idx], unitCost: Math.round(Number(e.target.value) * 100 || 0) }; setReceiveLines(newLines)
                        }} className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white text-right" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <Button variant="outline" size="sm" onClick={() => setReceiveTarget(null)}>Cancel</Button>
          <Button size="sm" onClick={handleReceive} disabled={receiveSubmitting || receiveLines.length === 0 || !receiveWarehouseId} className="flex items-center gap-2 !bg-green-600 hover:!bg-green-700">
            {receiveSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />}
            Receive Goods
          </Button>
        </div>
      </Modal>

      {/* ═══ CONFIRMATION MODALS ═══ */}
      <Modal isOpen={!!approveTarget} onClose={() => setApproveTarget(null)} className="max-w-sm p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Approve Purchase Order</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Approve {approveTarget?.poNumber} from {approveTarget?.partnerName}?</p>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => setApproveTarget(null)}>Cancel</Button>
            <Button size="sm" onClick={handleApprove} disabled={approving} className="flex items-center gap-2 !bg-indigo-600 hover:!bg-indigo-700">{approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />} Approve</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} className="max-w-sm p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Cancel PO</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Cancel {cancelTarget?.poNumber}?</p>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => setCancelTarget(null)}>Keep</Button>
            <Button size="sm" onClick={handleCancel} className="!bg-red-600 hover:!bg-red-700 flex items-center gap-2"><X className="w-3.5 h-3.5" /> Cancel PO</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!closeTarget} onClose={() => setCloseTarget(null)} className="max-w-sm p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Close PO</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Close {closeTarget?.poNumber}? This will mark it as completed.</p>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => setCloseTarget(null)}>Cancel</Button>
            <Button size="sm" onClick={handleClose} className="!bg-gray-700 hover:!bg-gray-800 flex items-center gap-2"><Archive className="w-3.5 h-3.5" /> Close PO</Button>
          </div>
        </div>
      </Modal>

      {/* ═══ UNLINK INVOICE CONFIRMATION ═══ */}
      <Modal isOpen={!!unlinkInvTarget} onClose={() => setUnlinkInvTarget(null)} className="max-w-sm p-6">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/50 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Unlink Invoice</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Unlink <strong>{unlinkInvTarget?.invoiceNumber}</strong> from this purchase order? This will reset invoiced quantities on the PO lines.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" size="sm" onClick={() => setUnlinkInvTarget(null)} disabled={unlinkInvSubmitting}>Cancel</Button>
          <Button size="sm" onClick={handleUnlinkInvoice} disabled={unlinkInvSubmitting}
            className="flex items-center gap-2 !bg-red-600 hover:!bg-red-700">
            {unlinkInvSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
            Unlink Invoice
          </Button>
        </div>
      </Modal>

      {/* ═══ LINK INVOICE MODAL ═══ */}
      <Modal isOpen={linkInvoiceOpen} onClose={() => { setLinkInvoiceOpen(false); setLinkInvoiceTarget(null); setSelectedInvoiceId(null); setLinkInvoiceError('') }} className="max-w-lg p-0" showCloseButton={false}>
        <ModalHeader title="Link Invoice to PO" subtitle={linkInvoiceTarget ? `${linkInvoiceTarget.poNumber} — ${linkInvoiceTarget.partnerName}` : undefined} onClose={() => { setLinkInvoiceOpen(false); setLinkInvoiceTarget(null); setSelectedInvoiceId(null); setLinkInvoiceError('') }} />
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <SearchInput value={linkInvoiceSearch} onChange={setLinkInvoiceSearch} placeholder="Search by invoice number or vendor..." />

          {linkInvoiceLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading invoices...</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(() => {
                const filtered = linkInvoiceSearch.trim()
                  ? linkInvoiceList.filter(inv =>
                      inv.invoiceNumber.toLowerCase().includes(linkInvoiceSearch.toLowerCase()) ||
                      inv.partnerName.toLowerCase().includes(linkInvoiceSearch.toLowerCase())
                    )
                  : linkInvoiceList
                return filtered.length === 0 ? (
                  <p className="text-center py-8 text-sm text-gray-400">No matching purchase invoices found for this vendor.</p>
                ) : (
                  filtered.map(inv => (
                    <button key={inv.id} onClick={() => setSelectedInvoiceId(inv.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        selectedInvoiceId === inv.id
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 dark:border-brand-400'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white font-mono">{inv.invoiceNumber}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{inv.partnerName}</p>
                        </div>
                        <div className="text-right">
                          <span className={`inline-flex text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                            inv.status === 'posted' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400' :
                            inv.status === 'paid' ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400' :
                            'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}>{inv.status.replace(/_/g, ' ')}</span>
                          <p className="text-xs text-gray-400 mt-1">{formatCurrency(inv.totalAmount)}</p>
                        </div>
                      </div>
                    </button>
                  ))
                )
              })()}
            </div>
          )}

          {linkInvoiceError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-2.5">
              <p className="text-sm text-red-700 dark:text-red-400">{linkInvoiceError}</p>
            </div>
          )}
        </div>
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <Button variant="outline" size="sm" onClick={() => { setLinkInvoiceOpen(false); setLinkInvoiceTarget(null); setSelectedInvoiceId(null); setLinkInvoiceError('') }}>Cancel</Button>
          <Button size="sm" onClick={handleLinkInvoice} disabled={!selectedInvoiceId || linkInvoiceSubmitting}
            className="flex items-center gap-2 !bg-brand-600 hover:!bg-brand-700">
            {linkInvoiceSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            Link Invoice
          </Button>
        </div>
      </Modal>
    </div>
  )
}
