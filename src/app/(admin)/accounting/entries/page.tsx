'use client'
import { formatCurrency } from '@/lib/formatters'
import { ClearFiltersButton, StatusBadge, ModalHeader, SearchInput, StatCard, EmptyState } from '@/components/ui'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo, Fragment, Suspense } from 'react'
import { usePagination } from '@/hooks/usePagination'
import {
  Plus, Eye, Edit3, Loader2, Trash2, ChevronDown,
  X, AlertTriangle, CheckCircle, FileText, Scale,
  ChevronUp, Percent, Receipt, Link2,
} from 'lucide-react'
import SearchSelect from '@/components/form/SearchSelect'
import { buildAccountHierarchyOptions } from '@/lib/accountTree'
import DatePicker from '@/components/form/input/DatePicker'
import Button from '@/components/ui/button/Button'
import { Pagination } from '@/components/Pagination'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type {
  Entry, EntryLine, Account, EntryCategory,
  EntryLineType, BusinessPartner, CostCenter, TaxCode, PostingProfile, Invoice, Employee,
} from '@/types/erp'
import EntryFormModal from '@/components/entries/EntryFormModal'
import LineEditorModal from '@/components/entries/LineEditorModal'
import ViewEntryModal from '@/components/entries/ViewEntryModal'
import EntryConfirmationModals from '@/components/entries/EntryConfirmationModals'

const statusStyles: Record<string, string> = {
  draft: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400',
  posted: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400',
  cancelled: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
}

const statusFilters = ['all', 'draft', 'posted', 'cancelled'] as const

const lineTypeConfig: Record<EntryLineType, { label: string; bg: string; text: string }> = {
  normal: { label: 'Normal', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-300' },
  tax: { label: 'Tax', bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-400' },
  payment: { label: 'Payment', bg: 'bg-blue-50 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-400' },
}

type CoreTaxDetailKey = 'supplierName' | 'supplierTaxId' | 'invoiceNumber' | 'invoiceDate'
const CORE_TAX_KEY_VARIANTS: Record<string, CoreTaxDetailKey> = {
  supplierName: 'supplierName', supplier_name: 'supplierName',
  supplierTaxId: 'supplierTaxId', supplier_tax_id: 'supplierTaxId',
  invoiceNumber: 'invoiceNumber', invoice_number: 'invoiceNumber', invoice: 'invoiceNumber',
  invoiceDate: 'invoiceDate', invoice_date: 'invoiceDate',
}
const coreTaxKeyFor = (k: string): CoreTaxDetailKey | null => CORE_TAX_KEY_VARIANTS[k] || null

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

interface EntryFormData {
  entryDate: string
  description: string
  referenceNumber: string
  entryCategoryId: number | null
  lines: LineFormData[]
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

const emptyForm = (): EntryFormData => ({
  entryDate: new Date().toISOString().split('T')[0],
  description: '',
  referenceNumber: '',
  entryCategoryId: null,
  lines: [],
})

let _lineKey = 0
const nextLineId = () => `line_${++_lineKey}`

const emptyTaxPanelForm = (): TaxPanelForm => ({
  groupId: null,
  vatCodeId: null,
  base: 0,
  supplierName: '',
  supplierTaxId: '',
  invoiceNumber: '',
  invoiceDate: '',
  details: {},
})

const newLine = (): LineFormData => ({
  id: nextLineId(),
  lineType: 'normal',
  accountCode: '',
  description: '',
  debitAmount: 0,
  creditAmount: 0,
  costCenterId: null,
  businessPartnerId: null,
  employeeId: null,
  vatCodeId: null,
  vatAmount: 0,
  supplierName: '',
  supplierTaxId: '',
  invoiceNumber: '',
  invoiceDate: '',
  taxDetailsJson: {},
  allocations: [],
})

const deriveLineType = (l: LineFormData): EntryLineType =>
  l.vatCodeId ? 'tax' : l.allocations.length > 0 ? 'payment' : 'normal'

export default function EntriesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /><span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading entries...</span></div>}>
      <EntriesPageContent />
    </Suspense>
  )
}

