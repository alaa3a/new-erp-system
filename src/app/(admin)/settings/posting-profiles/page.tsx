'use client'
import { SearchInput, StatusBadge, EmptyState } from '@/components/ui'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus,
  Edit3,
  Trash2,
  AlertTriangle,
  Loader2,
  Check,
  Layers,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { useToast } from '@/components/ui/toast/ToastProvider'
import SearchSelect from '@/components/form/SearchSelect'
import { buildAccountHierarchyOptions } from '@/lib/accountTree'
import type { PostingProfile, InvoiceType, Account, EntryCategory } from '@/types/erp'

const invoiceTypes: InvoiceType[] = ['sales', 'purchase', 'credit_note', 'debit_note']
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const invoiceTypeLabel: Record<InvoiceType, string> = {
  sales: 'Sales Invoice',
  purchase: 'Purchase Invoice',
  credit_note: 'Credit Note',
  debit_note: 'Debit Note',
}

const isArSide = (t: InvoiceType) => t === 'sales' || t === 'debit_note'

interface AccountField {
  key: keyof PostingProfile
  label: string
  description: string
  required: boolean
}

// Direction-aware (§6.1): AR-side profiles show AR, AP-side profiles show AP.
const accountFields: AccountField[] = [
  { key: 'accountsReceivableCode', label: 'Accounts Receivable', description: 'AR account for sales-side invoices', required: true },
  { key: 'accountsPayableCode', label: 'Accounts Payable', description: 'AP account for purchase-side invoices', required: true },
  { key: 'cashAccountCode', label: 'Cash / Bank', description: 'Cash or bank account for payments', required: true },
  { key: 'discountAccountCode', label: 'Discount', description: 'Discount allowed / received', required: true },
  { key: 'inventoryAccountCode', label: 'Inventory', description: 'Stock asset account (for stock items)', required: false },
  { key: 'cogsAccountCode', label: 'Cost of Goods Sold', description: 'COGS expense account (for stock items)', required: false },
]

interface ProfileFormData {
  name: string
  invoiceType: InvoiceType
  accountsReceivableCode: string
  accountsPayableCode: string
  cashAccountCode: string
  discountAccountCode: string
  inventoryAccountCode: string
  cogsAccountCode: string
  entryCategoryId: number | null
  enableStockAccounts: boolean
  isDefault: boolean
  isActive: boolean
}

const emptyForm = (): ProfileFormData => ({
  name: '',
  invoiceType: 'sales',
  accountsReceivableCode: '',
  accountsPayableCode: '',
  cashAccountCode: '',
  discountAccountCode: '',
  inventoryAccountCode: '',
  cogsAccountCode: '',
  entryCategoryId: null,
  enableStockAccounts: false,
  isDefault: false,
  isActive: true,
})

