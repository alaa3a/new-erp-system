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
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { Pagination } from '@/components/Pagination'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type {
  Entry, EntryLine, Account, EntryCategory,
  EntryLineType, BusinessPartner, CostCenter, TaxCode, PostingProfile, Invoice, Employee,
} from '@/types/erp'

// ─── Constants ─────────────────────────────────────────────────────────

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

// Tax-detail keys that map to typed columns on entry_line (Phase 4); any other
// configured key is captured into the taxDetailsJson JSON column. snake_case
// variants are accepted because Tax Setup auto-generates keys from labels.
type CoreTaxDetailKey = 'supplierName' | 'supplierTaxId' | 'invoiceNumber' | 'invoiceDate'
const CORE_TAX_KEY_VARIANTS: Record<string, CoreTaxDetailKey> = {
  supplierName: 'supplierName', supplier_name: 'supplierName',
  supplierTaxId: 'supplierTaxId', supplier_tax_id: 'supplierTaxId',
  invoiceNumber: 'invoiceNumber', invoice_number: 'invoiceNumber', invoice: 'invoiceNumber',
  invoiceDate: 'invoiceDate', invoice_date: 'invoiceDate',
}
const coreTaxKeyFor = (k: string): CoreTaxDetailKey | null => CORE_TAX_KEY_VARIANTS[k] || null

// ─── Types ──────────────────────────────────────────────────────────────

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
  /** Client-only — true when auto-generated as part of a payment/tax set (visual grouping). Not persisted. */
  generated?: boolean
}

interface EntryFormData {
  entryDate: string
  description: string
  referenceNumber: string
  entryCategoryId: number | null
  lines: LineFormData[]
}

// ─── Helpers ────────────────────────────────────────────────────────────

const emptyForm = (): EntryFormData => ({
  entryDate: new Date().toISOString().split('T')[0],
  description: '',
  referenceNumber: '',
  entryCategoryId: null,
  lines: [],
})

let _lineKey = 0
const nextLineId = () => `line_${++_lineKey}`

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

/** D8 — line type is derived from the line's content, never picked by the user. */
const deriveLineType = (l: LineFormData): EntryLineType =>
  l.vatCodeId ? 'tax' : l.allocations.length > 0 ? 'payment' : 'normal'

// ─── Main Component ─────────────────────────────────────────────────────

export default function EntriesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /><span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading entries...</span></div>}>
      <EntriesPageContent />
    </Suspense>
  )
}

