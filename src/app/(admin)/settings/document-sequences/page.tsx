'use client'
import { formatDate } from '@/lib/formatters'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Edit3, AlertTriangle, Loader2, Search,
  RefreshCw, FileDigit,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { EmptyState } from '@/components/ui'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type { DocumentSequence } from '@/types/erp'

const docTypeLabels: Record<string, string> = {
  invoice_sales: 'Sales Invoice',
  invoice_purchase: 'Purchase Invoice',
  invoice_credit_note: 'Credit Note',
  invoice_debit_note: 'Debit Note',
  entry_journal: 'Journal Entry',
  entry_payment: 'Payment Entry',
  entry_receipt: 'Receipt Entry',
  movement_receipt: 'Stock Receipt',
  movement_issue: 'Stock Issue',
  movement_transfer: 'Stock Transfer',
  movement_adjustment: 'Stock Adjustment',
  movement_return: 'Stock Return',
}

interface EditFormData {
  prefix: string
  nextNumber: number
  padding: number
}

export default function DocumentSequencesPage() {
  const toast = useToast()
  const [sequences, setSequences] = useState<DocumentSequence[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [editingSequence, setEditingSequence] = useState<DocumentSequence | null>(null)
  const [editForm, setEditForm] = useState<EditFormData>({ prefix: '', nextNumber: 1, padding: 6 })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const fetchSequences = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/document-sequences')
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      if (json.success) setSequences(json.data)
    } catch { setError('Failed to load document sequences.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchSequences() }, [fetchSequences])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return sequences
    const q = searchQuery.toLowerCase()
    return sequences.filter(s =>
      s.documentType.toLowerCase().includes(q) ||
      (docTypeLabels[s.documentType] || s.documentType).toLowerCase().includes(q)
    )
  }, [sequences, searchQuery])

  const openEdit = (seq: DocumentSequence) => {
    setEditingSequence(seq)
    setEditForm({ prefix: seq.prefix, nextNumber: seq.nextNumber, padding: seq.padding })
    setSaveError('')
  }

  const handleSave = async () => {
    if (!editingSequence) return
    if (!editForm.prefix.trim()) { setSaveError('Prefix is required'); return }
    if (editForm.nextNumber < 1) { setSaveError('Next number must be ≥ 1'); return }
    if (editForm.padding < 3 || editForm.padding > 10) { setSaveError('Padding must be between 3 and 10'); return }

    setSaving(true); setSaveError('')
    try {
      const res = await fetch('/api/document-sequences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingSequence.id,
          prefix: editForm.prefix.trim(),
          nextNumber: editForm.nextNumber,
          padding: editForm.padding,
          version: editingSequence.version,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update')
      }
      const json = await res.json()
      if (json.success) setSequences(json.data)
      setEditingSequence(null)
      toast.success('Document sequence updated successfully')
    } catch (err: any) {
      setSaveError(err.message)
      toast.error(err.message || 'Failed to update document sequence')
    } finally { setSaving(false) }
  }

  const formatSequence = (seq: DocumentSequence) => {
    const example = seq.prefix + String(seq.nextNumber).padStart(seq.padding, '0')
    return example
  }

  const formatUpdatedAt = (iso: string) => {
    if (!iso) return '—'
    return formatDate(iso, 'datetime')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Document Sequences</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure auto-numbering prefixes, next numbers, and padding for invoices, entries, and movements.
          </p>
        </div>
        <button onClick={fetchSequences}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search sequences..."
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-9 pr-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
      </div>

      {/* Success feedback is handled by global toasts */}

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        {loading ? (
          <EmptyState icon={<Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />} title="Loading sequences..." />
        ) : error ? (
          <EmptyState icon={<AlertTriangle className="w-10 h-10 text-red-400 mb-3" />} title={<span className="text-red-600 dark:text-red-400">{error}</span>} action={<button onClick={fetchSequences} className="mt-3 text-sm font-medium text-brand-500">Try again</button>} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<FileDigit className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />} title={searchQuery ? 'No sequences match your search' : 'No document sequences found'} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Document Type</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Prefix</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Next Number</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Padding</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Example</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Updated</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map(seq => (
                <tr key={seq.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                    {docTypeLabels[seq.documentType] || seq.documentType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </td>
                  <td className="py-3 px-4 text-sm font-mono text-brand-600 dark:text-brand-400">{seq.prefix}</td>
                  <td className="py-3 px-4 text-sm text-right font-mono font-semibold text-gray-900 dark:text-white">{seq.nextNumber}</td>
                  <td className="py-3 px-4 text-sm text-center font-mono text-gray-500 dark:text-gray-400">{seq.padding}</td>
                  <td className="py-3 px-4 text-sm font-mono text-gray-600 dark:text-gray-300">{formatSequence(seq)}</td>
                  <td className="py-3 px-4 text-xs text-gray-500 dark:text-gray-400">{formatUpdatedAt(seq.updatedAt)}</td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => openEdit(seq)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors" title="Edit sequence">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Modal */}
      <Modal isOpen={!!editingSequence} onClose={() => setEditingSequence(null)} className="max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Edit Document Sequence</h3>
        {editingSequence && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {docTypeLabels[editingSequence.documentType] || editingSequence.documentType}
          </p>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Prefix <span className="text-red-400">*</span></label>
            <input type="text" value={editForm.prefix}
              onChange={e => setEditForm({ ...editForm, prefix: e.target.value })}
              placeholder="e.g. INV-"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Next Number <span className="text-red-400">*</span></label>
              <input type="number" value={editForm.nextNumber} min={1}
                onChange={e => setEditForm({ ...editForm, nextNumber: Math.max(1, Number(e.target.value) || 1) })}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
              <p className="text-[11px] text-gray-400 mt-0.5">Next document will use this number</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Padding <span className="text-red-400">*</span></label>
              <input type="number" value={editForm.padding} min={3} max={10}
                onChange={e => setEditForm({ ...editForm, padding: Math.max(3, Math.min(10, Number(e.target.value) || 6)) })}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
              <p className="text-[11px] text-gray-400 mt-0.5">Zero-padding (e.g. 6 → 000001)</p>
            </div>
          </div>
          {editingSequence && (
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Example output:</p>
              <p className="text-sm font-mono font-semibold text-brand-600 dark:text-brand-400">
                {editForm.prefix}{String(editForm.nextNumber).padStart(editForm.padding, '0')}
              </p>
            </div>
          )}
          {saveError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2">
              <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" size="sm" onClick={() => setEditingSequence(null)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !editForm.prefix.trim()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : 'Update Sequence'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