export default function PostingProfilesPage() {
  const toast = useToast()
  const [profiles, setProfiles] = useState<PostingProfile[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<EntryCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingProfile, setEditingProfile] = useState<PostingProfile | null>(null)
  const [formData, setFormData] = useState<ProfileFormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formTouched, setFormTouched] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PostingProfile | null>(null)

  const fetchProfiles = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/posting-profiles')
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Request failed')
      setProfiles(json.data)
    } catch {
      setError('Failed to load posting profiles.')
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
    } catch {
      // silent
    }
  }, [])

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/entry-categories')
      if (res.ok) {
        const json = await res.json()
        if (json.success) setCategories(json.data)
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchProfiles()
    fetchAccounts()
    fetchCategories()
  }, [fetchProfiles, fetchAccounts, fetchCategories])

  // Flattened chart-of-accounts tree for the searchable selectors.
  // Parent accounts (and inactive accounts) are non-selectable + bold;
  // leaf accounts are selectable with a different (normal-weight) style.
  const accountHierarchyOptions = useMemo(() => buildAccountHierarchyOptions(accounts), [accounts])

  const filteredProfiles = useMemo(() => {
    if (!searchQuery.trim()) return profiles
    const q = searchQuery.toLowerCase()
    return profiles.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.invoiceType.toLowerCase().includes(q)
    )
  }, [profiles, searchQuery])

  const openAddForm = () => {
    setEditingProfile(null)
    setFormData(emptyForm())
    setFormTouched(false)
    setFormError('')
    setShowForm(true)
  }

  const openEditForm = (profile: PostingProfile) => {
    setEditingProfile(profile)
    setFormData({
      name: profile.name,
      invoiceType: profile.invoiceType,
      accountsReceivableCode: profile.accountsReceivableCode,
      accountsPayableCode: profile.accountsPayableCode,
      cashAccountCode: profile.cashAccountCode,
      discountAccountCode: profile.discountAccountCode,
      inventoryAccountCode: profile.inventoryAccountCode || '',
      cogsAccountCode: profile.cogsAccountCode || '',
      entryCategoryId: profile.entryCategoryId,
      enableStockAccounts: !!(profile.inventoryAccountCode || profile.cogsAccountCode),
      isDefault: profile.isDefault,
      isActive: profile.isActive,
    })
    setFormTouched(false)
    setFormError('')
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setFormError('Name is required')
      return
    }
    setSaving(true)
    setFormTouched(true)
    setFormError('')
    try {
      const url = editingProfile ? `/api/posting-profiles/${editingProfile.id}` : '/api/posting-profiles'
      const method = editingProfile ? 'PUT' : 'POST'
      const body: any = {
        ...formData,
        // Stock mappings are hidden + saved empty unless the toggle is on (§6.2)
        inventoryAccountCode: formData.enableStockAccounts ? formData.inventoryAccountCode : '',
        cogsAccountCode: formData.enableStockAccounts ? formData.cogsAccountCode : '',
      }
      delete body.enableStockAccounts
      if (editingProfile) body.version = editingProfile.version
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      const json = await res.json()
      if (json.warning) toast.info(json.warning)
      setShowForm(false)
      fetchProfiles()
      toast.success(editingProfile ? `Posting profile "${formData.name}" updated` : `Posting profile "${formData.name}" created`)
    } catch (err: any) {
      setFormError(err.message)
      toast.error(err.message || 'Failed to save posting profile')
    } finally {
      setSaving(false)
    }
  }

  // --- Delete (soft delete, with undo) ---
  const restoreProfile = async (profile: PostingProfile) => {
    try {
      const res = await fetch(`/api/posting-profiles/${profile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name,
          invoiceType: profile.invoiceType,
          accountsReceivableCode: profile.accountsReceivableCode || '',
          accountsPayableCode: profile.accountsPayableCode || '',
          cashAccountCode: profile.cashAccountCode || '',
          discountAccountCode: profile.discountAccountCode || '',
          inventoryAccountCode: profile.inventoryAccountCode || '',
          cogsAccountCode: profile.cogsAccountCode || '',
          entryCategoryId: profile.entryCategoryId,
          isDefault: profile.isDefault,
          isActive: true,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Restore failed')
      }
      fetchProfiles()
      toast.success(`Posting profile "${profile.name}" restored`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to restore posting profile')
      fetchProfiles()
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const deleted = deleteTarget
    try {
      const res = await fetch(`/api/posting-profiles/${deleted.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setDeleteTarget(null)
      fetchProfiles()
      toast.success(`Posting profile "${deleted.name}" deleted`, {
        action: { label: 'Undo', onClick: () => restoreProfile(deleted) },
        duration: 8000,
      })
    } catch (err: any) {
      setError('Failed to delete')
      toast.error(err?.message || 'Failed to delete posting profile')
    }
  }

  // Account Selector component — searchable, with the chart-of-accounts tree.
  // Parent accounts are shown bold and are not selectable; leaf accounts use a
  // normal (non-bold) style. The dropdown flips upward when near the bottom.
  const AccountSelector = ({
    field,
    value,
    onChange,
    exclude,
  }: {
    field: AccountField
    value: string
    onChange: (v: string) => void
    exclude?: string[]
  }) => {
    const showError = formTouched && field.required && !value
    const options = accountHierarchyOptions.filter(o => !exclude || !exclude.includes(o.id) || o.id === value)
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {field.label} {field.required && <span className="text-red-400">*</span>}
        </label>
        <div className={showError ? 'rounded-lg ring-2 ring-red-300 dark:ring-red-700' : ''}>
          <SearchSelect
            options={options}
            value={value || ''}
            onChange={(v) => onChange(v ? String(v) : '')}
            placeholder="-- Select account --"
            noneLabel="-- None --"
            searchPlaceholder="Search accounts..."
            notFoundLabel="No accounts found"
          />
        </div>
        {showError && <p className="text-[11px] text-red-500 mt-0.5">Required for this profile type</p>}
        {!showError && <p className="text-[11px] text-gray-400 mt-0.5">{field.description}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Posting Profiles</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure which accounts are used for each transaction type — Cash, AR, AP, Inventory, and more.
          </p>
        </div>
        <button
          onClick={openAddForm}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Profile
        </button>
      </div>

      {/* Search */}
      <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search profiles..." className="max-w-sm" />

      {/* Profiles Cards */}
      {loading ? (
        <EmptyState icon={<Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />} title="Loading profiles..." />
      ) : error ? (
        <EmptyState icon={<AlertTriangle className="w-10 h-10 text-red-400 mb-3" />} title={<span className="text-red-600 dark:text-red-400">{error}</span>} action={<button onClick={fetchProfiles} className="mt-3 text-sm font-medium text-brand-500">Try again</button>} />
      ) : filteredProfiles.length === 0 ? (
        <EmptyState
          icon={<Layers className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />}
          title={searchQuery ? 'No profiles match your search' : 'No posting profiles yet'}
          action={!searchQuery ? (
            <button onClick={openAddForm} className="mt-2 text-sm font-medium text-brand-500 hover:text-brand-600"><Plus className="w-4 h-4 inline" /> Create your first profile</button>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProfiles.map(profile => {
            return (
              <div
                key={profile.id}
                className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-brand-50 dark:bg-brand-950/30 p-2.5">
                      <Layers className="w-5 h-5 text-brand-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{profile.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {invoiceTypeLabel[profile.invoiceType] || capitalize(profile.invoiceType)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {profile.isDefault && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400">
                        <Check className="w-3 h-3" /> Default
                      </span>
                    )}
                    <StatusBadge label={profile.isActive ? 'Active' : 'Inactive'} color={profile.isActive ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400' : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'} />
                  </div>
                </div>

                {/* Account Mappings */}
                <div className="grid grid-cols-3 gap-2 mt-4 text-[11px]">
                  {accountFields.map(f => {
                    const code = (profile as any)[f.key]
                    const accountName = code
                      ? accounts.find(a => a.code === code)?.name
                      : null
                    return (
                      <div key={f.key} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-2.5 py-1.5">
                        <p className="text-gray-500 dark:text-gray-400">{f.label}</p>
                        <p className={`font-mono font-medium mt-0.5 truncate ${
                          code
                            ? 'text-gray-900 dark:text-white'
                            : 'text-gray-300 dark:text-gray-600 italic'
                        }`}>
                          {code ? `${code}${accountName ? ` · ${accountName}` : ''}` : 'Not set'}
                        </p>
                      </div>
                    )
                  })}
                </div>

                {/* Default entry category */}
                {profile.entryCategoryId && (
                  <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                    Entry category:{' '}
                    <span className="text-gray-900 dark:text-white font-medium">
                      {categories.find(c => c.id === profile.entryCategoryId)?.code || `#${profile.entryCategoryId}`}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-1 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <button
                    onClick={() => openEditForm(profile)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                    title="Edit profile"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(profile)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    title="Delete profile"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* --- Add/Edit Modal --- */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} className="max-w-2xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {editingProfile ? 'Edit Posting Profile' : 'Create Posting Profile'}
        </h3>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1 custom-scrollbar">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Standard Sales"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Invoice Type</label>
              <select
                value={formData.invoiceType}
                onChange={e => setFormData({ ...formData, invoiceType: e.target.value as InvoiceType })}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              >
                {invoiceTypes.map(t => (
                  <option key={t} value={t}>{invoiceTypeLabel[t]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6 py-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isDefault}
                onChange={e => setFormData({ ...formData, isDefault: e.target.checked })}
                className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Set as default</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
            </label>
          </div>

          {/* Section: Account Mappings (direction-aware §6.1) */}
          <div>
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1 pb-2 border-b border-gray-200 dark:border-gray-700">
              Account Mappings {isArSide(formData.invoiceType) ? '(AR side)' : '(AP side)'}
            </h4>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">
              {isArSide(formData.invoiceType)
                ? `${invoiceTypeLabel[formData.invoiceType]} posts receivables — Accounts Payable is not needed for this profile.`
                : `${invoiceTypeLabel[formData.invoiceType]} posts payables — Accounts Receivable is not needed for this profile.`}
            </p>
            <div className="grid grid-cols-2 gap-4">
              {accountFields
                .filter(f => {
                  if (f.key === 'accountsReceivableCode') return isArSide(formData.invoiceType)
                  if (f.key === 'accountsPayableCode') return !isArSide(formData.invoiceType)
                  return f.required
                })
                .map(field => {
                  const usedCodes = accountFields
                    .filter(f => (formData as any)[f.key] && f.key !== field.key)
                    .map(f => (formData as any)[f.key])
                  return (
                    <AccountSelector
                      key={field.key}
                      field={field}
                      value={(formData as any)[field.key] || ''}
                      onChange={v => setFormData({ ...formData, [field.key]: v })}
                      exclude={usedCodes}
                    />
                  )
                })}
            </div>
          </div>

          {/* Section: Optional stock mappings (§6.2) */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer py-2">
              <input
                type="checkbox"
                checked={formData.enableStockAccounts}
                onChange={e => {
                  const on = e.target.checked
                  setFormData({
                    ...formData,
                    enableStockAccounts: on,
                    ...(on ? {} : { inventoryAccountCode: '', cogsAccountCode: '' }),
                  })
                }}
                className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Enable stock account mappings (Inventory / COGS)</span>
            </label>
            {formData.enableStockAccounts && (
              <div className="grid grid-cols-2 gap-4 mt-2">
                {accountFields.filter(f => !f.required).map(field => (
                  <AccountSelector
                    key={field.key}
                    field={field}
                    value={(formData as any)[field.key] || ''}
                    onChange={v => setFormData({ ...formData, [field.key]: v })}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Entry category mapping (§6.6) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Default Entry Category</label>
            <select
              value={formData.entryCategoryId || ''}
              onChange={e => setFormData({ ...formData, entryCategoryId: e.target.value ? Number(e.target.value) : null })}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            >
              <option value="">— None —</option>
              {categories.filter(c => c.isActive).map(c => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-0.5">Entries auto-created from invoices via this profile get this category.</p>
          </div>

          {/* Form error */}
          {formError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2">
              <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !formData.name.trim()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : editingProfile ? 'Update Profile' : 'Create Profile'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* --- Delete Confirmation Modal --- */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} className="max-w-md p-6">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-50 dark:bg-red-950/50 p-2.5">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Profile</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{deleteTarget.name}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
              Invoices using this profile will need to be updated.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button size="sm" onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Delete</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