function EntriesPageContent() {
  const toast = useToast()
  // ── Data state ──
  const [entries, setEntries] = useState<Entry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  // 'all' = no filter, otherwise a category id
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const { page, pageSize, setFilterAndResetPage } = usePagination()

  // ── Reference data ──
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<EntryCategory[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [partners, setPartners] = useState<BusinessPartner[]>([])
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([])
  const [postingProfiles, setPostingProfiles] = useState<PostingProfile[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [openInvoices, setOpenInvoices] = useState<Record<number, Invoice[]>>({})
  const [loadingInvoices, setLoadingInvoices] = useState<number | null>(null)

  // ── Expandable rows ──
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [entryLines, setEntryLines] = useState<Record<number, EntryLine[]>>({})
  const [loadingLines, setLoadingLines] = useState<number | null>(null)

  // ── Form state ──
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [formData, setFormData] = useState<EntryFormData>(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // ── Line editor modal state ──
  const [lineModalOpen, setLineModalOpen] = useState(false)
  const [draftLine, setDraftLine] = useState<LineFormData | null>(null)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [taxPanelOpen, setTaxPanelOpen] = useState(false)
  const [paymentPanelOpen, setPaymentPanelOpen] = useState(false)
  const [arApGuardOpen, setArApGuardOpen] = useState(false)
  const [taxPanelForm, setTaxPanelForm] = useState(emptyTaxPanelForm())
  const [paymentError, setPaymentError] = useState('')

  // ── View detail ──
  const [viewEntry, setViewEntry] = useState<Entry | null>(null)
  const [viewLines, setViewLines] = useState<EntryLine[]>([])
  const [viewLoading, setViewLoading] = useState(false)

  // ── Post/Cancel confirmations ──
  const [postTarget, setPostTarget] = useState<Entry | null>(null)
  const [posting, setPosting] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Entry | null>(null)

  // ── Fetch entries ──
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

  // ── Fetch reference data ──
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

  // ── Account options — chart-of-accounts tree (parents bold + non-selectable,
  //    leaves selectable) with the account type appended to each label. ──
  const accountOptions = useMemo(() => buildAccountHierarchyOptions(
    accounts,
    a => `${a.code} — ${a.name} (${a.type})${!a.isActive ? ' (inactive)' : ''}`,
  ), [accounts])

  const accountMap = useMemo(() => {
    const map = new Map<string, Account>()
    for (const a of accounts) map.set(a.code, a)
    return map
  }, [accounts])

  // ── Category options ──
  const categoryOptions = useMemo(() => categories
    .filter(c => c.isActive)
    .map(c => ({ id: c.id, label: `${c.code} — ${c.name}` })),
  [categories])

  const categoryMap = useMemo(() => {
    const map = new Map<number, EntryCategory>()
    for (const c of categories) map.set(c.id, c)
    return map
  }, [categories])

  // ── Line-editor reference maps / options ──
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

  // Active, non-group tax types only — grouped by their tax group for the picker
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

  // Cost-center rule: the account's link seeds a subtree. The dropdown offers
  // ONLY the sub cost centers (every level below the linked root — the root
  // itself is never offered) and parent cost centers are shown but not selectable.
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
    // No sub cost centers exist under the linked root — fall back to the root
    // itself so a value can still be chosen.
    if (out.length === 0) out.push({ id: seed.id, label: `${seed.code} — ${seed.name}`, indent: 0 })
    return out
  }, [costCenters, linkedCostCenterForAccount])

  // AR/AP detection: the account's partner-link filter wins, then the active
  // posting-profile fallback, default both.
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

  // D9 guard — true when the account is an AR/AP control account (partner link or active profile).
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

  // Open invoices for the payment-line card (cached per partner; force skips the cache)
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

  // ── Filtered list ──
  const filtered = useMemo(() => entries.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    if (categoryFilter !== 'all' && e.categoryId !== Number(categoryFilter)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return e.entryNumber.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
    }
    return true
  }), [entries, statusFilter, searchQuery, categoryFilter])

  // ── Summary ──
  const totalDebit = useMemo(() => filtered.reduce((s, e) => s + e.totalDebit, 0), [filtered])
  const totalCredit = useMemo(() => filtered.reduce((s, e) => s + e.totalCredit, 0), [filtered])
  const isBalanced = totalDebit === totalCredit

  // ── Form line totals ──
  const formTotals = useMemo(() => {
    let d = 0, c = 0
    for (const line of formData.lines) {
      d += line.debitAmount
      c += line.creditAmount
    }
    return { debit: d, credit: c, balanced: d === c }
  }, [formData.lines])

  // ── Expand row ──
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

  // ── Form helpers ──
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
    // Open the line-editor modal with a fresh line instead of inserting an inline card.
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
    // D8 — lineType is derived from the line's content, not chosen by the user.
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

  // D8 tax flow — the Add Tax panel generates the BASE line (from the current
  // draft) and the computed TAX line together, appended adjacently as a visible
  // pair so the entry stays balanced and the two lines read as one transaction.
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
    // The base line takes the tax base; its side follows the side chosen on the
    // line (falling back to input → debit / output → credit).
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
      // Keep any existing allocations (e.g. when re-generating on an edited
      // payment line) so the line type is not silently downgraded.
      allocations: draftLine.allocations.map(a => ({ ...a })),
    }
    // Configured fields that match a core column map to it; the rest go to taxDetailsJson.
    const baseAcct = draftLine.accountCode ? accountMap.get(draftLine.accountCode) : undefined
    const taxAccount = tax.accountCode ? accountMap.get(tax.accountCode) : undefined
    // Only carry the base line's dimension to the tax line when the tax account
    // is unlinked, or when it is linked to the SAME dimension root — otherwise
    // server-side subtree/filter validation would reject the carried value.
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

  // D9 guard — warns before linking invoices on a non-AR/AP account.
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

  // Validates the line prerequisites (account → partner → amount) BEFORE the
  // invoices panel opens — missing fields surface as a message, not a broken panel.
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

  // Link & Finish — the ORIGINAL line becomes the payment line with the invoice
  // allocations attached to it. No duplicate payment line and no cash line are
  // generated — the user adds the cash/bank line themselves.
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

    // The payment line IS the line the user built — allocations are attached to it.
    // Tax fields are explicitly cleared so deriveLineType can never misclassify it.
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

    // Validate each line has an account
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
    } catch (err: any) {
      setFormError(err?.message || 'An error occurred')
      toast.error(err?.message || 'Failed to save entry')
    } finally {
      setSubmitting(false)
    }
  }

  // ── View entry detail ──
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

  // ── Post entry ──
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
    } catch (err: any) {
      toast.error(err?.message || 'Failed to post entry')
    } finally {
      setPosting(false)
    }
  }

  // ── Cancel entry ──
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
    } catch (err: any) {
      toast.error(err?.message || 'Failed to cancel entry')
    }
  }

  // ── Line editor: does the selected account need its linked dimension picker? ──
  const lineEditorAccount = draftLine?.accountCode ? accountMap.get(draftLine.accountCode) : undefined
  const lineEditorLinkType = lineEditorAccount?.linkType ?? (lineEditorAccount?.costCenterId ? 'cost_center' : null)
  const showLineDimension = !!draftLine?.accountCode && (!!lineEditorLinkType || isArApAccount(draftLine.accountCode))

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Summary cards */}
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

      {/* Filters */}
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

      {/* Entry table */}
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
                      {/* Expanded lines */}
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
                              const lineType = lineTypeConfig[line.lineType || 'normal']
                              const isTaxLine = line.lineType === 'tax'
                              return (
                                <tr key={line.id} className={isTaxLine ? 'bg-amber-50/40 dark:bg-amber-950/10' : 'bg-gray-50/50 dark:bg-gray-800/30'}>
                                  <td className="py-2 px-4 text-xs text-gray-400">L{line.lineNumber}</td>
                                  <td className="py-2 px-4">
                                    <div className="flex flex-wrap items-center gap-1">
                                      <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${lineType.bg} ${lineType.text}`}>
                                        {lineType.label}
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

      {/* ═══════════════════════════════════════════════════════════════════
          CREATE / EDIT ENTRY MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={showForm} onClose={closeForm} className="max-w-7xl p-0" showCloseButton={false}>
        <ModalHeader title={editingEntry ? `Edit Entry ${editingEntry.entryNumber}` : 'New Journal Entry'} onClose={closeForm} />

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* ── Header Fields — one line: Date | Category | Description | Ref ── */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 px-4 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-end">
              {/* 1. Entry Date */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Entry Date *</label>
                <DatePicker value={formData.entryDate} onChange={(v) => setFormData(prev => ({ ...prev, entryDate: v }))} />
              </div>

              {/* 2. Category */}
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

              {/* 3. Description */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Description *</label>
                <input type="text" value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Entry description"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
              </div>

              {/* 4. Reference # */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Reference #</label>
                <input type="text" value={formData.referenceNumber}
                  onChange={e => setFormData(prev => ({ ...prev, referenceNumber: e.target.value }))}
                  placeholder="Optional ref"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
              </div>
            </div>

            {/* Live number preview chip */}
            {formData.entryCategoryId && categoryMap.has(formData.entryCategoryId) && (
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-400 dark:text-gray-500">
                <span>Numbered as</span>
                <span className="px-1.5 py-0.5 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-mono text-gray-600 dark:text-gray-300">
                  JE-{categoryMap.get(formData.entryCategoryId)!.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'GEN'}-NNNNNN
                </span>
              </div>
            )}
          </div>

          {/* ── Line Items ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Line Items</h4>
              <button type="button" onClick={addLine}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 text-xs font-medium hover:bg-brand-100 dark:hover:bg-brand-950/50 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Line
              </button>
            </div>

            {/* Balance indicator */}
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
                <p className="text-sm text-gray-400 dark:text-gray-500">No line items yet. Click "Add Line" to add debit/credit lines.</p>
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
                              <button type="button" onClick={() => editLine(line.id)}
                                className="p-1 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                                title="Edit line"><Edit3 className="w-3.5 h-3.5" /></button>
                              <button type="button" onClick={() => removeLine(line.id)}
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

          {/* Form error */}
          {formError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-2.5">
              <p className="text-sm text-red-700 dark:text-red-400">{formError}</p>
            </div>
          )}
        </div>

        {/* Form footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <Button variant="outline" size="sm" onClick={closeForm} disabled={submitting}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={submitting || !formTotals.balanced || formData.lines.length === 0}
            className="flex items-center gap-2">
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {editingEntry ? 'Update Entry' : 'Create Entry'}
          </Button>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          LINE EDITOR MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={lineModalOpen && !!draftLine} onClose={closeLineModal} className="max-w-5xl p-0" showCloseButton={false}>
        <ModalHeader title={editingLineId ? `Edit Line #${formData.lines.findIndex(l => l.id === editingLineId) + 1 || ''}` : 'Add Line'} onClose={closeLineModal} />

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {draftLine && (
            <>
              {/* ① Select the account first — its linked dimension picker appears on the same line */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  {/* Row 1 — Account (50%) + linked dimension selector (50%) side by side */}
                  <div className="sm:col-span-6 sm:row-start-1">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Account *</label>
                    <SearchSelect
                      options={accountOptions}
                      value={draftLine.accountCode || ''}
                      onChange={(val) => {
                        updateDraftLine({
                          accountCode: val ? String(val) : '',
                          costCenterId: null,
                          businessPartnerId: null,
                          employeeId: null,
                          allocations: [],
                        })
                        setTaxPanelOpen(false)
                        setPaymentPanelOpen(false)
                        setPaymentError('')
                      }}
                      placeholder="Select account..."
                      searchPlaceholder="Search accounts..."
                      notFoundLabel="No accounts found"
                    />
                    {draftLine.accountCode && (() => {
                      const a = draftLine.accountCode ? accountMap.get(draftLine.accountCode) : undefined
                      const lt = a?.linkType ?? (a?.costCenterId ? 'cost_center' : null)
                      if (!lt && isArApAccount(draftLine.accountCode)) return (
                        <p className="mt-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">Requires partner — AR/AP account</p>
                      )
                      if (!lt) return (
                        <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">No linked dimension</p>
                      )
                      if (lt === 'cost_center') {
                        const cc = linkedCostCenterForAccount(draftLine.accountCode)
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
                      const empName = a?.linkId ? employees.find(e => e.id === a.linkId)?.name : undefined
                      return (
                        <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400">
                          <Link2 className="w-3.5 h-3.5" /> Linked to Employee{empName ? `: ${empName}` : ''}
                        </p>
                      )
                    })()}
                  </div>

                  {/* Row 2 — Description (75%) + Amount (25%) */}
                  <div className="sm:col-span-9 sm:row-start-2">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Description</label>
                    <input type="text" value={draftLine.description}
                      onChange={e => updateDraftLine({ description: e.target.value })}
                      placeholder="Line description"
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
                  </div>
                  <div className="sm:col-span-3 sm:row-start-2">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Amount ($)</label>
                    <div className="flex items-center gap-1.5">
                      <input type="number" value={draftLine.debitAmount || ''} min={0} step="0.01" placeholder="Dr"
                        onChange={e => { const val = Number(e.target.value) || 0; updateDraftLine({ debitAmount: val, ...(val > 0 ? { creditAmount: 0 } : {}) }); setPaymentError('') }}
                        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-2 text-sm text-gray-900 dark:text-white text-right font-mono placeholder:text-gray-400" />
                      <input type="number" value={draftLine.creditAmount || ''} min={0} step="0.01" placeholder="Cr"
                        onChange={e => { const val = Number(e.target.value) || 0; updateDraftLine({ creditAmount: val, ...(val > 0 ? { debitAmount: 0 } : {}) }); setPaymentError('') }}
                        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-2 text-sm text-gray-900 dark:text-white text-right font-mono placeholder:text-gray-400" />
                    </div>
                  </div>
                  {/* ② Linked dimension selector — same line as the account (CC / partner / employee) */}
                  {showLineDimension && (() => {
                    const a = lineEditorAccount
                    const lt = lineEditorLinkType
                    if (lt === 'cost_center') {
                      const opts = costCenterOptionsForAccount(draftLine.accountCode)
                      const seed = linkedCostCenterForAccount(draftLine.accountCode)
                      const currentCc = draftLine.costCenterId ? costCenterMap.get(draftLine.costCenterId) : undefined
                      // The linked root is shown as a non-selectable header for context.
                      // It is omitted when the root itself is the only option (no subs).
                      const rootHeader = seed && opts.length > 0 && !opts.some(o => o.id === seed.id)
                        ? [{ id: seed.id, label: `${seed.code} — ${seed.name} (linked)`, disabled: true, indent: 0 }]
                        : []
                      const currentOption = currentCc && currentCc.id !== seed?.id && !opts.some(o => o.id === currentCc.id)
                        ? [{ id: currentCc.id, label: `${currentCc.code} — ${currentCc.name}`, indent: 0 }]
                        : []
                      const options = [...rootHeader, ...currentOption, ...opts]
                      return (
                        <div className="sm:col-span-6 sm:row-start-1">
                          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Cost Center <span className="text-red-400">*</span></label>
                          <SearchSelect
                            options={options}
                            value={draftLine.costCenterId}
                            onChange={(val) => updateDraftLine({ costCenterId: val ? Number(val) : null })}
                            placeholder="Select cost center..."
                            noneLabel="None"
                            searchPlaceholder="Search cost centers..."
                            notFoundLabel="No cost centers"
                          />
                          <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                            The linked cost center ({seed ? `${seed.code} — ${seed.name}` : '—'}) is shown at the top for context — only its sub cost centers are selectable, parents are not.
                          </p>
                        </div>
                      )
                    }
                    if (lt === 'partner') {
                      const filter = a?.linkPartnerFilter || 'both'
                      const role = filter === 'customer' ? 'ar' : filter === 'vendor' ? 'ap' : 'both'
                      return (
                        <div className="sm:col-span-6 sm:row-start-1">
                          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Partner <span className="text-red-400">*</span> ({filter === 'both' ? 'customers & vendors' : filter + 's'})</label>
                          <SearchSelect
                            options={partnerOptionsForRole(role)}
                            value={draftLine.businessPartnerId}
                            onChange={(val) => {
                              const pid = val ? Number(val) : null
                              // Allocations are partner-specific — reset them when the partner changes.
                              updateDraftLine({ businessPartnerId: pid, allocations: [] })
                              setPaymentError('')
                              if (pid) fetchOpenInvoices(pid)
                            }}
                            placeholder="Select partner..."
                            noneLabel="None"
                            searchPlaceholder="Search partners..."
                            notFoundLabel="No partners"
                          />
                        </div>
                      )
                    }
                    // AR/AP control accounts from the posting profile (not partner-linked)
                    // still need a partner on the line so payments can be linked to invoices.
                    if (isArApAccount(draftLine.accountCode)) {
                      const role = partnerRoleForAccount(draftLine.accountCode)
                      const desc = role === 'ar' ? 'customers' : role === 'ap' ? 'vendors' : 'customers & vendors'
                      return (
                        <div className="sm:col-span-6 sm:row-start-1">
                          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Partner <span className="text-red-400">*</span> ({desc})</label>
                          <SearchSelect
                            options={partnerOptionsForRole(role)}
                            value={draftLine.businessPartnerId}
                            onChange={(val) => {
                              const pid = val ? Number(val) : null
                              // Allocations are partner-specific — reset them when the partner changes.
                              updateDraftLine({ businessPartnerId: pid, allocations: [] })
                              setPaymentError('')
                              if (pid) fetchOpenInvoices(pid)
                            }}
                            placeholder="Select partner..."
                            noneLabel="None"
                            searchPlaceholder="Search partners..."
                            notFoundLabel="No partners"
                          />
                        </div>
                      )
                    }
                    return (
                      <div className="sm:col-span-6 sm:row-start-1">
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Employee <span className="text-red-400">*</span></label>
                        <SearchSelect
                          options={employeeOptions}
                          value={draftLine.employeeId}
                          onChange={(val) => updateDraftLine({ employeeId: val ? Number(val) : null })}
                          placeholder="Select employee..."
                          noneLabel="None"
                          searchPlaceholder="Search employees..."
                          notFoundLabel="No employees"
                        />
                      </div>
                    )
                  })()}
                </div>

                {/* Tax-detail fields — rendered only from the tax type's configured fields (editing) */}
                {draftLine.lineType === 'tax' && (() => {
                  const tax = draftLine.vatCodeId ? taxCodeMap.get(draftLine.vatCodeId) : undefined
                  const cfg = tax?.detailsConfig || []
                  const coreFieldsWithData: { key: CoreTaxDetailKey; label: string }[] = []
                  if (draftLine.supplierName) coreFieldsWithData.push({ key: 'supplierName', label: 'Supplier Name' })
                  if (draftLine.supplierTaxId) coreFieldsWithData.push({ key: 'supplierTaxId', label: 'Supplier Tax ID' })
                  if (draftLine.invoiceNumber) coreFieldsWithData.push({ key: 'invoiceNumber', label: 'Invoice #' })
                  if (draftLine.invoiceDate) coreFieldsWithData.push({ key: 'invoiceDate', label: 'Invoice Date' })
                  const uncovered = coreFieldsWithData.filter(cf => !cfg.some(f => coreTaxKeyFor(f.key) === cf.key))
                  return (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/10 p-2 space-y-2">
                      {cfg.length === 0 && (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500">
                          No detail fields configured for this tax type — add them in Settings → Tax Setup.
                        </p>
                      )}
                      {cfg.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">                            {cfg.map(f => {
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
                                      if (coreKey === 'supplierName') updateDraftLine({ supplierName: v })
                                      else if (coreKey === 'supplierTaxId') updateDraftLine({ supplierTaxId: v })
                                      else if (coreKey === 'invoiceNumber') updateDraftLine({ invoiceNumber: v })
                                      else if (coreKey === 'invoiceDate') updateDraftLine({ invoiceDate: v })
                                      else updateDraftLine({ taxDetailsJson: { ...draftLine.taxDetailsJson, [f.key]: v } })
                                    }}
                                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400" />
                                </div>
                              )
                            })}
                        </div>
                      )}
                      {uncovered.length > 0 && (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500">
                          Saved values not covered by the configured fields: {uncovered.map(cf => cf.label).join(' · ')} — keep them in Tax Setup to edit them here.
                        </p>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* ③ Suitable action buttons — appear once an account is chosen */}
              {draftLine.accountCode && (
                <div className="flex items-center gap-2">
                  <button type="button"
                    onClick={handleOpenPaymentPanel}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
                    <Receipt className="w-4 h-4" /> Link Invoices
                  </button>
                  <button type="button"
                    onClick={() => {
                      const next = !taxPanelOpen
                      setTaxPanelOpen(next); setPaymentPanelOpen(false)
                      // Keep the tax base in sync with the line's amount so the
                      // generated base line always matches what the user sees.
                      if (next) {
                        const lineAmount = draftLine.debitAmount || draftLine.creditAmount
                        if (lineAmount > 0) setTaxPanelForm(prev => prev.base === lineAmount ? prev : { ...prev, base: lineAmount })
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

              {/* Tax panel — group → type → base → details → append the computed tax line */}
              {taxPanelOpen && draftLine.accountCode && (
                <div className="space-y-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/10 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
                    <div className="lg:col-span-4">
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Tax Group</label>
                      <SearchSelect
                        options={taxGroupOptions}
                        value={taxPanelForm.groupId}
                        onChange={(val) => setTaxPanelForm({ ...taxPanelForm, groupId: val ? Number(val) : null, vatCodeId: null, details: {} })}
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
                        onChange={(val) => setTaxPanelForm({
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
                        onChange={e => setTaxPanelForm({ ...taxPanelForm, base: Number(e.target.value) || 0 })}
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
                        {/* Only the fields the user configured for THIS tax type (Tax Setup → Details fields). */}
                        {tax && cfg.length === 0 && (
                          <p className="text-[11px] text-gray-400 dark:text-gray-500">
                            No detail fields configured for this tax type — add them in Settings → Tax Setup to capture supplier / invoice details.
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
                                      if (coreKey === 'supplierName') setTaxPanelForm({ ...taxPanelForm, supplierName: v })
                                      else if (coreKey === 'supplierTaxId') setTaxPanelForm({ ...taxPanelForm, supplierTaxId: v })
                                      else if (coreKey === 'invoiceNumber') setTaxPanelForm({ ...taxPanelForm, invoiceNumber: v })
                                      else if (coreKey === 'invoiceDate') setTaxPanelForm({ ...taxPanelForm, invoiceDate: v })
                                      else setTaxPanelForm({ ...taxPanelForm, details: { ...taxPanelForm.details, [f.key]: v } })
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
                          <button type="button" onClick={appendTaxLine} disabled={!taxPanelForm.vatCodeId || taxPanelForm.base <= 0}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors">
                            <Plus className="w-4 h-4" /> Add Tax Lines
                          </button>
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}

              {/* Payment panel — partner → invoices → allocations → link */}
              {paymentPanelOpen && draftLine.accountCode && (() => {
                const allocTotal = draftLine.allocations.reduce((s, a) => s + (a.amount || 0), 0)
                const lineAmount = draftLine.debitAmount || draftLine.creditAmount
                const invoices = draftLine.businessPartnerId ? (openInvoices[draftLine.businessPartnerId] || []) : []
                const invoiceBalanceSum = invoices.reduce((s, inv) => s + (inv.totalAmount - inv.paidAmount) / 100, 0)
                const overAllocated = allocTotal > invoiceBalanceSum + 0.005
                const diff = Math.round((allocTotal - lineAmount) * 100) / 100
                const matched = Math.abs(diff) <= 0.005 && allocTotal > 0
                const partner = draftLine.businessPartnerId ? partnerMap.get(draftLine.businessPartnerId) : undefined
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
                          <button type="button" onClick={() => fetchOpenInvoices(draftLine.businessPartnerId!, true)}
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
                                          onChange={e => e.target.checked ? updateDraftAllocation(inv.id, { amount: remaining }) : removeDraftAllocation(inv.id)}
                                          className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500" />
                                      </td>
                                      <td className="py-2 px-3 font-mono text-gray-700 dark:text-gray-300">{inv.invoiceNumber}</td>
                                      <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{inv.invoiceDate}</td>
                                      <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-300">{formatCurrency(inv.totalAmount)}</td>
                                      <td className="py-2 px-3 text-right text-gray-500 dark:text-gray-400">{paidBefore > 0 ? formatCurrency(Math.round(paidBefore * 100)) : '—'}</td>
                                      <td className="py-2 px-3 text-right font-medium text-gray-700 dark:text-gray-300">{formatCurrency(inv.totalAmount - inv.paidAmount)}</td>
                                      <td className="py-2 px-3">
                                        <input type="number" min={0} step="0.01" value={alloc?.amount ?? ''}
                                          onChange={e => updateDraftAllocation(inv.id, { amount: Number(e.target.value) || 0 })}
                                          placeholder="0.00"
                                          className="w-28 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-right font-mono text-gray-900 dark:text-white" />
                                      </td>
                                      <td className="py-2 px-3">
                                        <input type="text" value={alloc?.notes ?? ''}
                                          onChange={e => updateDraftAllocation(inv.id, { notes: e.target.value })}
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
                            onClick={applyPaymentLinks}
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

              {/* AR/AP guard warning (D9) — non-blocking confirmation */}
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
                    <Button variant="outline" size="sm" onClick={() => setArApGuardOpen(false)}>Cancel</Button>
                    <Button size="sm" onClick={() => { setArApGuardOpen(false); openPaymentPanel() }}>Continue</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Line modal footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <Button variant="outline" size="sm" onClick={closeLineModal}>Cancel</Button>
          <Button size="sm" onClick={saveLineFromModal} disabled={!draftLine || !draftLine.accountCode}
            className="flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" />
            {editingLineId ? 'Save Line' : 'Add Line'}
          </Button>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          VIEW ENTRY DETAIL MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={!!viewEntry} onClose={() => setViewEntry(null)} className="max-w-3xl p-0" showCloseButton={false}>
        <ModalHeader title={`Entry ${viewEntry?.entryNumber}`} onClose={() => setViewEntry(null)}>
          {viewEntry && (
            <StatusBadge label={viewEntry.status.charAt(0).toUpperCase() + viewEntry.status.slice(1)} color={statusStyles[viewEntry.status]} size="sm" className="mt-1" />
          )}
        </ModalHeader>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {viewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
              <span className="ml-2 text-sm text-gray-400">Loading...</span>
            </div>
          ) : viewEntry ? (
            <div className="space-y-6">
              {/* Header info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Date</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{viewEntry.entryDate}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Reference</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{viewEntry.referenceNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Posted By</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{viewEntry.postedBy || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Category</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
                    {viewEntry.categoryId && categoryMap.has(viewEntry.categoryId)
                      ? categoryMap.get(viewEntry.categoryId)!.name
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Description */}
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Description</p>
                <p className="text-sm text-gray-900 dark:text-white">{viewEntry.description}</p>
              </div>

              {/* Lines */}
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
                      {viewLines.length === 0 ? (
                        <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-400">No line items</td></tr>
                      ) : (
                        viewLines.map(line => {
                          const acct = accountMap.get(line.accountCode)
                          const lineType = lineTypeConfig[line.lineType || 'normal']
                          const isTaxLine = line.lineType === 'tax'
                          return (
                            <tr key={line.id} className={`${isTaxLine ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''} hover:bg-gray-50 dark:hover:bg-gray-800/30`}>
                              <td className="py-2 px-3 text-xs text-gray-400">{line.lineNumber}</td>
                              <td className="py-2 px-3">
                                <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${lineType.bg} ${lineType.text}`}>
                                  {lineType.label}
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
                          ${(viewLines.reduce((s, l) => s + l.debitAmount, 0) / 100).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-xs font-semibold text-red-600 dark:text-red-400 text-right">
                          ${(viewLines.reduce((s, l) => s + l.creditAmount, 0) / 100).toFixed(2)}
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
          <Button variant="outline" size="sm" onClick={() => setViewEntry(null)}>Close</Button>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          POST CONFIRMATION
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={!!postTarget} onClose={() => setPostTarget(null)} className="max-w-md p-6">
        {postTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-green-50 dark:bg-green-950/50 p-2.5">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Post Entry</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{postTarget.entryNumber}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to post <strong>{postTarget.entryNumber}</strong>?
              This will lock the entry and update account balances. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setPostTarget(null)}>Cancel</Button>
              <Button size="sm" onClick={handlePost} disabled={posting}
                className="flex items-center gap-2 !bg-green-600 hover:!bg-green-700">
                {posting && <Loader2 className="w-4 h-4 animate-spin" />}
                {posting ? 'Posting...' : 'Post Entry'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          CANCEL CONFIRMATION
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} className="max-w-md p-6">
        {cancelTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-50 dark:bg-red-950/50 p-2.5">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Cancel Entry</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{cancelTarget.entryNumber}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to cancel <strong>{cancelTarget.entryNumber}</strong>?
              This will mark the entry as cancelled and it won't affect financial reports.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setCancelTarget(null)}>Cancel</Button>
              <Button size="sm" onClick={handleCancel} className="!bg-red-500 hover:!bg-red-600">Cancel Entry</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

