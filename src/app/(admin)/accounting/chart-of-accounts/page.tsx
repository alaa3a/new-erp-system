'use client'
import { SearchInput } from '@/components/ui'

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Power,
  PowerOff,
  Link2,
  Loader2,
  FolderTree,
  MoreVertical,
  Users,
  UserCheck,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type { Account, AccountType, AccountPartnerFilter, CostCenter, AccountUsage } from '@/types/erp'

const accountTypes: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense']

const typeConfig: Record<AccountType, { bg: string; text: string; dot: string; rootCode: string }> = {
  asset:    { bg: 'bg-blue-50 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500', rootCode: '1' },
  liability:{ bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500', rootCode: '2' },
  equity:   { bg: 'bg-violet-50 dark:bg-violet-950/50', text: 'text-violet-700 dark:text-violet-400', dot: 'bg-violet-500', rootCode: '3' },
  revenue:  { bg: 'bg-emerald-50 dark:bg-emerald-950/50', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', rootCode: '4' },
  expense:  { bg: 'bg-rose-50 dark:bg-rose-950/50', text: 'text-rose-700 dark:text-rose-400', dot: 'bg-rose-500', rootCode: '5' },
}

// Deterministic badge colors for linked cost centers (same cost center always
// gets the same color, based on its id).
const costCenterBadges: { bg: string; text: string; dot: string }[] = [
  { bg: 'bg-blue-50 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
  { bg: 'bg-purple-50 dark:bg-purple-950/50', text: 'text-purple-700 dark:text-purple-400', dot: 'bg-purple-500' },
  { bg: 'bg-emerald-50 dark:bg-emerald-950/50', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  { bg: 'bg-rose-50 dark:bg-rose-950/50', text: 'text-rose-700 dark:text-rose-400', dot: 'bg-rose-500' },
  { bg: 'bg-cyan-50 dark:bg-cyan-950/50', text: 'text-cyan-700 dark:text-cyan-400', dot: 'bg-cyan-500' },
  { bg: 'bg-indigo-50 dark:bg-indigo-950/50', text: 'text-indigo-700 dark:text-indigo-400', dot: 'bg-indigo-500' },
  { bg: 'bg-orange-50 dark:bg-orange-950/50', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
  { bg: 'bg-teal-50 dark:bg-teal-950/50', text: 'text-teal-700 dark:text-teal-400', dot: 'bg-teal-500' },
  { bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/50', text: 'text-fuchsia-700 dark:text-fuchsia-400', dot: 'bg-fuchsia-500' },
]

const getCostCenterBadge = (id: number) => costCenterBadges[id % costCenterBadges.length]

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const accountTypeLabel: Record<AccountType, string> = {
  asset: 'Asset (1)', liability: 'Liability (2)', equity: 'Equity (3)', revenue: 'Revenue (4)', expense: 'Expense (5)',
}

function UsageCell({ usage }: { usage?: AccountUsage }) {
  const [hover, setHover] = useState(false)
  const hasPosting = (usage?.postingProfiles?.length || 0) > 0
  const hasTax = (usage?.taxCodes?.length || 0) > 0
  if (!hasPosting && !hasTax) return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-center gap-1 flex-wrap">
        {hasPosting && (
          <span className="inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">Posting Profile</span>
        )}
        {hasTax && (
          <span className="inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400">Tax</span>
        )}
      </div>
      {hover && (
        <div className="absolute z-30 left-0 top-full mt-1 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-xl text-xs">
          {hasPosting && (
            <div className="mb-2">
              <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Posting Profiles</p>
              {usage!.postingProfiles.map((p, i) => (
                <p key={i} className="text-gray-500 dark:text-gray-400">{p.name} <span className="text-gray-400 dark:text-gray-500">({p.role})</span></p>
              ))}
            </div>
          )}
          {hasTax && (
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Tax Codes</p>
              {usage!.taxCodes.map((name, i) => (
                <p key={i} className="text-gray-500 dark:text-gray-400">{name}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface AccountFormData {
  code: string
  name: string
  type: AccountType
  parentId: number | null
}

function generateSuggestedCode(accounts: Account[], parentId: number | null, type: AccountType): string {
  if (!parentId) {
    // Root level: use type-based single digit
    return typeConfig[type].rootCode
  }
  const parent = accounts.find(a => a.id === parentId)
  if (!parent) return ''
  const siblings = accounts.filter(a => a.parentId === parentId)
  const nextSeq = siblings.length + 1
  return String(Number(parent.code) * 100 + nextSeq)
}

const emptyForm = (accounts: Account[], parentId: number | null, type: AccountType): AccountFormData => ({
  code: generateSuggestedCode(accounts, parentId, type),
  name: '',
  type: parentId ? (accounts.find(a => a.id === parentId)?.type || 'asset') : type,
  parentId,
})

export default function ChartOfAccountsPage() {
  const toast = useToast()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [usageMap, setUsageMap] = useState<Record<string, AccountUsage>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<AccountType | 'All'>('All')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [formData, setFormData] = useState<AccountFormData>(emptyForm([], null, 'asset'))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [toggleTarget, setToggleTarget] = useState<Account | null>(null)
  const [toggling, setToggling] = useState(false)
  const [linkCcTarget, setLinkCcTarget] = useState<Account | null>(null)
  // Multi-step link wizard: 'pick' = choose Cost/Partners/Emp, 'config' = the detail step
  const [linkStep, setLinkStep] = useState<'pick' | 'config'>('pick')
  const [linkTab, setLinkTab] = useState<'cost_center' | 'partner' | 'employee'>('cost_center')
  const [partnerLinkFilter, setPartnerLinkFilter] = useState<AccountPartnerFilter | 'none'>('both')
  const [linkEmployeeRemove, setLinkEmployeeRemove] = useState(false)
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<number | null>(null)
  const [linkCcOpen, setLinkCcOpen] = useState(false)
  const [linkCcSearch, setLinkCcSearch] = useState('')
  const [linkCcSelectOpen, setLinkCcSelectOpen] = useState(false)
  const [linkCcCascade, setLinkCcCascade] = useState(false)
  const [linkCcConfirmOpen, setLinkCcConfirmOpen] = useState(false)
  const [linkCcError, setLinkCcError] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const menuBtnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [parentSearch, setParentSearch] = useState('')
  const [parentOpen, setParentOpen] = useState(false)
  const [toggleError, setToggleError] = useState('')

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setAccounts(json.data)
      setUsageMap(json.usage || {})
    } catch (err) {
      setError('Failed to load accounts. Make sure the server is running.')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCostCenters = useCallback(async () => {
    try {
      const res = await fetch('/api/cost-centers')
      if (res.ok) {
        const json = await res.json()
        if (json.success) setCostCenters(json.data)
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
    fetchCostCenters()
  }, [fetchAccounts, fetchCostCenters])

  // Filtered & searched accounts (keep ancestors so tree is navigable)
  const filteredAccounts = useMemo(() => {
    let list = accounts
    if (activeTab !== 'All') {
      list = list.filter(a => a.type === activeTab)
    }
    if (statusFilter !== 'all') {
      list = list.filter(a => statusFilter === 'active' ? a.isActive : !a.isActive)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const directMatches = new Set(
        list.filter(a => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)).map(a => a.id)
      )
      // Add ancestors so matching children remain visible
      const addAncestors = (childId: number) => {
        const a = accounts.find(x => x.id === childId)
        if (a?.parentId) {
          directMatches.add(a.parentId)
          addAncestors(a.parentId)
        }
      }
      directMatches.forEach(id => addAncestors(id))
      list = list.filter(a => directMatches.has(a.id))
    }
    return list
  }, [accounts, activeTab, statusFilter, searchQuery])

  const topLevel = filteredAccounts.filter(a => !a.parentId)
  const getChildren = (parentId: number) => filteredAccounts.filter(a => a.parentId === parentId)
  const hasChildren = (id: number) => accounts.some(a => a.parentId === id)

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // --- Inline Add ---
  const openAddChild = (parent: Account) => {
    setEditingAccount(null)
    setFormData(emptyForm(accounts, parent.id, parent.type))
    setFormError('')
    setShowForm(true)
  }

  const openAddRoot = (type: AccountType) => {
    setEditingAccount(null)
    setFormData(emptyForm(accounts, null, type))
    setFormError('')
    setShowForm(true)
  }

  // --- Edit ---
  const openEdit = (account: Account) => {
    setEditingAccount(account)
    setFormData({
      code: account.code,
      name: account.name,
      type: account.type,
      parentId: account.parentId,
    })
    setFormError('')
    setShowForm(true)
  }

  // --- Save ---
  const handleSave = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      setFormError('Code and name are required')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const url = editingAccount ? `/api/accounts/${editingAccount.id}` : '/api/accounts'
      const method = editingAccount ? 'PUT' : 'POST'
      const body: any = { code: formData.code, name: formData.name, type: formData.type, parentId: formData.parentId }
      if (editingAccount) {
        body.version = editingAccount.version
      }
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save account')
      }
      const json = await res.json()
      if (json.warning) {
        toast.info(json.warning)
      }
      setShowForm(false)
      fetchAccounts()
      toast.success(editingAccount ? `Account "${formData.name}" updated` : `Account "${formData.name}" created`)
    } catch (err: any) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // --- Toggle Active (with confirmation) ---
  const openToggleConfirm = (account: Account) => {
    setToggleTarget(account)
    setToggleError('')
  }

  const handleToggleConfirm = async () => {
    if (!toggleTarget) return
    setToggling(true)
    setToggleError('')
    try {
      const res = await fetch(`/api/accounts/${toggleTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggleActive', isActive: !toggleTarget.isActive, cascade: true }),
      })
      const errData = !res.ok ? await res.json().catch(() => ({})) : null
      if (errData) throw new Error(errData.error || `HTTP ${res.status}`)
      setToggleTarget(null)
      fetchAccounts()
      toast.success(toggleTarget.isActive ? `Account "${toggleTarget.name}" deactivated` : `Account "${toggleTarget.name}" activated`)
    } catch (err: any) {
      // Show the error inside the modal so it is never hidden behind it.
      setToggleError(err.message || 'Failed to toggle account status')
    } finally {
      setToggling(false)
    }
  }

  // --- Delete (with undo) ---
  const restoreAccount = async (account: Account) => {
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: account.code,
          name: account.name,
          type: account.type,
          parentId: account.parentId,
          description: account.description,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Restore failed')
      }
      const json = await res.json()
      const newId = json.data?.id
      // Re-link whatever the deleted account was linked to (cost center / partner).
      // The account itself is already restored — a failed link shouldn't mask that.
      if (newId && (account.linkType || account.costCenterId)) {
        const linkType = account.linkType || (account.costCenterId ? 'cost_center' : null)
        const linkId = account.linkType ? account.linkId : account.costCenterId
        try {
          const linkRes = await fetch(`/api/accounts/${newId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'link', linkType, linkId, linkPartnerFilter: account.linkPartnerFilter, cascade: false }),
          })
          if (!linkRes.ok) {
            const err = await linkRes.json()
            throw new Error(err.error || 'could not re-link')
          }
        } catch (linkErr: any) {
          toast.error(`Account restored, but re-linking failed: ${linkErr?.message || 'unknown error'}`)
        }
      }
      fetchAccounts()
      toast.success(`Account "${account.name}" restored`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore account')
      fetchAccounts()
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteError('')
    const deleted = deleteTarget
    try {
      const res = await fetch(`/api/accounts/${deleted.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Delete failed')
      }
      setDeleteTarget(null)
      fetchAccounts()
      toast.success(`Account "${deleted.name}" deleted`, {
        action: { label: 'Undo', onClick: () => restoreAccount(deleted) },
        duration: 8000,
      })
    } catch (err: any) {
      setDeleteError(err.message)
    }
  }

  // --- Link Account (Cost Center | Partner | Employee) ---
  // Only top-level cost centers (no parent) are linkable
  const searchableCCs = useMemo(() => costCenters.filter(cc => cc.isActive && !cc.parentId), [costCenters])
  const filteredCCs = useMemo(() => {
    if (!linkCcSearch.trim()) return searchableCCs
    const q = linkCcSearch.toLowerCase()
    return searchableCCs.filter(cc => cc.code.toLowerCase().includes(q) || cc.name.toLowerCase().includes(q))
  }, [searchableCCs, linkCcSearch])

  const openLinkAccount = (account: Account) => {
    setLinkCcTarget(account)
    setLinkStep(account.linkType ? 'config' : 'pick')
    setLinkTab(account.linkType === 'partner' ? 'partner' : account.linkType === 'employee' ? 'employee' : 'cost_center')
    setSelectedCostCenterId(account.linkType === 'cost_center' ? account.linkId : (account.costCenterId ?? null))
    setPartnerLinkFilter(account.linkPartnerFilter || 'both')
    setLinkEmployeeRemove(false)
    setLinkCcSearch('')
    setLinkCcSelectOpen(false)
    setLinkCcCascade(false)
    setLinkCcError('')
    setLinkCcOpen(true)
  }

  // Total number of descendants across all levels (for cascade messaging)
  const countDescendants = (parentId: number): number => {
    let count = 0
    for (const a of accounts) {
      if (a.parentId === parentId) {
        count += 1 + countDescendants(a.id)
      }
    }
    return count
  }

  const doLink = async (cascade: boolean) => {
    if (!linkCcTarget) return
    setLinkCcError('')
    // Partner and employee links are dimension-level: the account links to a type
    // filter (customers/vendors/both) or to employees in general — the concrete
    // partner/employee is chosen on each entry line, so no linkId is sent.
    const linkType = linkTab === 'cost_center'
      ? (selectedCostCenterId ? 'cost_center' : null)
      : linkTab === 'employee'
        ? (linkEmployeeRemove ? null : 'employee')
        : (partnerLinkFilter === 'none' ? null : 'partner')
    const linkId = linkTab === 'cost_center' ? selectedCostCenterId : null
    const linkPartnerFilter = linkTab === 'partner' && partnerLinkFilter !== 'none' ? partnerLinkFilter : null

    try {
      const res = await fetch(`/api/accounts/${linkCcTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link', linkType, linkId, linkPartnerFilter, cascade }),
      })
      const errData = !res.ok ? await res.json().catch(() => ({})) : null
      if (errData) throw new Error(errData.error || `HTTP ${res.status}`)
      setLinkCcConfirmOpen(false)
      setLinkCcOpen(false)
      setLinkCcTarget(null)
      setLinkCcError('')
      // Don't show loading spinner — just refresh data silently
      const [accRes, ccRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/cost-centers'),
      ])
      if (accRes.ok) {
        const accJson = await accRes.json()
        if (accJson.success) setAccounts(accJson.data)
      }
      if (ccRes.ok) {
        const ccJson = await ccRes.json()
        if (ccJson.success) setCostCenters(ccJson.data)
      }
      const targetName = linkCcTarget.name
      if (linkTab === 'partner') {
        if (partnerLinkFilter === 'none') {
          toast.success(`Partner link removed from "${targetName}"`)
        } else {
          const filterLabel = partnerLinkFilter === 'customer' ? 'Customers' : partnerLinkFilter === 'vendor' ? 'Vendors' : 'Customers & Vendors'
          toast.success(`${filterLabel} linked to "${targetName}"`)
        }
      } else if (linkTab === 'employee') {
        toast.success(linkEmployeeRemove
          ? `Employee link removed from "${targetName}"`
          : `Employees linked to "${targetName}"`)
      } else {
        const ccName = selectedCostCenterId
          ? costCenters.find(c => c.id === selectedCostCenterId)?.name
          : null
        toast.success(ccName
          ? `Cost center "${ccName}" linked to "${targetName}"`
          : `Cost center link removed from "${targetName}"`)
      }
      if (!accRes.ok || !ccRes.ok) {
        setError('Link saved, but failed to refresh data')
      }
    } catch (err: any) {
      // Show the error inside the modal so it is never hidden behind it.
      setLinkCcError(err.message || 'Failed to link')
    }
  }

  // If the account has sub-accounts, ask for the scope in a confirmation
  // dialog after clicking "Link Cost Center".
  const handleLink = () => {
    if (!linkCcTarget) return
    // Close the searchable select dropdowns so their full-screen overlays never
    // swallow this click (or leave stale state behind).
    setLinkCcSelectOpen(false)
    setLinkCcError('')
    // In the wizard the link kind is chosen on step 1; the detail step only
    // needs a valid selection when a cost center is required.
    if (countDescendants(linkCcTarget.id) > 0) {
      setLinkCcOpen(false)
      setLinkCcConfirmOpen(true)
    } else {
      doLink(false)
    }
  }

  // --- Position the action menu next to its button ---
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
  // never lags behind at the old account position.
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

  // --- Auto-expand ancestors when searching ---
  useEffect(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchingIds = new Set<number>()
      accounts.forEach(a => {
        if (a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)) {
          matchingIds.add(a.id)
        }
      })
      if (matchingIds.size > 0) {
        const ancestors = new Set<number>()
        const addAncestors = (childId: number) => {
          const a = accounts.find(x => x.id === childId)
          if (a?.parentId) {
            ancestors.add(a.parentId)
            addAncestors(a.parentId)
          }
        }
        matchingIds.forEach(id => addAncestors(id))
        setExpanded(prev => {
          const next = new Set(prev)
          ancestors.forEach(id => next.add(id))
          return next
        })
      }
    }
  }, [searchQuery, accounts])

  // --- Inline Add Root buttons ---
  const showInlineRootAdders = activeTab !== 'All'

  // ---- Render Account Rows (flat list for valid HTML) ----
  const renderAccountRows = (account: Account, depth = 0): React.ReactNode[] => {
    const accHasChildren = hasChildren(account.id)
    const isOpen = expanded.has(account.id)
    const children = accHasChildren ? getChildren(account.id) : []
    const depthPadding = Math.min(depth, 10)

    const row = (
      <tr key={account.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
        {/* Account name with expand/collapse */}
        <td className="py-2 px-3">
          <div className={`flex items-center gap-1.5 ${accHasChildren ? 'cursor-pointer' : ''}`} style={{ paddingLeft: `${depthPadding * 20}px` }} onClick={accHasChildren ? () => toggleExpand(account.id) : undefined}>
            {accHasChildren ? (
              <button
                className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-14 shrink-0">{account.code}</span>
            <span className={`text-sm font-medium truncate ${account.isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500 line-through'}`}>
              {account.name}
            </span>
            {account.parentId && (
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                {accounts.find(a => a.id === account.parentId)?.code} — {accounts.find(a => a.id === account.parentId)?.name}
              </div>
            )}
          </div>
        </td>
        {/* Linked To (cost center | partners | employees) */}
        <td className="py-2 px-3">
          {(() => {
            if (account.linkType === 'partner') {
              const filter = account.linkPartnerFilter || 'both'
              const label = filter === 'customer' ? 'Customers' : filter === 'vendor' ? 'Vendors' : 'Customers & Vendors'
              return (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full max-w-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400" title={`Partners: ${label}`}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500" />
                  <span className="truncate max-w-36 min-w-0">{label}</span>
                </span>
              )
            }
            if (account.linkType === 'employee') {
              return (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full max-w-full bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400" title="Employees">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-cyan-500" />
                  <span className="truncate max-w-36 min-w-0">Employees</span>
                </span>
              )
            }
            const cc = account.costCenterId ? costCenters.find(c => c.id === account.costCenterId) : null
            if (!cc) {
              return <span className="text-xs text-gray-400">—</span>
            }
            const badge = getCostCenterBadge(cc.id)
            return (
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full max-w-full ${badge.bg} ${badge.text}`} title={`${cc.code} - ${cc.name}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badge.dot}`} />
                <span className="font-mono shrink-0">{cc.code}</span>
                <span className="truncate max-w-36 min-w-0">{cc.name}</span>
              </span>
            )
          })()}
        </td>
        {/* Type */}
        <td className="py-2 px-3">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${typeConfig[account.type].bg} ${typeConfig[account.type].text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${typeConfig[account.type].dot}`} />
            {capitalize(account.type)}
          </span>
        </td>
        {/* Status */}
        <td className="py-2 px-3 text-center">
          <span className={`inline-flex text-xs font-medium px-2 py-1 rounded-full ${
            account.isActive
              ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400'
              : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
          }`}>
            {account.isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        {/* Used In */}
        <td className="py-2 px-3">
          <UsageCell usage={usageMap[account.code]} />
        </td>
        {/* Actions */}
        <td className="py-2 px-3 text-right">
          <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
            {/* Add Sub - always visible */}
            <button
              onClick={() => openAddChild(account)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
              title="Add child account"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {/* More actions dropdown */}
            <button
              onClick={(e) => openMenu(e, account.id)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    )

    if (accHasChildren && isOpen) {
      return [row, ...children.flatMap(child => renderAccountRows(child, depth + 1))]
    }
    return [row]
  }

  return (
    <div className="space-y-5">
      {/* Page Header - NO add button here, only title */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Chart of Accounts</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Hierarchical accounts with auto-code generation. Click <ChevronRight className="w-3 h-3 inline" /> to expand, use inline actions to manage.
        </p>
      </div>

      {/* Success feedback is handled by global toasts */}

      {/* Combined Filters & Search in ONE line */}
      <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-2.5">
        {/* Type tabs */}
        {(['All', ...accountTypes] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {tab === 'All' ? 'All' : capitalize(tab)}
          </button>
        ))}

        {/* Status filter */}
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />
        {(['all', 'active', 'inactive'] as const).map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-2.5 py-1 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === f
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-sm'
                : 'text-gray-500 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            {f === 'all' ? 'All' : capitalize(f)}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1 min-w-0" />

        {/* Search */}
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search by code or name..." className="max-w-xs w-full" compact />
      </div>

      {/* Main Table Card */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading accounts...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
            <button onClick={fetchAccounts} className="mt-3 text-sm font-medium text-brand-500 hover:text-brand-600 transition-colors">
              Try again
            </button>
          </div>
        ) : topLevel.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <FolderTree className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">No accounts found</p>
            {activeTab !== 'All' ? (
              <button
                onClick={() => openAddRoot(activeTab)}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-600 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add first {capitalize(activeTab)} account
              </button>
            ) : (
              <button
                onClick={() => setActiveTab('asset')}
                className="mt-2 text-sm font-medium text-brand-500 hover:text-brand-600 transition-colors"
              >
                Select a type to add accounts
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Account</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Linked To</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="text-center py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Status</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Used In</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {topLevel.flatMap(account => renderAccountRows(account))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- Floating Action Menu --- */}
      {menuOpenId !== null && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
          <div ref={menuRef} style={menuStyle} className="w-44 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
            {(() => {
              const account = accounts.find(a => a.id === menuOpenId)
              if (!account) return null
              return (
                <>
                  {!account.isSystemAccount && (
                    <button onClick={() => { setMenuOpenId(null); openEdit(account) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                  )}
                  <button onClick={() => { setMenuOpenId(null); openToggleConfirm(account) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                    {account.isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                    {account.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => { setMenuOpenId(null); openLinkAccount(account) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <Link2 className="w-3.5 h-3.5" /> Link
                  </button>
                  <button onClick={() => { setMenuOpenId(null); setDeleteTarget(account) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 border-t border-gray-100 dark:border-gray-800">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </>
              )
            })()}
          </div>
        </>
      )}

      {/* --- Add/Edit Modal --- */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} className="max-w-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {editingAccount ? 'Edit Account' : formData.parentId ? 'Add Child Account' : 'Add Root Account'}
        </h3>
        <div className="space-y-4">
          {/* Parent Account — first field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Parent Account</label>
            {editingAccount ? (
              /* Editable in edit mode */
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setParentOpen(!parentOpen); if (!parentOpen) setParentSearch('') }}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-left flex items-center justify-between transition-all hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                >
                  {formData.parentId ? (
                    <span className="text-gray-900 dark:text-white">
                      {accounts.find(a => a.id === formData.parentId)?.code} — {accounts.find(a => a.id === formData.parentId)?.name}
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">None (Top-level)</span>
                  )}
                  <Search className="w-4 h-4 text-gray-400 shrink-0" />
                </button>
                {parentOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => { setParentOpen(false); setParentSearch('') }} />
                    <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                        <input
                          type="text"
                          value={parentSearch}
                          onChange={e => setParentSearch(e.target.value)}
                          placeholder="Search accounts..."
                          autoFocus
                          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto py-1">
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, parentId: null, type: formData.parentId ? (accounts.find(a => a.id === formData.parentId)?.type || 'asset') : formData.type, code: generateSuggestedCode(accounts, null, formData.type) })
                            setParentOpen(false)
                            setParentSearch('')
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >None (Top-level)</button>
                        {(parentSearch.trim()
                          ? accounts.filter(a =>
                              a.id !== editingAccount?.id &&
                              (a.code.toLowerCase().includes(parentSearch.toLowerCase()) ||
                               a.name.toLowerCase().includes(parentSearch.toLowerCase()))
                            )
                          : accounts.filter(a => a.id !== editingAccount?.id)
                        ).map(a => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, parentId: a.id, type: a.type, code: generateSuggestedCode(accounts, a.id, a.type) })
                              setParentOpen(false)
                              setParentSearch('')
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${formData.parentId === a.id ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                          >
                            <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">{a.code}</span>
                            <span>{a.name}</span>
                            {!a.isActive && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Read-only in create mode */
              <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                {formData.parentId ? (
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {accounts.find(a => a.id === formData.parentId)?.code} — {accounts.find(a => a.id === formData.parentId)?.name}
                  </span>
                ) : (
                  'None (Top-level)'
                )}
              </div>
            )}
          </div>

          {/* Code + Type row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Code <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={e => setFormData({ ...formData, code: e.target.value })}
                placeholder={formData.parentId ? 'Auto-generated' : 'e.g. 1'}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
              {!editingAccount && formData.parentId && (
                <p className="text-[11px] text-gray-400 mt-1">Auto-suggested: parent code × 100 + sequence</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Type</label>
              {formData.parentId ? (
                <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  {capitalize(formData.type)} (inherited)
                </div>
              ) : (
                <select
                  value={formData.type}
                  onChange={e => {
                    const newType = e.target.value as AccountType
                    if (!editingAccount) {
                      setFormData({ ...formData, type: newType, code: generateSuggestedCode(accounts, null, newType) })
                    } else {
                      setFormData({ ...formData, type: newType })
                    }
                  }}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                >
                  {accountTypes.map(t => (
                    <option key={t} value={t}>{capitalize(t)} {`(${typeConfig[t].rootCode})`}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Account name"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            />
          </div>

          {/* Form error */}
          {formError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2">
              <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !formData.code.trim() || !formData.name.trim()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : editingAccount ? 'Update Account' : 'Create Account'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* --- Link Account Modal (Cost Center | Partner | Employee) --- */}
      <Modal isOpen={linkCcOpen} onClose={() => setLinkCcOpen(false)} className="max-w-md p-6">
        {linkCcTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-purple-50 dark:bg-purple-950/50 p-2.5">
                <Link2 className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Link Account</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {linkCcTarget.code} - {linkCcTarget.name}
                </p>
              </div>
            </div>

            {/* Error banner — shown inside the modal so it is never hidden */}
            {linkCcError && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2">
                <p className="text-sm text-red-600 dark:text-red-400">{linkCcError}</p>
              </div>
            )}

            {/* Currently linked badge — display only. To remove the link,
                pick "None" in the detail step below. */}
            {linkCcTarget.linkType && (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Currently linked:</span>
                {(() => {
                  const t = linkCcTarget
                  if (t.linkType === 'partner') {
                    const filter = t.linkPartnerFilter || 'both'
                    const label = filter === 'customer' ? 'Customers' : filter === 'vendor' ? 'Vendors' : 'Customers & Vendors'
                    return (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Partners: {label}
                      </span>
                    )
                  }
                  if (t.linkType === 'employee') {
                    return (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                        Employees
                      </span>
                    )
                  }
                  const cc = costCenters.find(c => c.id === t.linkId)
                  const badge = cc ? getCostCenterBadge(cc.id) : null
                  return cc && badge ? (
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full max-w-full ${badge.bg} ${badge.text}`} title={`${cc.code} - ${cc.name}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badge.dot}`} />
                      <span className="font-mono shrink-0">{cc.code}</span>
                      <span className="truncate max-w-32 min-w-0">{cc.name}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500 dark:text-gray-400 italic">Cost center #{t.linkId}</span>
                  )
                })()}
              </div>
            )}

            {/* ── Step 1 — pick the link kind ── */}
            {linkStep === 'pick' && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Choose what this account links to</p>
                {([
                  { key: 'cost_center' as const, title: 'Cost Center', desc: 'Lines must carry a cost center from its subtree', icon: <FolderTree className="w-5 h-5" />, cls: 'bg-purple-50 dark:bg-purple-950/50 text-purple-500' },
                  { key: 'partner' as const, title: 'Partners', desc: 'Filter lines to customers, vendors or both', icon: <Users className="w-5 h-5" />, cls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-500' },
                  { key: 'employee' as const, title: 'Employees', desc: 'Lines must carry an employee', icon: <UserCheck className="w-5 h-5" />, cls: 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-500' },
                ]).map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setLinkTab(opt.key); setLinkStep('config'); setLinkCcError('') }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                      linkTab === opt.key
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${opt.cls}`}>{opt.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-white">{opt.title}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{opt.desc}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 ml-auto shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {/* ── Step 2 — the detail step ── */}
            {linkStep === 'config' && (
              <>
                <button
                  type="button"
                  onClick={() => setLinkStep('pick')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>

                {linkTab === 'cost_center' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Cost Center</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setLinkCcSelectOpen(!linkCcSelectOpen); if (!linkCcSelectOpen) setLinkCcSearch('') }}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-left flex items-center justify-between gap-2 transition-all hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  >
                    {selectedCostCenterId ? (() => {
                      const cc = costCenters.find(c => c.id === selectedCostCenterId)
                      if (cc) {
                        const badge = getCostCenterBadge(cc.id)
                        return (
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full max-w-full ${badge.bg} ${badge.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badge.dot}`} />
                            <span className="font-mono shrink-0">{cc.code}</span>
                            <span className="truncate max-w-40 min-w-0">{cc.name}</span>
                          </span>
                        )
                      }
                      return <span className="text-gray-900 dark:text-white">Cost center #{selectedCostCenterId}</span>
                    })() : (
                      <span className="text-gray-400 dark:text-gray-500">None</span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${linkCcSelectOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {linkCcSelectOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => { setLinkCcSelectOpen(false); setLinkCcSearch('') }} />
                      <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden">
                        <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              value={linkCcSearch}
                              onChange={e => setLinkCcSearch(e.target.value)}
                              placeholder="Search cost centers..."
                              autoFocus
                              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-9 pr-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                            />
                          </div>
                        </div>
                        <div className="max-h-48 overflow-y-auto py-1">
                          <button
                            type="button"
                            onClick={() => { setSelectedCostCenterId(null); setLinkCcSelectOpen(false); setLinkCcSearch('') }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                              selectedCostCenterId === null
                                ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                          >
                            <span className="font-medium">None</span>
                            <span className="ml-2 text-xs text-gray-400">Remove cost center link</span>
                          </button>
                          {filteredCCs.length === 0 ? (
                            <p className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No cost centers available</p>
                          ) : (
                            filteredCCs.map(cc => (
                              <button
                                key={cc.id}
                                type="button"
                                onClick={() => { setSelectedCostCenterId(cc.id); setLinkCcSelectOpen(false); setLinkCcSearch('') }}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                  selectedCostCenterId === cc.id
                                    ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400'
                                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                              >
                                <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">{cc.code}</span>
                                <span>{cc.name}</span>
                                {cc.responsiblePerson && <span className="ml-2 text-xs text-gray-400">• {cc.responsiblePerson}</span>}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

                {/* ── Partner step: type filter only (no partner list) ── */}
                {linkTab === 'partner' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Partner Type</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([
                          { key: 'customer' as const, label: 'Customers', desc: 'entry picker shows customers + both-type' },
                          { key: 'vendor' as const, label: 'Vendors', desc: 'entry picker shows vendors + both-type' },
                          { key: 'both' as const, label: 'Both', desc: 'entry picker shows all partners' },
                        ]).map(f => (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => { setPartnerLinkFilter(f.key); setLinkCcError('') }}
                            className={`flex flex-col items-center gap-1 px-2.5 py-2.5 rounded-lg border text-center transition-all ${
                              partnerLinkFilter === f.key
                                ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                            }`}
                          >
                            <span className={`text-xs font-medium ${partnerLinkFilter === f.key ? 'text-brand-700 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300'}`}>{f.label}</span>
                            <span className="text-[10px] text-gray-400 leading-tight">{f.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {linkCcTarget.linkType === 'partner' && (
                      <button
                        type="button"
                        onClick={() => setPartnerLinkFilter('none')}
                        className={`text-xs font-medium transition-colors ${partnerLinkFilter === 'none' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400 hover:text-red-500'}`}
                      >
                        {partnerLinkFilter === 'none' ? 'Remove selected — click Link button below' : 'Remove partner link'}
                      </button>
                    )}
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      The line editor&apos;s partner picker will be filtered to {partnerLinkFilter === 'both' ? 'customers and vendors' : partnerLinkFilter === 'customer' ? 'customers + both-type partners' : partnerLinkFilter === 'vendor' ? 'vendors + both-type partners' : '…'}, and the AR/AP role flag is auto-synced.
                    </p>
                  </div>
                )}

                {/* ── Employee step: no list — the employee is picked on each entry line ── */}
                {linkTab === 'employee' && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-950/10 px-4 py-3">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        This account will require an <strong className="font-medium">employee</strong> on every entry line.
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        The specific employee is chosen in the entry line editor, not here.
                      </p>
                    </div>
                    {linkCcTarget.linkType === 'employee' && (
                      <button
                        type="button"
                        onClick={() => { setLinkEmployeeRemove(!linkEmployeeRemove); setLinkCcError('') }}
                        className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${
                          linkEmployeeRemove ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400 hover:text-red-500'
                        }`}
                      >
                        {linkEmployeeRemove ? 'Remove selected — click Link button below' : 'Remove employee link'}
                      </button>
                    )}
                  </div>
                )}

                <div className="relative z-30 flex items-center justify-end gap-3 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setLinkCcOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleLink}>
                    {linkTab === 'partner'
                      ? (partnerLinkFilter === 'none' ? 'Remove Link' : partnerLinkFilter === 'customer' ? 'Link Customers' : partnerLinkFilter === 'vendor' ? 'Link Vendors' : 'Link Customers & Vendors')
                      : linkTab === 'employee'
                        ? (linkEmployeeRemove ? 'Remove Link' : 'Link Employees')
                        : (selectedCostCenterId === null && linkCcTarget.linkType === 'cost_center' ? 'Remove Link' : 'Link Cost Center')}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* --- Link Confirmation (sub-accounts) --- */}
      <Modal isOpen={linkCcConfirmOpen} onClose={() => setLinkCcConfirmOpen(false)} className="max-w-md p-6">
        {linkCcTarget && (() => {
          const descendantCount = countDescendants(linkCcTarget.id)
          const selectedLabel = linkTab === 'partner'
            ? (partnerLinkFilter === 'none' ? '' : partnerLinkFilter === 'customer' ? 'Customers' : partnerLinkFilter === 'vendor' ? 'Vendors' : 'Customers & Vendors')
            : linkTab === 'employee'
              ? 'Employees'
              : (selectedCostCenterId ? costCenters.find(c => c.id === selectedCostCenterId)?.name || `Cost center #${selectedCostCenterId}` : '')
          const removingLink = linkTab === 'partner'
            ? (partnerLinkFilter === 'none' && linkCcTarget.linkType === 'partner')
            : linkTab === 'employee'
              ? (linkEmployeeRemove && linkCcTarget.linkType === 'employee')
              : (selectedCostCenterId === null && linkCcTarget.linkType === 'cost_center')
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-amber-50 dark:bg-amber-950/50 p-2.5">
                  <Link2 className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {removingLink ? 'Remove Link from Sub-accounts?' : 'Apply Link to Sub-accounts?'}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {linkCcTarget.code} - {linkCcTarget.name}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  This account has <strong className="text-gray-900 dark:text-white">{descendantCount} sub-account{descendantCount !== 1 ? 's' : ''}</strong> at all levels.
                </p>
              </div>

              {selectedLabel && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Selected:</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-400">
                    {selectedLabel}
                  </span>
                </div>
              )}

              {/* Error banner — visible in this modal too (cascade flow) */}
              {linkCcError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2">
                  <p className="text-sm text-red-600 dark:text-red-400">{linkCcError}</p>
                </div>
              )}

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setLinkCcCascade(false)}
                  className={`w-full flex items-start gap-3 px-4 py-2.5 rounded-lg border text-left transition-colors ${
                    !linkCcCascade
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                    !linkCcCascade ? 'border-brand-500' : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {!linkCcCascade && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Current account only</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Only this account will be affected</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setLinkCcCascade(true)}
                  className={`w-full flex items-start gap-3 px-4 py-2.5 rounded-lg border text-left transition-colors ${
                    linkCcCascade
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                    linkCcCascade ? 'border-brand-500' : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {linkCcCascade && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">All sub-accounts ({descendantCount})</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Apply the same link to every level below</p>
                  </div>
                </button>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => setLinkCcConfirmOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={() => doLink(linkCcCascade)}>
                  {removingLink ? 'Remove Link' : 'Apply Link'}
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* --- Toggle Active/Inactive Confirmation Modal --- */}
      <Modal isOpen={!!toggleTarget} onClose={() => setToggleTarget(null)} className="max-w-md p-6">
        {toggleTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-2.5 ${toggleTarget.isActive ? 'bg-amber-50 dark:bg-amber-950/50' : 'bg-green-50 dark:bg-green-950/50'}`}>
                {toggleTarget.isActive
                  ? <PowerOff className="w-5 h-5 text-amber-500" />
                  : <Power className="w-5 h-5 text-green-500" />
                }
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {toggleTarget.isActive ? 'Deactivate Account' : 'Activate Account'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {toggleTarget.code} - {toggleTarget.name}
                </p>
              </div>
            </div>

            {/* Child account warning */}
            {(() => {
              const childCount = accounts.filter(a => a.parentId === toggleTarget.id).length
              const totalDescendants = countDescendants(toggleTarget.id)

              return (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                  {/* Current status */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Current status</span>
                    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${
                      toggleTarget.isActive
                        ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400'
                        : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                    }`}>{toggleTarget.isActive ? 'Active' : 'Inactive'}</span>
                  </div>

                  {/* New status */}
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">New status</span>
                    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${
                      !toggleTarget.isActive
                        ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400'
                        : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                    }`}>{toggleTarget.isActive ? 'Inactive' : 'Active'}</span>
                  </div>

                  {/* Children impact */}
                  {totalDescendants > 0 && (
                    <div className="px-4 py-2.5">
                      <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          This will also affect <strong>{totalDescendants} child account{totalDescendants !== 1 ? 's' : ''}</strong>
                          (direct: {childCount}, nested: {totalDescendants - childCount})
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            <p className="text-sm text-gray-600 dark:text-gray-400">
              {toggleTarget.isActive
                ? 'Deactivating will hide this account from selection lists and prevent new postings. All child accounts will also be deactivated.'
                : 'Activating will make this account available for use again. All child accounts will also be activated.'
              }
            </p>

            {/* Error banner — shown inside the modal so failures are never hidden */}
            {toggleError && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2">
                <p className="text-sm text-red-600 dark:text-red-400">{toggleError}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setToggleTarget(null)} disabled={toggling}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleToggleConfirm}
                disabled={toggling}
                className={toggleTarget.isActive ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-500 hover:bg-green-600'}
              >
                {toggling && <Loader2 className="w-4 h-4 animate-spin" />}
                {toggling ? 'Updating...' : toggleTarget.isActive ? 'Yes, Deactivate' : 'Yes, Activate'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* --- Delete Confirmation Modal --- */}
      <Modal isOpen={!!deleteTarget} onClose={() => { setDeleteTarget(null); setDeleteError('') }} className="max-w-md p-6">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-2.5 ${
                deleteTarget.isSystemAccount || hasChildren(deleteTarget.id)
                  ? 'bg-amber-50 dark:bg-amber-950/50'
                  : 'bg-red-50 dark:bg-red-950/50'
              }`}>
                <AlertTriangle className={`w-5 h-5 ${
                  deleteTarget.isSystemAccount || hasChildren(deleteTarget.id)
                    ? 'text-amber-500'
                    : 'text-red-500'
                }`} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Account</h3>
            </div>

            {deleteTarget.isSystemAccount ? (
              <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                <strong>{deleteTarget.code} - {deleteTarget.name}</strong> is a system account and cannot be deleted.
              </p>
            ) : hasChildren(deleteTarget.id) ? (
              <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                This account has child accounts. Remove all children first before deleting.
              </p>
            ) : deleteError ? (
              <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                {deleteError}
              </p>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Are you sure you want to delete <strong>{deleteTarget.code} - {deleteTarget.name}</strong>?
                You'll be able to undo this right after.
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              {!deleteTarget.isSystemAccount && !hasChildren(deleteTarget.id) && (
                <Button size="sm" onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
                  Delete
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