function EntriesPageContent() {
  const toast = useToast()
  const [entries, setEntries] = useState<Entry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const { page, pageSize, setFilterAndResetPage } = usePagination()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<EntryCategory[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [partners, setPartners] = useState<BusinessPartner[]>([])
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([])
  const [postingProfiles, setPostingProfiles] = useState<PostingProfile[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [openInvoices, setOpenInvoices] = useState<Record<number, Invoice[]>>({})
  const [loadingInvoices, setLoadingInvoices] = useState<number | null>(null)

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [entryLines, setEntryLines] = useState<Record<number, EntryLine[]>>({})
  const [loadingLines, setLoadingLines] = useState<number | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [formData, setFormData] = useState<EntryFormData>(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [lineModalOpen, setLineModalOpen] = useState(false)
  const [draftLine, setDraftLine] = useState<LineFormData | null>(null)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [taxPanelOpen, setTaxPanelOpen] = useState(false)
  const [paymentPanelOpen, setPaymentPanelOpen] = useState(false)
  const [arApGuardOpen, setArApGuardOpen] = useState(false)
  const [taxPanelForm, setTaxPanelForm] = useState(emptyTaxPanelForm())
  const [paymentError, setPaymentError] = useState('')

  const [viewEntry, setViewEntry] = useState<Entry | null>(null)
  const [viewLines, setViewLines] = useState<EntryLine[]>([])
  const [viewLoading, setViewLoading] = useState(false)

  const [postTarget, setPostTarget] = useState<Entry | null>(null)
  const [posting, setPosting] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Entry | null>(null)

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (searchQuery) params.set('search', searchQuery)
      if (categoryFilter !== 'all') params.set('categoryId', categoryFilter)
      const res = await fetch(`/api/entries?${params}`)
      if (res.ok) { const json = await res.json(); if (json.success) { setEntries(json.data); setTotal(json.total) } }
    } catch (err) {
      console.error('Failed to fetch entries:', err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter, searchQuery, categoryFilter])

  const fetchRefData = useCallback(async () => {
    try {
      const [aRes, cRes, ccRes, pRes, tRes, ppRes, eRes] = await Promise.all([
        fetch('/api/accounts'), fetch('/api/entry-categories'), fetch('/api/cost-centers'),
        fetch('/api/partners'), fetch('/api/tax-codes'), fetch('/api/posting-profiles'), fetch('/api/employees'),
      ])
      if (aRes.ok) { const json = await aRes.json(); if (json.success) setAccounts(json.data) }
      if (cRes.ok) { const json = await cRes.json(); if (json.success) setCategories(json.data) }
      if (ccRes.ok) { const json = await ccRes.json(); if (json.success) setCostCenters(json.data) }
      if (pRes.ok) { const json = await pRes.json(); if (json.success) setPartners(json.data) }
      if (tRes.ok) { const json = await tRes.json(); if (json.success) setTaxCodes(json.data) }
      if (ppRes.ok) { const json = await ppRes.json(); if (json.success) setPostingProfiles(json.data) }
      if (eRes.ok) { const json = await eRes.json(); if (json.success) setEmployees(json.data) }
    } catch (err) {
      console.error('Failed to fetch reference data:', err)
    }
  }, [])

  useEffect(() => { fetchEntries() }, [fetchEntries])
  useEffect(() => { fetchRefData() }, [fetchRefData])

  const accountOptions = useMemo(() => buildAccountHierarchyOptions(
    accounts,
    a => `${a.code} — ${a.name} (${a.type})${!a.isActive ? ' (inactive)' : ''}`,
  ), [accounts])

  const accountMap = useMemo(() => {
    const map = new Map<string, Account>()
    for (const a of accounts) map.set(a.code, a)
    return map
  }, [accounts])

  const categoryOptions = useMemo(() => categories
    .filter(c => c.isActive)
    .map(c => ({ id: c.id, label: `${c.code} — ${c.name}` })),
  [categories])

  const categoryMap = useMemo(() => {
    const map = new Map<number, EntryCategory>()
    for (const c of categories) map.set(c.id, c)
    return map
  }, [categories])

  const costCenterMap = useMemo(() => {
    const map = new Map<number, CostCenter>()
    for (const c of costCenters) map.set(c.id, c)
    return map
  }, [costCenters])

  const partnerMap = useMemo(() => {
    const map = new Map<number, BusinessPartner>()
    for (const p of partners) map.set(p.id, p)
    return map
  }, [partners])

  const taxCodeMap = useMemo(() => {
    const map = new Map<number, TaxCode>()
    for (const t of taxCodes) map.set(t.id, t)
    return map
  }, [taxCodes])

  const employeeOptions = useMemo(() => employees
    .filter(e => e.isActive)
    .map(e => ({ id: e.id, label: `${e.code} — ${e.name}${e.department ? ` · ${e.department}` : ''}` })),
  [employees])

  const taxTypeOptions = useMemo(() => {
    const groups = taxCodes.filter(t => t.isGroup)
    return taxCodes
      .filter(t => t.isActive && !t.isGroup)
      .map(t => ({
        id: t.id,
        label: `${t.code} — ${t.name} (${t.rate}%)`,
        groupId: t.parentId,
        groupLabel: groups.find(g => g.id === t.parentId)?.name || 'Other',
      }))
  }, [taxCodes])

  const taxGroupOptions = useMemo(() => taxCodes
    .filter(t => t.isActive && t.isGroup)
    .map(g => ({ id: g.id, label: `${g.code} — ${g.name}` })),
  [taxCodes])

  const linkedCostCenterForAccount = useCallback((accountCode: string): CostCenter | undefined => {
    const acct = accountMap.get(accountCode)
    const seedId = acct?.linkType === 'cost_center' ? acct.linkId : (acct?.costCenterId ?? null)
    if (!seedId) return undefined
    return costCenters.find(c => c.id === seedId)
  }, [accountMap, costCenters])

  const costCenterOptionsForAccount = useCallback((accountCode: string) => {
    const seed = linkedCostCenterForAccount(accountCode)
    if (!seed) return []
    const childrenOf = new Map<number | null, CostCenter[]>()
    for (const c of costCenters) {
      const key = c.parentId
      if (!childrenOf.has(key)) childrenOf.set(key, [])
      childrenOf.get(key)!.push(c)
    }
    const hasChildren = (id: number) => (childrenOf.get(id)?.length || 0) > 0
    const out: { id: number; label: string; disabled?: boolean; indent: number }[] = []
    const walk = (parentId: number, depth: number) => {
      for (const c of childrenOf.get(parentId) || []) {
        out.push({ id: c.id, label: `${c.code} — ${c.name}`, disabled: hasChildren(c.id), indent: depth })
        walk(c.id, depth + 1)
      }
    }
    walk(seed.id, 0)
    if (out.length === 0) out.push({ id: seed.id, label: `${seed.code} — ${seed.name}`, indent: 0 })
    return out
  }, [costCenters, linkedCostCenterForAccount])

  const partnerRoleForAccount = useCallback((accountCode: string): 'ar' | 'ap' | 'both' => {
    const acct = accountMap.get(accountCode)
    if (acct && acct.linkType === 'partner') {
      const filter = acct.linkPartnerFilter || 'both'
      return filter === 'customer' ? 'ar' : filter === 'vendor' ? 'ap' : 'both'
    }
    const active = postingProfiles.filter(p => p.isActive)
    const asAr = active.some(p => p.accountsReceivableCode === accountCode)
    const asAp = active.some(p => p.accountsPayableCode === accountCode)
    if (asAr && asAp) return 'both'
    if (asAr) return 'ar'
    if (asAp) return 'ap'
    return 'both'
  }, [accountMap, postingProfiles])

  const isArApAccount = useCallback((accountCode: string): boolean => {
    const acct = accountMap.get(accountCode)
    if (acct && acct.linkType === 'partner') return true
    const active = postingProfiles.filter(p => p.isActive)
    return active.some(p => p.accountsReceivableCode === accountCode || p.accountsPayableCode === accountCode)
  }, [accountMap, postingProfiles])

  const partnerOptionsForRole = useCallback((role: 'ar' | 'ap' | 'both') =>
    partners
      .filter(p => p.status === 'active' && (
        role === 'both'
        || (role === 'ar' ? (p.type === 'customer' || p.type === 'both') : (p.type === 'vendor' || p.type === 'both'))
      ))
      .map(p => ({ id: p.id, label: `${p.code} — ${p.name}` })),
  [partners])

  const fetchOpenInvoices = useCallback(async (partnerId: number, force = false) => {
    if (!force && openInvoices[partnerId]) return
    setLoadingInvoices(partnerId)
    try {
      const res = await fetch(`/api/invoices?businessPartnerId=${partnerId}&open=1&pageSize=50`)
      if (res.ok) {
        const json = await res.json()
        if (json.success) setOpenInvoices(prev => ({ ...prev, [partnerId]: json.data }))
      }
    } catch (err) {
      console.error('Failed to fetch open invoices:', err)
    } finally {
      setLoadingInvoices(null)
    }
  }, [openInvoices])

  const filtered = useMemo(() => entries.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    if (categoryFilter !== 'all' && e.categoryId !== Number(categoryFilter)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return e.entryNumber.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
    }
    return true
  }), [entries, statusFilter, searchQuery, categoryFilter])

  const totalDebit = useMemo(() => filtered.reduce((s, e) => s + e.totalDebit, 0), [filtered])
  const totalCredit = useMemo(() => filtered.reduce((s, e) => s + e.totalCredit, 0), [filtered])
  const isBalanced = totalDebit === totalCredit

  const formTotals = useMemo(() => {
    let d = 0, c = 0
    for (const line of formData.lines) {
      d += line.debitAmount
      c += line.creditAmount
    }
    return { debit: d, credit: c, balanced: d === c }
  }, [formData.lines])

  const toggleExpand = async (entryId: number) => {
    if (entryLines[entryId]) {
      setExpandedId(expandedId === entryId ? null : entryId)
      return
    }
    setLoadingLines(entryId)
    try {
      const res = await fetch(`/api/entries/${entryId}`)
      if (res.ok) {
        const json = await res.json()
        if (json.success) setEntryLines(prev => ({ ...prev, [entryId]: json.data.lines ?? [] }))
      }
    } catch (err) {
      console.error('Failed to fetch entry lines:', err)
    } finally {
      setLoadingLines(null)
      setExpandedId(expandedId === entryId ? null : entryId)
    }
  }

  const openAddForm = () => {
    setEditingEntry(null)
    setFormData(emptyForm())
    setFormError('')
    setShowForm(true)
  }

  const openEditForm = async (entry: Entry) => {
    setEditingEntry(entry)
    setFormError('')
    setFormData({
      entryDate: entry.entryDate,
      description: entry.description,
      referenceNumber: entry.referenceNumber,
      entryCategoryId: entry.categoryId,
      lines: [],
    })

    try {
      const res = await fetch(`/api/entries/${entry.id}`)
      if (res.ok) {
        const json = await res.json()
        if (json.success && json.data.lines) {
          setFormData(prev => ({
            ...prev,
            lines: json.data.lines.map((l: EntryLine & { allocations?: { id: number; invoiceId: number; amount: number; notes: string }[] }) => ({
              id: nextLineId(),
              lineType: l.lineType || 'normal',
              accountCode: l.accountCode,
              description: l.description || '',
              debitAmount: Math.round(l.debitAmount / 100),
              creditAmount: Math.round(l.creditAmount / 100),
              costCenterId: l.costCenterId,
              businessPartnerId: l.businessPartnerId,
              employeeId: l.employeeId,
              vatCodeId: l.vatCodeId,
              vatAmount: Math.round(l.vatAmount / 100),
              supplierName: l.supplierName || '',
              supplierTaxId: l.supplierTaxId || '',
              invoiceNumber: l.invoiceNumber || '',
              invoiceDate: l.invoiceDate || '',
              taxDetailsJson: (() => { try { return JSON.parse(l.taxDetailsJson || '{}') } catch { return {} } })(),
              allocations: (l.allocations || []).map(a => ({
                id: nextLineId(),
                invoiceId: a.invoiceId,
                amount: Math.round(a.amount / 100),
                notes: a.notes || '',
              })),
            })),
          }))
        }
      }
    } catch (err) {
      console.error('Failed to fetch entry lines:', err)
    }
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingEntry(null)
    setFormError('')
  }

  const addLine = () => {
    setDraftLine(newLine())
    setEditingLineId(null)
    setLineModalOpen(true)
  }

  const editLine = (id: string) => {
    const line = formData.lines.find(l => l.id === id)
    if (!line) return
    setDraftLine({ ...line, allocations: line.allocations.map(a => ({ ...a })) })
    setEditingLineId(id)
    setLineModalOpen(true)
  }

  const closeLineModal = () => {
    setLineModalOpen(false)
    setDraftLine(null)
    setEditingLineId(null)
    setTaxPanelOpen(false)
    setPaymentPanelOpen(false)
    setArApGuardOpen(false)
    setPaymentError('')
  }

  const saveLineFromModal = () => {
    if (!draftLine) return
    if (!draftLine.accountCode) {
      setFormError('Every line must have an account selected')
      return
    }
    const line = { ...draftLine, lineType: deriveLineType(draftLine) }
    setFormData(prev => {
      if (editingLineId) {
        return {
          ...prev,
          lines: prev.lines.map(l => l.id === editingLineId ? line : l),
        }
      }
      return { ...prev, lines: [...prev.lines, line] }
    })
    setFormError('')
    closeLineModal()
  }

  const removeLine = (id: string) => {
    setFormData(prev => ({ ...prev, lines: prev.lines.filter(l => l.id !== id) }))
  }

  const updateDraftLine = (updates: Partial<LineFormData>) => {
    setDraftLine(prev => prev ? { ...prev, ...updates } : prev)
  }

  const updateDraftAllocation = (invoiceId: number, updates: Partial<LineAllocationFormData>) => {
    setDraftLine(prev => {
      if (!prev) return prev
      const exists = prev.allocations.some(a => a.invoiceId === invoiceId)
      return {
        ...prev,
        allocations: exists
          ? prev.allocations.map(a => a.invoiceId === invoiceId ? { ...a, ...updates } : a)
          : [...prev.allocations, { id: nextLineId(), invoiceId, amount: 0, notes: '', ...updates }],
      }
    })
  }

  const removeDraftAllocation = (invoiceId: number) => {
    setDraftLine(prev => prev
      ? { ...prev, allocations: prev.allocations.filter(a => a.invoiceId !== invoiceId) }
      : prev)
  }

  const appendTaxLine = () => {
    if (!draftLine) return
    if (!taxPanelForm.vatCodeId || taxPanelForm.base <= 0) return
    const tax = taxCodeMap.get(taxPanelForm.vatCodeId)
    if (!tax) return
    if (!tax.accountCode) {
      setFormError(`Tax type "${tax.name}" has no posting account — set one in Tax Setup first`)
      return
    }
    const amount = Math.round(taxPanelForm.base * tax.rate) / 100
    const isInput = tax.type === 'input'
    const baseIsDebit = draftLine.debitAmount > 0 || (draftLine.creditAmount === 0 && isInput)
    const baseLine: LineFormData = {
      ...newLine(),
      accountCode: draftLine.accountCode,
      description: draftLine.description,
      debitAmount: baseIsDebit ? taxPanelForm.base : 0,
      creditAmount: baseIsDebit ? 0 : taxPanelForm.base,
      costCenterId: draftLine.costCenterId,
      businessPartnerId: draftLine.businessPartnerId,
      employeeId: draftLine.employeeId,
      allocations: draftLine.allocations.map(a => ({ ...a })),
    }
    const baseAcct = draftLine.accountCode ? accountMap.get(draftLine.accountCode) : undefined
    const taxAccount = tax.accountCode ? accountMap.get(tax.accountCode) : undefined
    const sameCostCenterRoot = baseAcct?.linkType === 'cost_center'
      && (baseAcct.linkId ?? baseAcct.costCenterId ?? null) === (taxAccount?.linkId ?? null)
    const samePartnerFilter = baseAcct?.linkType === 'partner'
      && taxAccount?.linkType === 'partner'
      && (taxAccount.linkPartnerFilter || 'both') === (baseAcct.linkPartnerFilter || 'both')
    const sameEmployeeLink = baseAcct?.linkType === 'employee' && taxAccount?.linkType === 'employee'
    const taxCostCenterId = !taxAccount ? draftLine.costCenterId
      : taxAccount.linkType === 'cost_center' && sameCostCenterRoot ? draftLine.costCenterId
      : null
    const taxPartnerId = !taxAccount ? draftLine.businessPartnerId
      : taxAccount.linkType === 'partner' && samePartnerFilter ? draftLine.businessPartnerId
      : null
    const taxEmployeeId = !taxAccount ? draftLine.employeeId
      : taxAccount.linkType === 'employee' && sameEmployeeLink ? draftLine.employeeId
      : null
    const extras: Record<string, string> = {}
    for (const f of tax.detailsConfig || []) {
      if (coreTaxKeyFor(f.key)) continue
      const v = taxPanelForm.details[f.key]
      if (v) extras[f.key] = v
    }
    const taxLine: LineFormData = {
      ...newLine(),
      lineType: 'tax',
      accountCode: tax.accountCode,
      description: `${tax.code} — ${tax.name}`,
      debitAmount: isInput ? amount : 0,
      creditAmount: isInput ? 0 : amount,
      vatCodeId: tax.id,
      vatAmount: amount,
      supplierName: taxPanelForm.supplierName,
      supplierTaxId: taxPanelForm.supplierTaxId,
      invoiceNumber: taxPanelForm.invoiceNumber,
      invoiceDate: taxPanelForm.invoiceDate,
      taxDetailsJson: extras,
      costCenterId: taxCostCenterId,
      businessPartnerId: taxPartnerId,
      employeeId: taxEmployeeId,
    }
    setFormData(prev => ({
      ...prev,
      lines: editingLineId
        ? [...prev.lines.filter(l => l.id !== editingLineId), baseLine, taxLine]
        : [...prev.lines, baseLine, taxLine],
    }))
    setFormError('')
    setTaxPanelForm(emptyTaxPanelForm())
    closeLineModal()
    toast.success('Base + tax lines added')
  }

  const handleOpenPaymentPanel = () => {
    if (!draftLine) return
    if (paymentPanelOpen) {
      setPaymentPanelOpen(false)
      setPaymentError('')
      return
    }
    if (!isArApAccount(draftLine.accountCode)) {
      setArApGuardOpen(true)
      return
    }
    openPaymentPanel()
  }

  const openPaymentPanel = () => {
    if (!draftLine) return
    if (!draftLine.businessPartnerId) {
      setPaymentError('Select a partner first — required to link invoices')
      return
    }
    if (draftLine.debitAmount <= 0 && draftLine.creditAmount <= 0) {
      setPaymentError('Enter the payment amount first')
      return
    }
    setPaymentError('')
    setTaxPanelOpen(false)
    setPaymentPanelOpen(true)
    fetchOpenInvoices(draftLine.businessPartnerId)
  }

  const applyPaymentLinks = () => {
    if (!draftLine) return
    const card = draftLine
    const partner = card.businessPartnerId ? partnerMap.get(card.businessPartnerId) : undefined
    const total = card.allocations.reduce((s, a) => s + (a.amount || 0), 0)
    const lineAmount = card.debitAmount || card.creditAmount
    if (!partner || total <= 0) {
      setPaymentError('Select at least one invoice to link')
      return
    }
    if (Math.abs(total - lineAmount) > 0.005) {
      setPaymentError(`Linked invoices total (${total.toFixed(2)}) must equal the payment amount (${lineAmount.toFixed(2)})`)
      return
    }
    const paymentLine: LineFormData = {
      ...card,
      lineType: 'payment',
      generated: true,
      vatCodeId: null,
      vatAmount: 0,
      taxDetailsJson: {},
      supplierName: partner.name,
      supplierTaxId: partner.taxRegistrationNumber || '',
      allocations: card.allocations,
    }
    const lines: LineFormData[] = [paymentLine]

    setFormData(prev => ({
      ...prev,
      lines: editingLineId
        ? [...prev.lines.filter(l => l.id !== editingLineId), ...lines]
        : [...prev.lines, ...lines],
    }))
    setFormError('')
    setPaymentError('')
    closeLineModal()
    toast.success('Payment linked to invoices')
  }

  const handleSave = async () => {
    setSubmitting(true)
    setFormError('')

    if (!formData.description.trim()) {
      setFormError('Description is required')
      setSubmitting(false)
      return
    }
    if (formData.lines.length === 0) {
      setFormError('At least one line item is required')
      setSubmitting(false)
      return
    }
    if (!formTotals.balanced) {
      setFormError(`Entry is not balanced. Debit: ${formTotals.debit}, Credit: ${formTotals.credit}`)
      setSubmitting(false)
      return
    }
    const emptyLine = formData.lines.find(l => !l.accountCode)
    if (emptyLine) {
      setFormError('Every line must have an account selected')
      setSubmitting(false)
      return
    }

    try {
      const body = {
        entryDate: formData.entryDate,
        description: formData.description.trim(),
        referenceNumber: formData.referenceNumber.trim(),
        entryCategoryId: formData.entryCategoryId,
        lines: formData.lines.map(l => ({
          accountCode: l.accountCode,
          description: l.description || formData.description.trim(),
          debitAmount: Math.round(l.debitAmount * 100),
          creditAmount: Math.round(l.creditAmount * 100),
          lineType: deriveLineType(l),
          costCenterId: l.costCenterId,
          businessPartnerId: l.businessPartnerId,
          employeeId: l.employeeId,
          vatCodeId: l.vatCodeId,
          vatAmount: Math.round(l.vatAmount * 100),
          supplierName: l.supplierName || null,
          supplierTaxId: l.supplierTaxId || null,
          invoiceNumber: l.invoiceNumber || null,
          invoiceDate: l.invoiceDate || null,
          taxDetailsJson: Object.keys(l.taxDetailsJson || {}).length > 0 ? JSON.stringify(l.taxDetailsJson) : null,
          allocations: l.allocations.map(a => ({
            invoiceId: a.invoiceId,
            amount: Math.round(a.amount * 100),
            notes: a.notes || '',
          })),
        })),
      }

      if (editingEntry) {
        const res = await fetch(`/api/entries/${editingEntry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, version: editingEntry.version }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to update entry')
        }
      } else {
        const res = await fetch('/api/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to create entry')
        }
      }

      closeForm()
      await fetchEntries()
      toast.success(editingEntry ? `Entry "${formData.description}" updated` : `Entry "${formData.description}" created`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setFormError(message)
      toast.error(message || 'Failed to save entry')
    } finally {
      setSubmitting(false)
    }
  }

  const openViewDetail = async (entry: Entry) => {
    setViewEntry(entry)
    setViewLoading(true)
    try {
      const res = await fetch(`/api/entries/${entry.id}`)
      if (res.ok) {
        const json = await res.json()
        if (json.success) setViewLines(json.data.lines || [])
      } else {
        setViewLines([])
      }
    } catch (err) {
      console.error('Failed to fetch entry detail:', err)
      setViewLines([])
    } finally {
      setViewLoading(false)
    }
  }

  const handlePost = async () => {
    if (!postTarget) return
    setPosting(true)
    try {
      const res = await fetch(`/api/entries/${postTarget.id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'post' }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to post entry')
      }
      setPostTarget(null)
      await fetchEntries()
      toast.success(`Entry ${postTarget.entryNumber} posted`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to post entry'
      toast.error(message)
    } finally {
      setPosting(false)
    }
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    try {
      const res = await fetch(`/api/entries/${cancelTarget.id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to cancel entry')
      }
      setCancelTarget(null)
      await fetchEntries()
      toast.success(`Entry ${cancelTarget.entryNumber} cancelled`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to cancel entry'
      toast.error(message)
    }
  }

  const lineEditorAccount = draftLine?.accountCode ? accountMap.get(draftLine.accountCode) : undefined
  const lineEditorLinkType = lineEditorAccount?.linkType ?? (lineEditorAccount?.costCenterId ? 'cost_center' : null)
  const showLineDimension = !!draftLine?.accountCode && (!!lineEditorLinkType || isArApAccount(draftLine.accountCode))
  const linkedCostCenter = draftLine?.accountCode ? linkedCostCenterForAccount(draftLine.accountCode) : undefined
  const currentCostCenterOptions = draftLine?.accountCode ? costCenterOptionsForAccount(draftLine.accountCode) : []
  const currentPartnerOptions = draftLine?.accountCode ? partnerOptionsForRole(partnerRoleForAccount(draftLine.accountCode)) : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Journal Entries</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Record and manage journal entries with balanced debit/credit lines.
          </p>
        </div>
        <button onClick={openAddForm}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> New Entry
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Entries', value: filtered.length.toString(), color: 'text-gray-900 dark:text-white' },
          { label: 'Total Debit', value: formatCurrency(totalDebit), color: 'text-brand-500' },
          { label: 'Total Credit', value: formatCurrency(totalCredit), color: 'text-amber-500' },
          {
            label: 'Balance',
            value: isBalanced ? 'Balanced' : `$${Math.abs(totalDebit - totalCredit) / 100}`,
            color: isBalanced ? 'text-green-500' : 'text-red-500',
          },
        ].map(s => (
          <StatCard key={s.label} label={s.label} value={s.value} color={s.color} />
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-2.5">
        {statusFilters.map(f => (
          <button key={f} onClick={() => setFilterAndResetPage(setStatusFilter, f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              statusFilter === f
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}>
            {f === 'all' ? 'All' : f}
          </button>
        ))}
        <div className="flex items-center gap-1.5">
          <select value={categoryFilter} onChange={e => setFilterAndResetPage(setCategoryFilter, e.target.value)}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
            <option value="all">All categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-0" />
        <ClearFiltersButton
          compact
          filters={{
            status: statusFilter !== 'all',
            category: categoryFilter !== 'all',
            search: searchQuery !== '',
          }}
          onClear={() => {
            setFilterAndResetPage(setStatusFilter, 'all')
            setFilterAndResetPage(setCategoryFilter, 'all')
            setFilterAndResetPage(setSearchQuery, '')
          }}
        />
        <SearchInput value={searchQuery} onChange={v => setFilterAndResetPage(setSearchQuery, v)} placeholder="Search entries..." className="max-w-xs w-full" compact />
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <EmptyState icon={<Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />} title="Loading entries..." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Entry #</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Category</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Debit</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Credit</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        compact
                        icon={<FileText className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />}
                        title={searchQuery || statusFilter !== 'all' || categoryFilter !== 'all' ? 'No entries match your filters' : 'No journal entries yet'}
                        action={!searchQuery && statusFilter === 'all' && categoryFilter === 'all' ? (
                          <button onClick={openAddForm} className="mt-2 text-sm font-medium text-brand-500 hover:text-brand-600">
                            <Plus className="w-4 h-4 inline" /> Create your first entry
                          </button>
                        ) : undefined}
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map(entry => (
                    <Fragment key={entry.id}>
                      <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="py-3 px-4 text-sm font-mono font-medium text-brand-600 dark:text-brand-400">
                          {entry.entryNumber}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">{entry.entryDate}</td>
                        <td className="py-3 px-4">
                          {entry.categoryId && categoryMap.has(entry.categoryId) ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                              {categoryMap.get(entry.categoryId)!.name}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-900 dark:text-white max-w-[200px] truncate">
                          {entry.description}
                        </td>
                        <td className="py-3 px-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                          {formatCurrency(entry.totalDebit)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                          {formatCurrency(entry.totalCredit)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <StatusBadge label={entry.status.charAt(0).toUpperCase() + entry.status.slice(1)} color={statusStyles[entry.status]} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openViewDetail(entry)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                              title="View detail"><Eye className="w-3.5 h-3.5" /></button>
                            {entry.status === 'draft' && (
                              <>
                                <button onClick={() => openEditForm(entry)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                                  title="Edit"><Edit3 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setPostTarget(entry)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                                  title="Post"><CheckCircle className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setCancelTarget(entry)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                  title="Cancel"><X className="w-3.5 h-3.5" /></button>
                              </>
                            )}
                            <button onClick={() => toggleExpand(entry.id)}
                              aria-expanded={expandedId === entry.id}
                              aria-label={expandedId === entry.id ? 'Collapse lines' : 'Expand lines'}
                              className={`p-1.5 rounded-lg transition-colors ${
                                expandedId === entry.id
                                  ? 'text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30'
                                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                              }`}
                              title={expandedId === entry.id ? 'Collapse lines' : 'Expand lines'}>
                              {expandedId === entry.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === entry.id && (
                        <>
                          {loadingLines === entry.id ? (
                            <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                              <td colSpan={8} className="py-3 px-4 text-center">
                                <Loader2 className="w-4 h-4 text-brand-500 animate-spin mx-auto" />
                              </td>
                            </tr>
                          ) : (
                            (entryLines[entry.id] ?? []).map(line => {
                              const acct = accountMap.get(line.accountCode)
                              const lineCc = line.costCenterId ? costCenterMap.get(line.costCenterId) : undefined
                              const linePartner = line.businessPartnerId ? partnerMap.get(line.businessPartnerId) : undefined
                              const lt = lineTypeConfig[line.lineType || 'normal']
                              const isTaxLine = line.lineType === 'tax'
                              return (
                                <tr key={line.id} className={isTaxLine ? 'bg-amber-50/40 dark:bg-amber-950/10' : 'bg-gray-50/50 dark:bg-gray-800/30'}>
                                  <td className="py-2 px-4 text-xs text-gray-400">L{line.lineNumber}</td>
                                  <td className="py-2 px-4">
                                    <div className="flex flex-wrap items-center gap-1">
                                      <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${lt.bg} ${lt.text}`}>
                                        {lt.label}
                                      </span>
                                      {lineCc && (
                                        <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                                          CC: {lineCc.code}
                                        </span>
                                      )}
                                      {linePartner && (
                                        <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                                          {linePartner.type === 'vendor' ? 'Supplier' : 'Customer'}: {linePartner.name}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 px-4 text-sm font-mono text-gray-700 dark:text-gray-300">
                                    {line.accountCode}
                                    {acct && <span className="text-xs text-gray-400 ml-1">({acct.name})</span>}
                                  </td>
                                  <td className="py-2 px-4 text-sm text-gray-700 dark:text-gray-300">{line.description}</td>
                                  <td className="py-2 px-4 text-sm text-right text-green-600 dark:text-green-400">
                                    {line.debitAmount > 0 ? formatCurrency(line.debitAmount) : '—'}
                                  </td>
                                  <td className="py-2 px-4 text-sm text-right text-red-600 dark:text-red-400">
                                    {line.creditAmount > 0 ? formatCurrency(line.creditAmount) : '—'}
                                  </td>
                                  <td colSpan={2} />
                                </tr>
                              )
                            })
                          )}
                          {(entryLines[entry.id] ?? []).length === 0 && loadingLines !== entry.id && (
                            <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                              <td colSpan={8} className="py-4 text-center text-sm text-gray-400">No line items</td>
                            </tr>
                          )}
                        </>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </div>

      <EntryFormModal
        isOpen={showForm}
        onClose={closeForm}
        formData={formData}
        setFormData={setFormData}
        editingEntry={editingEntry}
        submitting={submitting}
        formError={formError}
        formTotals={formTotals}
        categoryOptions={categoryOptions}
        categoryMap={categoryMap}
        accountMap={accountMap}
        onAddLine={addLine}
        onEditLine={editLine}
        onRemoveLine={removeLine}
        onSave={handleSave}
      />

      <LineEditorModal
        isOpen={lineModalOpen}
        onClose={closeLineModal}
        draftLine={draftLine}
        editingLineId={editingLineId}
        formDataLines={formData.lines}
        lineEditorAccount={lineEditorAccount}
        lineEditorLinkType={lineEditorLinkType}
        showLineDimension={showLineDimension}
        taxPanelOpen={taxPanelOpen}
        paymentPanelOpen={paymentPanelOpen}
        arApGuardOpen={arApGuardOpen}
        taxPanelForm={taxPanelForm}
        paymentError={paymentError}
        loadingInvoices={loadingInvoices}
        openInvoices={openInvoices}
        accountMap={accountMap}
        costCenterMap={costCenterMap}
        partnerMap={partnerMap}
        taxCodeMap={taxCodeMap}
        postingProfiles={postingProfiles}
        accountOptions={accountOptions}
        costCenterOptions={currentCostCenterOptions}
        partnerOptionsForRole={currentPartnerOptions}
        employeeOptions={employeeOptions}
        taxGroupOptions={taxGroupOptions}
        taxTypeOptions={taxTypeOptions}
        linkedCostCenter={linkedCostCenter}
        onUpdateDraftLine={updateDraftLine}
        onUpdateDraftAllocation={updateDraftAllocation}
        onRemoveDraftAllocation={removeDraftAllocation}
        onSaveLine={saveLineFromModal}
        onAppendTaxLine={appendTaxLine}
        onApplyPaymentLinks={applyPaymentLinks}
        onTogglePaymentPanel={handleOpenPaymentPanel}
        onOpenPaymentPanel={openPaymentPanel}
        onCancelArApGuard={() => setArApGuardOpen(false)}
        onConfirmArApGuard={() => { setArApGuardOpen(false); openPaymentPanel() }}
        onSetTaxPanelForm={setTaxPanelForm}
        onSetTaxPanelOpen={setTaxPanelOpen}
        onSetPaymentPanelOpen={setPaymentPanelOpen}
        onFetchOpenInvoices={fetchOpenInvoices}
      />

      <ViewEntryModal
        isOpen={!!viewEntry}
        onClose={() => setViewEntry(null)}
        entry={viewEntry}
        lines={viewLines}
        loading={viewLoading}
        accountMap={accountMap}
        categoryMap={categoryMap}
      />

      <EntryConfirmationModals
        postTarget={postTarget}
        posting={posting}
        onPost={handlePost}
        onCancelPost={() => setPostTarget(null)}
        cancelTarget={cancelTarget}
        onCancel={handleCancel}
        onCancelCancelTarget={() => setCancelTarget(null)}
      />
    </div>
  )
}
