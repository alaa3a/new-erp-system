'use client'
import { SearchInput, StatusBadge, EmptyState } from '@/components/ui'

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import {
  Plus, Edit3, Trash2, AlertTriangle, Loader2, Percent, Calendar, ChevronRight, ChevronDown, FolderPlus, Lock, MoreVertical,
} from 'lucide-react'
import DatePicker from '@/components/form/input/DatePicker'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { useToast } from '@/components/ui/toast/ToastProvider'
import SearchSelect from '@/components/form/SearchSelect'
import { buildAccountHierarchyOptions } from '@/lib/accountTree'
import type { TaxCode, TaxType, FilingPeriod, Account, TaxDetailFieldDef, TaxDetailInputType } from '@/types/erp'

const filingPeriods: FilingPeriod[] = ['monthly', 'quarterly', 'annually']

const taxTypeConfig: Record<TaxType, { label: string; bg: string; text: string }> = {
  output: { label: 'Out', bg: 'bg-blue-50 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-400' },
  input: { label: 'In', bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-400' },
}

const filingPeriodLabel: Record<FilingPeriod, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
}

// Standard supplier/invoice detail fields — quick-add so their keys map to the
// typed entry_line columns (supplierName / supplierTaxId / invoiceNumber /
// invoiceDate) and stay reportable in the tax summary.
const DETAIL_FIELD_PRESETS: TaxDetailFieldDef[] = [
  { key: 'supplierName', label: 'Supplier Name', inputType: 'text' },
  { key: 'supplierTaxId', label: 'Supplier Tax ID', inputType: 'text' },
  { key: 'invoiceNumber', label: 'Invoice #', inputType: 'text' },
  { key: 'invoiceDate', label: 'Invoice Date', inputType: 'date' },
]

interface TaxCodeFormData {
  code: string
  name: string
  isGroup: boolean
  filingPeriod: FilingPeriod
  rate: number
  type: TaxType
  parentId: number | null
  accountCode: string
  isActive: boolean
  isSystemCode: boolean
  effectiveFrom: string
  effectiveTo: string
  detailsConfig: TaxDetailFieldDef[]
}

const todayStr = () => new Date().toISOString().split('T')[0]

const emptyForm = (): TaxCodeFormData => ({
  code: '',
  name: '',
  isGroup: false,
  filingPeriod: 'monthly',
  rate: 0,
  type: 'output',
  parentId: null,
  accountCode: '',
  isActive: true,
  isSystemCode: false,
  effectiveFrom: todayStr(),
  effectiveTo: '',
  detailsConfig: [],
})

