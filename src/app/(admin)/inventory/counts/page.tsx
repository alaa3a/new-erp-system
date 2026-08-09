'use client'
import { ModalHeader, EmptyState } from '@/components/ui'
import { formatDate } from '@/lib/formatters'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Loader2, AlertTriangle, ClipboardList, CheckCircle2, Warehouse as WarehouseIcon, Trash2,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type { Warehouse } from '@/types/erp'

interface CountLine {
  id: number
  productId: number
  productName: string
  productCode: string
  systemQuantity: number
  countedQuantity: number
  variance: number
}

interface Count {
  id: number
  countNumber: string
  warehouseId: number
  warehouseName: string
  countedByName: string
  status: 'draft' | 'submitted' | 'adjusted'
  notes: string
  countedAt: string | null
  createdAt: string
}

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400', text: '', label: 'Draft' },
  submitted: { bg: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400', text: '', label: 'Submitted' },
  adjusted: { bg: 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400', text: '', label: 'Adjusted' },
}

export default function InventoryCountsPage() {
  const toast = useToast()
  const [counts, setCounts] = useState<Count[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // New count modal
  const [showNew, setShowNew] = useState(false)
  const [newWarehouseId, setNewWarehouseId] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [creating, setCreating] = useState(false)

  // Count detail / edit
  const [openCount, setOpenCount] = useState<Count | null>(null)
  const [lines, setLines] = useState<CountLine[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fetchCounts = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/inventory/counts')
      if (!res.ok) throw new Error('Failed to load counts')
      const json = await res.json(); if (json.success) setCounts(json.data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load')
    } finally { setLoading(false) }
  }, [])

  const fetchWarehouses = useCallback(async () => {
    try {
      const res = await fetch('/api/warehouses')
      if (res.ok) { const json = await res.json(); if (json.success) setWarehouses(json.data) }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchCounts(); fetchWarehouses() }, [fetchCounts, fetchWarehouses])

  const createCount = async () => {
    if (!newWarehouseId) return
    setCreating(true)
    try {
      const res = await fetch('/api/inventory/counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId: Number(newWarehouseId), notes: newNotes }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create count')
      toast.success('Cycle count created')
      setShowNew(false); setNewWarehouseId(''); setNewNotes('')
      fetchCounts()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create count')
    } finally { setCreating(false) }
  }

  const openDetail = async (count: Count) => {
    setOpenCount(count); setDetailLoading(true)
    try {
      const res = await fetch(`/api/inventory/counts/${count.id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setLines(json.data.lines || [])
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load count')
      setOpenCount(null)
    } finally { setDetailLoading(false) }
  }

  const updateQuantity = (lineId: number, value: number) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l
      const countedQuantity = Math.max(0, value)
      return { ...l, countedQuantity, variance: countedQuantity - l.systemQuantity }
    }))
  }

  const saveDraft = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/inventory/counts/${openCount!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: lines.map(l => ({ id: l.id, countedQuantity: l.countedQuantity })) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save')
      toast.success('Count quantities saved')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  const submitCount = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/inventory/counts/${openCount!.id}/submit`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to submit')
      toast.success(json.data?.message || 'Count submitted — stock adjusted')
      setOpenCount(null)
      fetchCounts()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit')
    } finally { setSubmitting(false) }
  }

  const variances = lines.filter(l => l.variance !== 0)
  const stockValue = lines.reduce((s, l) => s + l.variance, 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Cycle Counts</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Physical inventory counts — compare system quantities with what is actually in the warehouse.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Count
        </button>
      </div>

      {/* Counts table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading counts...</p>
            </div>
          ) : error ? (
            <EmptyState icon={<AlertTriangle className="w-10 h-10 text-red-400 mb-3" />} title={<span className="text-red-600 dark:text-red-400">{error}</span>} action={<button onClick={fetchCounts} className="mt-3 text-sm font-medium text-brand-500">Try again</button>} />
          ) : counts.length === 0 ? (
            <EmptyState icon={<ClipboardList className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />} title="No counts yet" action={<button onClick={() => setShowNew(true)} className="mt-2 text-sm font-medium text-brand-500"><Plus className="w-4 h-4 inline" /> Start your first count</button>} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Count #</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Warehouse</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Counted By</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Created</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Notes</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {counts.map(c => {
                  const st = statusStyles[c.status] || statusStyles.draft
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-3 px-4 text-xs font-mono font-medium text-brand-600 dark:text-brand-400">{c.countNumber}</td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">{c.warehouseName}</td>
                      <td className="py-3 px-4 text-xs text-gray-600 dark:text-gray-400">{c.countedByName}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${st.bg}`}>{st.label}</span>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDate(c.createdAt)}</td>
                      <td className="py-3 px-4 text-xs text-gray-500 dark:text-gray-400 max-w-[180px] truncate">{c.notes || '—'}</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => openDetail(c)}
                          disabled={c.status !== 'draft'}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={c.status === 'draft' ? 'Open count' : 'Already submitted'}
                        >
                          <ClipboardList className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* New count modal */}
      <Modal isOpen={showNew} onClose={() => setShowNew(false)} className="max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-brand-500" /> New Cycle Count
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Warehouse *</label>
            <select
              value={newWarehouseId}
              onChange={e => setNewWarehouseId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            >
              <option value="">-- Select warehouse --</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Notes</label>
            <textarea
              rows={2}
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
              placeholder="Optional notes"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button size="sm" onClick={createCount} disabled={creating || !newWarehouseId}>
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              {creating ? 'Creating...' : 'Create Count Sheet'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Count detail modal */}
      <Modal isOpen={!!openCount} onClose={() => setOpenCount(null)} className="max-w-3xl p-0" showCloseButton={false}>
        {openCount && (
          <>
            <ModalHeader
              title={openCount.countNumber}
              subtitle={<span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><WarehouseIcon className="w-3 h-3" /> {openCount.warehouseName} · {formatDate(openCount.createdAt)}</span>}
              onClose={() => setOpenCount(null)}
            />
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {detailLoading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /></div>
              ) : (
                <>
                  {/* Summary strip */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Items counted</p>
                      <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{lines.length}</p>
                    </div>
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-3">
                      <p className="text-xs text-amber-600 dark:text-amber-400">Variances</p>
                      <p className="mt-1 text-xl font-semibold text-amber-600 dark:text-amber-400">{variances.length}</p>
                    </div>
                    <div className={`rounded-xl p-3 ${stockValue === 0 ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}>
                      <p className={`text-xs ${stockValue === 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>Net variance (units)</p>
                      <p className={`mt-1 text-xl font-semibold ${stockValue === 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {stockValue > 0 ? '+' : ''}{stockValue}
                      </p>
                    </div>
                  </div>

                  {/* Count sheet */}
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                          <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Product</th>
                          <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">System</th>
                          <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Counted</th>
                          <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Variance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {lines.map(l => (
                          <tr key={l.id} className={l.variance !== 0 ? 'bg-red-50/40 dark:bg-red-950/10' : ''}>
                            <td className="py-2.5 px-4">
                              <p className="text-sm text-gray-900 dark:text-white">{l.productName}</p>
                              <p className="text-[11px] text-gray-400 font-mono">{l.productCode}</p>
                            </td>
                            <td className="py-2.5 px-4 text-right text-sm text-gray-600 dark:text-gray-400">{l.systemQuantity}</td>
                            <td className="py-2.5 px-4 text-right">
                              <input
                                type="number" min="0"
                                value={l.countedQuantity}
                                disabled={openCount.status !== 'draft'}
                                onChange={e => updateQuantity(l.id, Number(e.target.value) || 0)}
                                className="w-24 ml-auto text-right rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all disabled:opacity-50"
                              />
                            </td>
                            <td className={`py-2.5 px-4 text-right text-sm font-semibold ${l.variance > 0 ? 'text-green-600' : l.variance < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                              {l.variance > 0 ? '+' : ''}{l.variance}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {variances.length > 0
                  ? `Submitting will adjust stock for ${variances.length} item(s) with variances.`
                  : 'No variances — submitting is a no-op.'}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpenCount(null)}>Close</Button>
                {openCount.status === 'draft' && (
                  <>
                    <Button variant="outline" size="sm" onClick={saveDraft} disabled={saving || detailLoading}>
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      {saving ? 'Saving...' : 'Save Draft'}
                    </Button>
                    <Button size="sm" onClick={submitCount} disabled={submitting || detailLoading} className="bg-green-500 hover:bg-green-600">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {submitting ? 'Submitting...' : 'Submit Count'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
