'use client'
import { SearchInput, StatusBadge, EmptyState } from '@/components/ui'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {  Plus, Edit3, Trash2, Building2, Users, AlertTriangle, MoreVertical, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type { CostCenter } from '@/types/erp'

interface CostCenterFormData {
  code: string
  name: string
  parentId: number | null
}

const emptyForm: CostCenterFormData = { code: '', name: '', parentId: null }

export default function CostCentersPage() {
  const toast = useToast()
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editingCenter, setEditingCenter] = useState<CostCenter | null>(null)
  const [formData, setFormData] = useState<CostCenterFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<CostCenter | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const menuBtnRef = useRef<HTMLButtonElement | null>(null)

  const fetchCostCenters = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cost-centers')
      if (res.ok) {
        const json = await res.json()
        if (json.success) setCostCenters(json.data)
      }
    } catch {
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCostCenters() }, [fetchCostCenters])

  const filteredCenters = useMemo(() => {
    let list = costCenters
    if (statusFilter === 'active') list = list.filter(cc => cc.isActive)
    if (statusFilter === 'inactive') list = list.filter(cc => !cc.isActive)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(cc =>
        cc.code.toLowerCase().includes(q) || cc.name.toLowerCase().includes(q)
      )
    }
    return list
  }, [costCenters, statusFilter, searchQuery])

  const topLevel = filteredCenters.filter(cc => !cc.parentId)
  const getChildren = (parentId: number) => filteredCenters.filter(cc => cc.parentId === parentId)
  const hasChildren = (id: number) => costCenters.some(cc => cc.parentId === id)

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const openAddForm = () => {
    setEditingCenter(null)
    setFormData(emptyForm)
    setShowForm(true)
  }

  const openAddSub = (parent: CostCenter) => {
    setEditingCenter(null)
    setFormData({ code: '', name: '', parentId: parent.id })
    setShowForm(true)
  }

  const openEditForm = (center: CostCenter) => {
    setEditingCenter(center)
    setFormData({
      code: center.code,
      name: center.name,
      parentId: center.parentId,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const url = editingCenter ? `/api/cost-centers/${editingCenter.id}` : '/api/cost-centers'
      const method = editingCenter ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (res.ok) {
        setShowForm(false)
        fetchCostCenters()
        toast.success(editingCenter
          ? `Cost center "${formData.name}" updated`
          : `Cost center "${formData.name}" created`)
      } else {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Save failed (HTTP ${res.status})`)
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save cost center')
    } finally {
      setSaving(false)
    }
  }

  // --- Delete (with undo) ---
  const restoreCostCenter = async (center: CostCenter) => {
    try {
      const res = await fetch('/api/cost-centers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: center.code,
          name: center.name,
          parentId: center.parentId,
          responsiblePerson: center.responsiblePerson,
          description: center.description,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Restore failed')
      }
      fetchCostCenters()
      toast.success(`Cost center "${center.name}" restored`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to restore cost center')
      fetchCostCenters()
    }
  }

  const handleDelete = async (center: CostCenter) => {
    if (hasChildren(center.id)) return
    setDeleteError('')
    const deleted = center
    try {
      const version = center.version
      const res = await fetch(`/api/cost-centers/${center.id}?version=${version}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Delete failed (HTTP ${res.status})`)
      }
      setDeleteConfirm(null)
      fetchCostCenters()
      toast.success(`Cost center "${deleted.name}" deleted`, {
        action: { label: 'Undo', onClick: () => restoreCostCenter(deleted) },
        duration: 8000,
      })
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete cost center')
      toast.error(err.message || 'Failed to delete cost center')
    }
  }

  const openMenu = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    const btn = e.currentTarget as HTMLButtonElement
    const rect = btn.getBoundingClientRect()
    const menuW = 160
    const menuH = 88
    let top = rect.bottom + 4
    let left = rect.right - menuW
    if (top + menuH > window.innerHeight) {
      top = Math.max(4, rect.top - menuH - 4)
    }
    if (left < 4) left = 4
    if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 4
    setMenuStyle({ position: 'fixed', top: `${top}px`, left: `${left}px`, zIndex: 50 })
    setMenuOpenId(menuOpenId === id ? null : id)
    menuBtnRef.current = btn
  }

  const renderRows = (cc: CostCenter, depth = 0): React.ReactNode[] => {
    const accHasChildren = hasChildren(cc.id)
    const isOpen = expanded.has(cc.id)
    const children = accHasChildren ? getChildren(cc.id) : []
    const depthPadding = Math.min(depth, 10)

    const row = (
      <tr key={cc.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
        <td className="py-2 px-3">
          <div className={`flex items-center gap-1.5 ${accHasChildren ? 'cursor-pointer' : ''}`} style={{ paddingLeft: `${depthPadding * 20}px` }} onClick={accHasChildren ? () => toggleExpand(cc.id) : undefined}>
            {accHasChildren ? (
              <button
                className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-14 shrink-0">{cc.code}</span>
            <span className={`text-sm font-medium truncate ${cc.isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500 line-through'}`}>
              {cc.name}
            </span>
            {cc.parentId && (
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                {costCenters.find(c => c.id === cc.parentId)?.code} — {costCenters.find(c => c.id === cc.parentId)?.name}
              </div>
            )}
          </div>
        </td>
        <td className="py-2 px-3">
          {cc.responsiblePerson ? (
            <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>{cc.responsiblePerson}</span>
            </div>
          ) : (
            <span className="text-sm text-gray-400">—</span>
          )}
        </td>
        <td className="py-2 px-3 text-center">
          <StatusBadge label={cc.isActive ? 'Active' : 'Inactive'} color={cc.isActive ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400' : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'} />
        </td>
        <td className="py-2 px-3 text-right">
          <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
            <button onClick={() => openAddSub(cc)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
              title="Add child cost center">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <div className="relative">
              <button onClick={(e) => openMenu(e, cc.id)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </td>
      </tr>
    )

    if (accHasChildren && isOpen) {
      return [row, ...children.flatMap(child => renderRows(child, depth + 1))]
    }
    return [row]
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Cost Centers</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage cost centers and departmental budgets.</p>
        </div>
        <button onClick={openAddForm} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Add Cost Center
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-2.5">
        {(['all', 'active', 'inactive'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              statusFilter === f
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-sm'
                : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >{f}</button>
        ))}
        <div className="flex-1 min-w-0" />
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search cost centers..." className="max-w-xs w-full" compact />
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        {loading ? (
          <EmptyState icon={<Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />} title="Loading cost centers..." />
        ) : topLevel.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />}
            title="No cost centers found"
            action={<button onClick={openAddForm} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-600 transition-colors"><Plus className="w-4 h-4" /> Add first cost center</button>}
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cost Center</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Responsible</th>
                <th className="text-center py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Status</th>
                <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-48">Actions</th>
              </tr>
            </thead>
            <tbody>
              {topLevel.flatMap(cc => renderRows(cc))}
            </tbody>
          </table>
        )}
      </div>

      {menuOpenId !== null && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
          <div style={menuStyle} className="w-40 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
            {(() => {
              const cc = costCenters.find(c => c.id === menuOpenId)
              if (!cc) return null
              return (
                <>
                  <button onClick={() => { setMenuOpenId(null); openEditForm(cc) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button onClick={() => { setMenuOpenId(null); setDeleteError(''); setDeleteConfirm(cc) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 border-t border-gray-100 dark:border-gray-800">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </>
              )
            })()}
          </div>
        </>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} className="max-w-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {editingCenter ? 'Edit Cost Center' : formData.parentId ? 'Add Child Cost Center' : 'Add Cost Center'}
        </h3>
        <div className="space-y-4">
          {/* Parent — first field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Parent Cost Center</label>
            {editingCenter ? (
              <select value={formData.parentId ?? ''} onChange={e => setFormData({ ...formData, parentId: e.target.value ? Number(e.target.value) : null })}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                <option value="">None (Top-level)</option>
                {costCenters.filter(cc => cc.id !== editingCenter.id).map(cc => (
                  <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
                ))}
              </select>
            ) : (
              <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                {formData.parentId ? (
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {costCenters.find(cc => cc.id === formData.parentId)?.code} — {costCenters.find(cc => cc.id === formData.parentId)?.name}
                  </span>
                ) : 'None (Top-level)'}
              </div>
            )}
          </div>

          {/* Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Code</label>
            <input type="text" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })}
              placeholder="e.g. CC-007"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name</label>
            <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Cost center name"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingCenter ? 'Update Cost Center' : 'Save Cost Center'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!deleteConfirm} onClose={() => { setDeleteConfirm(null); setDeleteError('') }} className="max-w-md p-6">
        {deleteConfirm && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-50 dark:bg-red-950/50 p-2.5">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Cost Center</h3>
            </div>
            {hasChildren(deleteConfirm.id) ? (
              <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                This cost center has child cost centers and cannot be deleted. Remove all children first.
              </p>
            ) : deleteError ? (
              <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                {deleteError}
              </p>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Are you sure you want to delete <strong>{deleteConfirm.code} - {deleteConfirm.name}</strong>? You'll be able to undo this right after.
              </p>
            )}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => { setDeleteConfirm(null); setDeleteError('') }}>Cancel</Button>
              {!hasChildren(deleteConfirm.id) && (
                <Button size="sm" onClick={() => handleDelete(deleteConfirm)} className="bg-red-500 hover:bg-red-600">
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
