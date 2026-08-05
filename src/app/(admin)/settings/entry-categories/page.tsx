'use client'
import { SearchInput, StatusBadge, EmptyState } from '@/components/ui'

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import {
  Plus, Edit3, Trash2, AlertTriangle, Loader2,
  Layers, CheckCircle, MoreVertical, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type { EntryCategory } from '@/types/erp'

interface CategoryFormData {
  code: string
  name: string
  description: string
  isActive: boolean
}

const emptyForm = (): CategoryFormData => ({ code: '', name: '', description: '', isActive: true })

type SortKey = 'code' | 'name' | 'status'
type SortDir = 'asc' | 'desc'

const statusFilters = ['all', 'active', 'inactive'] as const
type StatusFilter = typeof statusFilters[number]

export default function EntryCategoriesPage() {
  const toast = useToast()
  const [categories, setCategories] = useState<EntryCategory[]>([])
  const [usageMap, setUsageMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('code')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [showForm, setShowForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<EntryCategory | null>(null)
  const [formData, setFormData] = useState<CategoryFormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formTouched, setFormTouched] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<EntryCategory | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const menuBtnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const fetchCategories = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/entry-categories')
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Request failed')
      setCategories(json.data)
      setUsageMap(json.usage || {})
    } catch { setError('Failed to load entry categories.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  // ── Filtering + sorting ──
  const filtered = useMemo(() => {
    let list = categories
    if (statusFilter !== 'all') {
      list = list.filter(c => statusFilter === 'active' ? c.isActive : !c.isActive)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(c =>
        c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
      )
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const av = sortKey === 'status' ? (a.isActive ? 1 : 0) : a[sortKey]
      const bv = sortKey === 'status' ? (b.isActive ? 1 : 0) : b[sortKey]
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir
    })
  }, [categories, searchQuery, statusFilter, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // ── Row action menu (positioned like tax-setup / CoA) ──
  const positionMenu = useCallback(() => {
    const btn = menuBtnRef.current
    if (!btn || !btn.isConnected) return
    const rect = btn.getBoundingClientRect()
    const menuW = menuRef.current?.offsetWidth || 160
    const menuH = menuRef.current?.offsetHeight || 120
    let top = rect.bottom + 4
    let left = rect.right - menuW
    if (top + menuH > window.innerHeight) top = Math.max(4, rect.top - menuH - 4)
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

  useLayoutEffect(() => {
    if (menuOpenId !== null) positionMenu()
  }, [menuOpenId, filtered, positionMenu])

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

  // ── Form ──
  const openAdd = () => {
    setEditingCategory(null); setFormData(emptyForm()); setFormTouched(false); setFormError(''); setShowForm(true)
  }

  const openEdit = (cat: EntryCategory) => {
    setEditingCategory(cat)
    setFormData({ code: cat.code, name: cat.name, description: cat.description || '', isActive: cat.isActive })
    setFormTouched(false); setFormError(''); setShowForm(true)
  }

  const handleSave = async () => {
    setFormTouched(true)
    if (!formData.code.trim() || !formData.name.trim()) {
      setFormError('Code and name are required')
      return
    }
    setSaving(true); setFormError('')
    try {
      const url = editingCategory ? `/api/entry-categories/${editingCategory.id}` : '/api/entry-categories'
      const method = editingCategory ? 'PUT' : 'POST'
      const body: any = { ...formData }
      if (editingCategory) body.version = editingCategory.version
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      setShowForm(false)
      fetchCategories()
      toast.success(editingCategory ? `Entry category "${formData.name}" updated` : `Entry category "${formData.name}" created`)
    } catch (err: any) {
      setFormError(err.message)
      toast.error(err.message || 'Failed to save entry category')
    } finally { setSaving(false) }
  }

  // ── Delete (soft delete, with undo) ──
  const restoreCategory = async (category: EntryCategory) => {
    try {
      const freshRes = await fetch(`/api/entry-categories/${category.id}`)
      if (!freshRes.ok) throw new Error('Failed to load category')
      const freshJson = await freshRes.json()
      const fresh = freshJson.data || freshJson
      const res = await fetch(`/api/entry-categories/${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: category.code,
          name: category.name,
          description: category.description || '',
          isActive: true,
          version: fresh.version,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Restore failed')
      }
      fetchCategories()
      toast.success(`Entry category "${category.name}" restored`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to restore entry category')
      fetchCategories()
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const deleted = deleteTarget
    setDeleteError('')
    try {
      const res = await fetch(`/api/entry-categories/${deleted.id}?version=${deleted.version}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Delete failed')
      }
      setDeleteTarget(null)
      setCategories(prev => prev.filter(c => c.id !== deleted.id))
      toast.success(`Entry category "${deleted.name}" deleted`, {
        action: { label: 'Undo', onClick: () => restoreCategory(deleted) },
        duration: 8000,
      })
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete')
      toast.error(err?.message || 'Failed to delete entry category')
    }
  }

  // ── Usage cell with hover detail ──
  function UsageCell({ category }: { category: EntryCategory }) {
    const count = usageMap[category.id] ?? 0
    const [hover, setHover] = useState(false)
    if (count === 0) return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
    return (
      <div className="relative inline-block" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${count > 0 ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400' : ''}`}>
          {count} entr{count === 1 ? 'y' : 'ies'}
        </span>
        {hover && (
          <div className="absolute z-30 left-0 top-full mt-1 w-52 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-xl text-xs">
            <p className="text-gray-600 dark:text-gray-300">
              Used by <strong className="text-gray-900 dark:text-white">{count}</strong> journal entr{count === 1 ? 'y' : 'ies'}. Delete is blocked while in use.
            </p>
          </div>
        )}
      </div>
    )
  }

  const menuCategory = menuOpenId !== null ? categories.find(c => c.id === menuOpenId) : null
  const menuBlocked = menuCategory ? (usageMap[menuCategory.id] ?? 0) > 0 : false

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
      onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k ? (
          sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </span>
    </th>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Entry Categories</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Classify journal entries into categories for reporting and filtering. Categories in use by entries cannot be deleted.
          </p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Add Category
        </button>
      </div>

      {/* Search + status filter */}
      <div className="flex items-center gap-3 flex-wrap rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-2.5">
        <div className="flex items-center gap-1">
          {statusFilters.map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                statusFilter === f
                  ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}>
              {f}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-0" />
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search by code, name, or description..." className="max-w-xs w-full" compact />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        {loading ? (
          <EmptyState icon={<Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />} title="Loading categories..." />
        ) : error ? (
          <EmptyState icon={<AlertTriangle className="w-10 h-10 text-red-400 mb-3" />} title={<span className="text-red-600 dark:text-red-400">{error}</span>} action={<button onClick={fetchCategories} className="mt-3 text-sm font-medium text-brand-500">Try again</button>} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Layers className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />}
            title={searchQuery || statusFilter !== 'all' ? 'No categories match your filters' : 'No entry categories yet'}
            action={!searchQuery && statusFilter === 'all' ? (
              <button onClick={openAdd} className="mt-2 text-sm font-medium text-brand-500"><Plus className="w-4 h-4 inline" /> Add your first category</button>
            ) : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <SortHeader label="Code" k="code" />
                  <SortHeader label="Name" k="name" />
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Used In</th>
                  <SortHeader label="Status" k="status" />
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map(cat => (
                  <tr key={cat.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="py-3 px-4 text-sm font-mono font-medium text-brand-600 dark:text-brand-400">{cat.code}</td>
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">{cat.name}</td>
                    <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400 max-w-[240px] truncate">{cat.description || '—'}</td>
                    <td className="py-3 px-4 text-center"><UsageCell category={cat} /></td>
                    <td className="py-3 px-4 text-center">
                      {cat.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400">
                          <CheckCircle className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <StatusBadge label="Inactive" color="bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400" size="sm" />
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button onClick={(e) => openMenu(e, cat.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="More actions">
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Row actions menu ── */}
      {menuOpenId !== null && menuCategory && (() => {
        const blocked = menuBlocked
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
            <div ref={menuRef} style={menuStyle} className="w-44 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
              <button onClick={() => { setMenuOpenId(null); openEdit(menuCategory) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={() => { setMenuOpenId(null); setDeleteTarget(menuCategory); setDeleteError('') }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm border-t border-gray-100 dark:border-gray-800 transition-colors ${
                  blocked
                    ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                    : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                }`}
                title={blocked ? 'In use — cannot delete' : 'Delete'}>
                {blocked ? <AlertTriangle className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                {blocked ? 'Delete blocked' : 'Delete'}
              </button>
            </div>
          </>
        )
      })()}

      {/* Add/Edit Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} className="max-w-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {editingCategory ? 'Edit Entry Category' : 'Add Entry Category'}
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Code <span className="text-red-400">*</span>
              </label>
              <input type="text" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g. SALES"
                className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${
                  formTouched && !formData.code.trim() ? 'border-red-300' : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'
                }`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Category name"
                className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${
                  formTouched && !formData.name.trim() ? 'border-red-300' : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'
                }`} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
            <input type="text" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="What this category is used for"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
          </label>
          {formError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2">
              <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !formData.code.trim() || !formData.name.trim()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : editingCategory ? 'Update Category' : 'Create Category'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} className="max-w-md p-6">
        {deleteTarget && (() => {
          const count = usageMap[deleteTarget.id] ?? 0
          const blocked = count > 0
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-full p-2.5 ${blocked ? 'bg-amber-50 dark:bg-amber-950/50' : 'bg-red-50 dark:bg-red-950/50'}`}>
                  <AlertTriangle className={`w-5 h-5 ${blocked ? 'text-amber-500' : 'text-red-500'}`} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Category</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{deleteTarget.code} - {deleteTarget.name}</p>
                </div>
              </div>
              {blocked ? (
                <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                  This category is used by <strong>{count}</strong> journal entr{count === 1 ? 'y' : 'ies'}. Reassign or delete those entries first before deleting this category.
                </p>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This will soft-delete it.
                </p>
              )}
              {deleteError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2">
                  <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>
                </div>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                {!blocked && <Button size="sm" onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Delete</Button>}
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