export default function TaxSetupPage() {
  const toast = useToast()
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const menuBtnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formMode, setFormMode] = useState<'group' | 'type'>('type')
  const [editingCode, setEditingCode] = useState<TaxCode | null>(null)
  const [formData, setFormData] = useState<TaxCodeFormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formTouched, setFormTouched] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TaxCode | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const fetchTaxCodes = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/tax-codes')
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Request failed')
      setTaxCodes(json.data)
    } catch {
      setError('Failed to load tax codes.')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts')
      if (res.ok) {
        const json = await res.json()
        if (!json.success) throw new Error(json.error || 'Request failed')
        setAccounts(json.data)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchTaxCodes()
    fetchAccounts()
  }, [fetchTaxCodes, fetchAccounts])

  // Flattened chart-of-accounts tree for the Posting Account selector —
  // parent accounts bold + non-selectable, leaf accounts selectable.
  const accountHierarchyOptions = useMemo(() => buildAccountHierarchyOptions(accounts), [accounts])

  // Only active (non-soft-deleted) rows are shown; search keeps ancestors visible
  // so the tree stays navigable at any depth
  const filteredCodes = useMemo(() => {
    let list = taxCodes.filter(t => t.isActive)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const directMatches = new Set(
        list.filter(t => t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)).map(t => t.id)
      )
      // Sub-groups no longer exist — a type's only ancestor is its group
      const addParentGroup = (childId: number) => {
        const t = list.find(x => x.id === childId)
        if (t?.parentId) directMatches.add(t.parentId)
      }
      directMatches.forEach(id => addParentGroup(id))
      list = list.filter(t => directMatches.has(t.id))
    }
    return list
  }, [taxCodes, searchQuery])

  const topGroups = filteredCodes.filter(t => t.isGroup && !t.parentId)
  const ungrouped = filteredCodes.filter(t => !t.isGroup && !t.parentId)
  const getChildren = (parentId: number) => filteredCodes.filter(t => t.parentId === parentId)
  const hasChildren = (id: number) => taxCodes.some(t => t.parentId === id)
  const toggleExpand = (id: number) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // --- Position the group action menu next to its button (like CoA) ---
  const positionMenu = useCallback(() => {
    const btn = menuBtnRef.current
    if (!btn || !btn.isConnected) return
    const rect = btn.getBoundingClientRect()
    const menuW = menuRef.current?.offsetWidth || 176
    const menuH = menuRef.current?.offsetHeight || 244
    let top = rect.bottom + 4
    let left = rect.right - menuW
    if (top + menuH > window.innerHeight) {
      top = Math.max(4, rect.top - menuH - 4)
    }
    if (left < 4) left = 4
    if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 4
    setMenuStyle({ position: 'fixed', top: `${top}px`, left: `${left}px`, zIndex: 50 })
  }, [])

  const openMenu = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    menuBtnRef.current = e.currentTarget as HTMLButtonElement
    setMenuOpenId(prev => (prev === id ? null : id))
    positionMenu()
  }

  // Re-position the open menu whenever rows shift (expand/collapse) so it
  // never lags behind at the old row position.
  useLayoutEffect(() => {
    if (menuOpenId !== null) positionMenu()
  }, [menuOpenId, expanded, positionMenu])

  // Keep the menu glued to its button while scrolling or resizing.
  useEffect(() => {
    if (menuOpenId === null) return
    let raf = 0
    const handle = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(positionMenu)
    }
    window.addEventListener('scroll', handle, true)
    window.addEventListener('resize', handle)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', handle, true)
      window.removeEventListener('resize', handle)
    }
  }, [menuOpenId, positionMenu])

  // Auto-expand ancestors when searching
  useEffect(() => {
    if (!searchQuery.trim()) return
    const q = searchQuery.toLowerCase()
    const matchingIds = new Set(taxCodes.filter(t => t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)).map(t => t.id))
    if (matchingIds.size === 0) return
    // Sub-groups no longer exist — a type's only ancestor is its group
    const ancestors = new Set<number>()
    matchingIds.forEach(id => {
      const t = taxCodes.find(x => x.id === id)
      if (t?.parentId) ancestors.add(t.parentId)
    })
    setExpanded(prev => {
      const next = new Set(prev)
      ancestors.forEach(id => next.add(id))
      return next
    })
  }, [searchQuery, taxCodes])

  const openAddGroup = () => {
    setEditingCode(null)
    setFormMode('group')
    setFormData({ ...emptyForm(), isGroup: true })
    setFormTouched(false)
    setFormError('')
    setShowForm(true)
  }

  // Inline add — parent is locked/read-only (like Chart of Accounts)
  const openAddChild = (parent: TaxCode) => {
    setEditingCode(null)
    setFormMode('type')
    setFormData({ ...emptyForm(), isGroup: false, parentId: parent.id })
    setFormTouched(false)
    setFormError('')
    setShowForm(true)
  }

  const openEditForm = (code: TaxCode) => {
    setEditingCode(code)
    setFormMode(code.isGroup ? 'group' : 'type')
    setFormData({
      code: code.code,
      name: code.name,
      isGroup: code.isGroup,
      filingPeriod: code.filingPeriod || 'monthly',
      rate: code.rate,
      type: code.type,
      parentId: code.parentId,
      accountCode: code.accountCode,
      isActive: code.isActive,
      isSystemCode: code.isSystemCode,
      effectiveFrom: code.effectiveFrom.split('T')[0],
      effectiveTo: code.effectiveTo ? code.effectiveTo.split('T')[0] : '',
      detailsConfig: code.detailsConfig || [],
    })
    setFormTouched(false)
    setFormError('')
    setShowForm(true)
  }

  // Rate is locked once a tax type is used
  const rateLocked = !!editingCode && !editingCode.isGroup && !!editingCode.inUse

  // ── Dynamic detail-field builder (Phase 4) ──
  const updateDetailField = (index: number, patch: Partial<TaxDetailFieldDef>) => {
    setFormData(prev => {
      const next = [...prev.detailsConfig]
      next[index] = { ...next[index], ...patch }
      return { ...prev, detailsConfig: next }
    })
  }
  const removeDetailField = (index: number) => {
    setFormData(prev => ({ ...prev, detailsConfig: prev.detailsConfig.filter((_, i) => i !== index) }))
  }
  const addDetailField = () => {
    setFormData(prev => ({
      ...prev,
      detailsConfig: [...prev.detailsConfig, { key: '', label: '', inputType: 'text' }],
    }))
  }
  // Standard supplier/invoice fields — quick-add so their keys map to the typed
  // entry_line columns (supplierName / supplierTaxId / invoiceNumber / invoiceDate)
  // and stay reportable in the tax summary instead of landing in taxDetailsJson.
  const addPresetDetailField = (preset: TaxDetailFieldDef) => {
    setFormData(prev => {
      if (prev.detailsConfig.some(d => d.key === preset.key)) return prev
      return { ...prev, detailsConfig: [...prev.detailsConfig, { ...preset }] }
    })
  }

  const handleSave = async () => {
    setFormTouched(true)
    if (!formData.code.trim() || !formData.name.trim()) {
      setFormError('Code and name are required')
      return
    }
    if (!formData.isGroup && !formData.parentId) {
      setFormError('Tax types must belong to a tax group')
      return
    }
    if (!formData.isGroup && !formData.accountCode.trim()) {
      setFormError('Posting account is required for tax types')
      return
    }
    if (!formData.isGroup && (formData.rate < 0 || formData.rate > 100)) {
      setFormError('Rate must be between 0 and 100')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const url = editingCode ? `/api/tax-codes/${editingCode.id}` : '/api/tax-codes'
      const method = editingCode ? 'PUT' : 'POST'
      const body: any = {
        ...formData,
        rate: formData.isGroup ? 0 : (rateLocked ? editingCode!.rate : Number(formData.rate)),
        parentId: formData.parentId,
        accountCode: formData.isGroup ? '' : formData.accountCode,
        effectiveTo: formData.effectiveTo || null,
        detailsConfig: formData.isGroup
          ? []
          : formData.detailsConfig
            .filter(d => d.label.trim())
            .map((d, i) => ({ ...d, key: d.key || `field_${i + 1}`, label: d.label.trim() })),
      }
      if (editingCode) body.version = editingCode.version
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      setShowForm(false)
      fetchTaxCodes()
      toast.success(editingCode ? `Tax ${formData.isGroup ? 'group' : 'type'} "${formData.name}" updated` : `Tax ${formData.isGroup ? 'group' : 'type'} "${formData.name}" created`)
    } catch (err: any) {
      setFormError(err.message)
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const restoreTaxCode = async (code: TaxCode) => {
    try {
      const res = await fetch(`/api/tax-codes/${code.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Restore failed')
      }
      fetchTaxCodes()
      toast.success(`Tax "${code.name}" restored`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore')
      fetchTaxCodes()
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const deleted = deleteTarget
    try {
      const res = await fetch(`/api/tax-codes/${deleted.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Delete failed')
      }
      setDeleteTarget(null)
      // Delete is a soft delete (isActive=0) — remove the row locally so it disappears
      // immediately instead of waiting for a refetch. Undo restores via restoreTaxCode → refetch.
      setTaxCodes(prev => prev.filter(t => t.id !== deleted.id))
      toast.success(`Tax "${deleted.name}" deleted`, {
        action: { label: 'Undo', onClick: () => restoreTaxCode(deleted) },
        duration: 8000,
      })
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message || 'Failed to delete')
    }
  }

  const renderGroupNode = (group: TaxCode, depth: number): React.ReactNode[] => {
    const isOpen = expanded.has(group.id)
    const children = getChildren(group.id)
    const indent = Math.min(depth, 10) * 20

    const row = (
      <tr key={group.id} className="bg-gray-50/70 dark:bg-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2" style={{ paddingLeft: `${indent}px` }}>
            {children.length > 0 ? (
              <button onClick={() => toggleExpand(group.id)} className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : <span className="w-4 shrink-0" />}
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-16 shrink-0">{group.code}</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{group.name}</span>
            {group.isSystemCode && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">System</span>
            )}
          </div>
        </td>
        <td className="py-2.5 px-3">
          <span className="inline-flex text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400">Group</span>
        </td>
        <td className="py-2.5 px-3">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400">
            {filingPeriodLabel[group.filingPeriod || 'monthly']}
          </span>
        </td>
        <td className="py-2.5 px-3 text-xs text-gray-400 italic">—</td>
        <td className="py-2.5 px-3 text-xs text-gray-400 italic">—</td>
        <td className="py-2.5 px-3 text-center">
          <span className={`inline-flex text-xs font-medium px-2 py-1 rounded-full ${
            group.isActive ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400' : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
          }`}>
            {group.isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="py-2.5 px-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <button onClick={(e) => openMenu(e, group.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="More actions">
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    )

    if (!isOpen || children.length === 0) return [row]
    // Sub-groups are no longer supported — a group's children are always tax types
    return [row, ...children.map(child => renderTypeRow(child, depth + 1))]
  }

  const renderTypeRow = (code: TaxCode, depth: number): React.ReactNode => {
    const isExpired = code.effectiveTo && new Date(code.effectiveTo) < new Date()
    const indent = Math.min(depth, 10) * 20
    return (
      <tr key={code.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${isExpired ? 'opacity-60' : ''}`}>
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2" style={{ paddingLeft: `${indent}px` }}>
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-16 shrink-0">{code.code}</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">{code.name}</span>
            {code.isSystemCode && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">System</span>
            )}
          </div>
        </td>
        <td className="py-2.5 px-3">
          <StatusBadge label={taxTypeConfig[code.type].label} color={`${taxTypeConfig[code.type].bg} ${taxTypeConfig[code.type].text}`} />
        </td>
        <td className="py-2.5 px-3">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{code.rate}%</span>
        </td>
        <td className="py-2.5 px-3">
          {code.accountCode ? (
            <span className="text-xs font-mono text-gray-600 dark:text-gray-400">
              {code.accountCode}
              <span className="text-gray-400 dark:text-gray-500 ml-1">
                · {accounts.find(a => a.code === code.accountCode)?.name || ''}
              </span>
            </span>
          ) : (
            <span className="text-xs text-gray-300 dark:text-gray-600 italic">Not set</span>
          )}
        </td>
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
            <Calendar className="w-3 h-3" />
            <span>{code.effectiveFrom.split('T')[0]}</span>
            {code.effectiveTo && <span> → {code.effectiveTo.split('T')[0]}</span>}
            {!code.effectiveTo && <span className="text-green-500 dark:text-green-400"> (ongoing)</span>}
          </div>
        </td>
        <td className="py-2.5 px-3 text-center">
          <span className={`inline-flex text-xs font-medium px-2 py-1 rounded-full ${
            code.isActive && !isExpired ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400' : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
          }`}>
            {code.isActive && !isExpired ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="py-2.5 px-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <button onClick={(e) => openMenu(e, code.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="More actions">
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  const renderUngrouped = (): React.ReactNode[] => {
    if (ungrouped.length === 0) return []
    return [
      <tr key="ungrouped-header">
        <td colSpan={7} className="py-2.5 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900">
          Ungrouped
        </td>
      </tr>,
      ...ungrouped.map(code => renderTypeRow(code, 0)),
    ]
  }

  const parentName = formData.parentId
    ? taxCodes.find(t => t.id === formData.parentId)
    : null

  const modalTitle = editingCode
    ? (formMode === 'group' ? 'Edit Tax Group' : 'Edit Tax Type')
    : (formMode === 'group' ? 'Add Tax Group' : 'Add Tax Type')

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Tax Codes</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Tax groups define filing periods; tax types under them own the posting account for VAT. Add types inline from a group row.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openAddGroup} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Add Group
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-2.5">
        <div className="flex-1 min-w-0" />
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search by code or name..." className="max-w-xs w-full" compact />
      </div>

      {/* Table */}
      {loading ? (
        <EmptyState icon={<Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />} title="Loading tax codes..." />
      ) : error ? (
        <EmptyState icon={<AlertTriangle className="w-10 h-10 text-red-400 mb-3" />} title={<span className="text-red-600 dark:text-red-400">{error}</span>} action={<button onClick={fetchTaxCodes} className="mt-3 text-sm font-medium text-brand-500">Try again</button>} />
      ) : taxCodes.length === 0 ? (
        <EmptyState icon={<Percent className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />} title="No tax codes defined yet" action={<button onClick={openAddGroup} className="mt-2 text-sm font-medium text-brand-500"><FolderPlus className="w-4 h-4 inline" /> Add your first tax group</button>} />
      ) : (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Code / Name</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rate / Period</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Account</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Effective</th>
                  <th className="text-center py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {topGroups.length === 0 && ungrouped.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center">
                      <p className="text-sm text-gray-400 dark:text-gray-500">No active tax codes found.</p>
                    </td>
                  </tr>
                ) : (
                  <>
                    {topGroups.flatMap(group => renderGroupNode(group, 0))}
                    {renderUngrouped()}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- Row actions menu (groups + tax types) --- */}
      {menuOpenId !== null && (() => {
        const row = taxCodes.find(t => t.id === menuOpenId)
        if (!row) return null
        const isGroup = row.isGroup
        const blocked = row.isSystemCode || !!row.inUse || (isGroup && hasChildren(row.id))
        const blockedTitle = row.isSystemCode
          ? `System tax ${isGroup ? 'group' : 'code'} — cannot delete`
          : (isGroup ? 'Has children — cannot delete' : 'In use — cannot delete')
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
            <div ref={menuRef} style={menuStyle} className="w-44 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
              {isGroup && (
                <button onClick={() => { setMenuOpenId(null); openAddChild(row) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add Tax Type
                </button>
              )}
              <button onClick={() => { setMenuOpenId(null); openEditForm(row) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={() => { setMenuOpenId(null); setDeleteTarget(row) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm border-t border-gray-100 dark:border-gray-800 transition-colors ${
                  blocked
                    ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                    : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                }`}
                title={blocked ? blockedTitle : 'Delete'}>
                {blocked ? <AlertTriangle className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                {blocked ? 'Delete blocked' : 'Delete'}
              </button>
            </div>
          </>
        )
      })()}

      {/* --- Add/Edit Modal --- */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} className="max-w-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{modalTitle}</h3>
        <div className="space-y-4">
          {/* Parent group — read-only when adding inline (always a tax type now) */}
          {(!editingCode || editingCode.isGroup) && formData.parentId && parentName && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Parent Group</label>
              <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                {parentName.code} - {parentName.name}
              </div>
            </div>
          )}

          {/* Code + Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Code <span className="text-red-400">*</span>
              </label>
              <input type="text" value={formData.code}
                onChange={e => setFormData({ ...formData, code: e.target.value })}
                placeholder={formMode === 'group' ? 'e.g. VAT' : 'e.g. VAT15'}
                className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${
                  formTouched && !formData.code.trim() ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'
                }`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input type="text" value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder={formMode === 'group' ? 'e.g. Value Added Tax' : 'e.g. Standard VAT 15%'}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
            </div>
          </div>

          {formMode === 'group' ? (
            <>
              {/* Filing Period */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Filing Period</label>
                <select value={formData.filingPeriod}
                  onChange={e => setFormData({ ...formData, filingPeriod: e.target.value as FilingPeriod })}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                  {filingPeriods.map(p => <option key={p} value={p}>{filingPeriodLabel[p]}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              {/* Parent selector — only when editing an existing type (moving between groups) */}
              {editingCode && !editingCode.isGroup && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Parent Group</label>
                  <select value={formData.parentId ?? ''}
                    onChange={e => setFormData({ ...formData, parentId: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                    {taxCodes.filter(t => t.isGroup && t.id !== editingCode.id).map(t => (
                      <option key={t.id} value={t.id}>{t.code} - {t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Type + Rate */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Type</label>
                  <select value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value as TaxType })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                    <option value="input">In</option>
                    <option value="output">Out</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Rate (%)</label>
                  <div className="relative">
                    <input type="number" value={formData.rate} min="0" max="100" step="0.01"
                      onChange={e => setFormData({ ...formData, rate: Number(e.target.value) || 0 })}
                      disabled={rateLocked}
                      placeholder="15"
                      className={`w-full rounded-lg border px-3 py-2 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${
                        rateLocked
                          ? 'bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 border-gray-200 dark:border-gray-700'
                      }`} />
                    {rateLocked ? (
                      <Lock className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                    )}
                  </div>
                  {rateLocked ? (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">Rate is locked because this tax type is in use. Create a new tax type with the new rate.</p>
                  ) : (
                    <p className="text-[11px] text-gray-400 mt-0.5">To change a rate later, create a new tax type with the new rate — the effective period defaults to today.</p>
                  )}
                </div>
              </div>

              {/* Account Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Posting Account <span className="text-red-400">*</span>
                </label>
                <div className={formTouched && !formData.accountCode ? 'rounded-lg ring-2 ring-red-300 dark:ring-red-700' : ''}>
                  <SearchSelect
                    options={accountHierarchyOptions}
                    value={formData.accountCode}
                    onChange={(val) => setFormData({ ...formData, accountCode: val ? String(val) : '' })}
                    placeholder="-- Select account --"
                    noneLabel="-- None --"
                    searchPlaceholder="Search accounts..."
                    notFoundLabel="No accounts found"
                  />
                </div>
              </div>

              {/* Effective Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Effective From</label>
                  <DatePicker value={formData.effectiveFrom} onChange={(v) => setFormData({ ...formData, effectiveFrom: v })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Effective To</label>
                  <DatePicker value={formData.effectiveTo} onChange={(v) => setFormData({ ...formData, effectiveTo: v })} />
                  <p className="text-[11px] text-gray-400 mt-0.5">Leave empty for no expiry</p>
                </div>
              </div>

              {/* Dynamic Detail Fields (Phase 4) — user-built inputs the line editor collects */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Detail Fields</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Optional inputs the line editor shows for this tax type (e.g. Vendor Name, Invoice Number).</p>
                  </div>
                  <button type="button" onClick={addDetailField}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-brand-600 dark:text-brand-400 hover:bg-white dark:hover:bg-gray-800 transition-colors shrink-0">
                    <Plus className="w-3.5 h-3.5" /> Add Field
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Quick add</span>
                  {DETAIL_FIELD_PRESETS.map(preset => {
                    const exists = formData.detailsConfig.some(d => d.key === preset.key)
                    return (
                      <button key={preset.key} type="button" disabled={exists}
                        onClick={() => addPresetDetailField(preset)}
                        title={exists ? 'Already added' : `Add ${preset.label}`}
                        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-brand-200 dark:border-brand-800 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors">
                        <Plus className="w-2.5 h-2.5" /> {preset.label}
                      </button>
                    )
                  })}
                </div>
                {formData.detailsConfig.length === 0 ? (
                  <p className="text-xs text-gray-400">No detail fields yet — the line editor will show no supplier/invoice inputs for this tax type. Use Quick add above for the standard fields.</p>
                ) : (
                  <div className="space-y-2">
                    {formData.detailsConfig.map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="text" value={d.label}
                          onChange={e => updateDetailField(i, {
                            label: e.target.value,
                            key: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
                          })}
                          placeholder="Field label e.g. Vendor Name"
                          className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                        <select value={d.inputType}
                          onChange={e => updateDetailField(i, { inputType: e.target.value as TaxDetailInputType })}
                          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                          <option value="text">Text</option>
                          <option value="date">Date</option>
                          <option value="number">Number</option>
                        </select>
                        <button type="button" onClick={() => removeDetailField(i)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0" title="Remove field">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {formData.detailsConfig.some(d => d.label.trim()) && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {formData.detailsConfig.filter(d => d.label.trim()).map((d, i) => (
                      <span key={i}
                        className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.inputType === 'date' ? 'bg-blue-400' : d.inputType === 'number' ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                        {d.label} · {d.inputType}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Active toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={formData.isActive}
              onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
          </label>

          {editingCode?.isSystemCode && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-3 py-2">
              <p className="text-xs text-amber-600 dark:text-amber-400">This is a system tax {formMode === 'group' ? 'group' : 'code'}. Some fields are restricted.</p>
            </div>
          )}

          {formError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2">
              <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !formData.code.trim() || !formData.name.trim()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : editingCode ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* --- Delete Confirmation Modal --- */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} className="max-w-md p-6">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-2.5 ${
                deleteTarget.isSystemCode || deleteTarget.inUse || hasChildren(deleteTarget.id) ? 'bg-amber-50 dark:bg-amber-950/50' : 'bg-red-50 dark:bg-red-950/50'
              }`}>
                <AlertTriangle className={`w-5 h-5 ${
                  deleteTarget.isSystemCode || deleteTarget.inUse || hasChildren(deleteTarget.id) ? 'text-amber-500' : 'text-red-500'
                }`} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete {deleteTarget.isGroup ? 'Tax Group' : 'Tax Code'}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{deleteTarget.code} - {deleteTarget.name}</p>
              </div>
            </div>
            {deleteTarget.isSystemCode ? (
              <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">This is a system tax {deleteTarget.isGroup ? 'group' : 'code'} and cannot be deleted.</p>
            ) : deleteTarget.inUse ? (
              <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">This tax type is in use (invoices, entries, products, or partners) and cannot be deleted.</p>
            ) : deleteTarget.isGroup && hasChildren(deleteTarget.id) ? (
              <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">This tax group has children. Remove them first before deleting.</p>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">Are you sure you want to delete <strong>{deleteTarget.code}</strong>? This will soft-delete it.</p>
            )}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              {!deleteTarget.isSystemCode && !deleteTarget.inUse && !(deleteTarget.isGroup && hasChildren(deleteTarget.id)) && (
                <Button size="sm" onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Delete</Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
