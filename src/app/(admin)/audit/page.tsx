'use client'
import { SearchInput, StatusBadge, ModalHeader } from '@/components/ui'
import { formatDate } from '@/lib/formatters'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import {
   Loader2, AlertTriangle, FileText,
  ChevronDown, ChevronUp, Eye, Activity,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import type { AuditLog } from '@/types/erp'

// ─── Constants ─────────────────────────────────────────────────────────

const actionStyles: Record<string, string> = {
  create: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400',
  update: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  delete: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  post: 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400',
  cancel: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
}

const entityTypeLabels: Record<string, string> = {
  account: 'Account',
  invoice: 'Invoice',
  entry: 'Entry',
  partner: 'Partner',
  product: 'Product',
  warehouse: 'Warehouse',
  cost_center: 'Cost Center',
  tax_code: 'Tax Code',
  posting_profile: 'Posting Profile',
  fiscal_period: 'Fiscal Period',
  payment_term: 'Payment Term',
  user: 'User',
}

const entityTypes = [
  { value: '', label: 'All Types' },
  ...Object.entries(entityTypeLabels).map(([value, label]) => ({ value, label })),
]

const actions = [
  { value: '', label: 'All Actions' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'post', label: 'Post' },
  { value: 'cancel', label: 'Cancel' },
]


// ─── Main Component ─────────────────────────────────────────────────────

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [entityTypeFilter, setEntityTypeFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Expandable rows
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Detail modal
  const [detailLog, setDetailLog] = useState<any | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (entityTypeFilter) params.set('entityType', entityTypeFilter)
      if (actionFilter) params.set('action', actionFilter)

      const res = await fetch(`/api/audit-log?${params.toString()}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json(); if (json.success) setLogs(json.data)
    } catch (err: any) {
      setError(err.message || 'Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }, [entityTypeFilter, actionFilter])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // Client-side search
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs
    const q = searchQuery.toLowerCase()
    return logs.filter(l =>
      (l.entityNumber || '').toLowerCase().includes(q) ||
      (l.entityType || '').toLowerCase().includes(q) ||
      (l.firstName || '').toLowerCase().includes(q) ||
      (l.lastName || '').toLowerCase().includes(q) ||
      `${l.firstName} ${l.lastName}`.toLowerCase().includes(q)
    )
  }, [logs, searchQuery])

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const tryParseChanges = (changes: any): Record<string, { from: unknown; to: unknown }> | null => {
    if (!changes) return null
    if (typeof changes === 'string') {
      try { return JSON.parse(changes) } catch { return null }
    }
    if (typeof changes === 'object') return changes as Record<string, { from: unknown; to: unknown }>
    return null
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Audit Log</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Track all system changes — create, update, delete, post, and cancel actions.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Entity type filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1">Type:</span>
          <select value={entityTypeFilter} onChange={e => setEntityTypeFilter(e.target.value)}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
          >
            {entityTypes.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Action filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1">Action:</span>
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
          >
            {actions.map(a => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search user or entity..." className="ml-auto max-w-xs" />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading audit log...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <button onClick={fetchLogs} className="mt-3 text-sm font-medium text-brand-500 hover:text-brand-600">Try again</button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Timestamp</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">User</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Action</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Entity</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Number</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Changes</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center">
                      <FileText className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No audit log entries found</p>
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map(log => {
                    const parsedChanges = tryParseChanges(log.changes)
                    const hasChanges = parsedChanges !== null && Object.keys(parsedChanges).length > 0

                    return (
                      <Fragment key={log.id}>
                        <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                          onClick={() => hasChanges ? toggleExpand(log.id) : null}>

                          <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {formatDate(log.createdAt, 'datetimeSec')}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                            {log.firstName || log.lastName
                              ? `${log.firstName || ''} ${log.lastName || ''}`.trim()
                              : `User #${log.userId}`}
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge label={log.action.charAt(0).toUpperCase() + log.action.slice(1)} color={actionStyles[log.action] || 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400'} />
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                            {entityTypeLabels[log.entityType] || log.entityType}
                          </td>
                          <td className="py-3 px-4 text-sm font-mono text-brand-600 dark:text-brand-400">
                            {log.entityNumber || `#${log.entityId}`}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {hasChanges ? (
                              <span className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400">
                                <Eye className="w-3 h-3" />
                                {Object.keys(parsedChanges).length} field(s)
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setDetailLog(log)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                              title="View details">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>

                        {/* Expanded changes row */}
                        {expandedId === log.id && hasChanges && (
                          <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                            <td colSpan={7} className="py-3 px-6">
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                                  Changed Fields:
                                </p>
                                {Object.entries(parsedChanges).map(([field, change]) => (
                                  <div key={field}
                                    className="grid grid-cols-[140px_1fr_1fr] gap-4 text-xs font-mono">
                                    <span className="text-gray-600 dark:text-gray-400 font-medium">{field}</span>
                                    <div className="rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-2 py-1 text-red-700 dark:text-red-400">
                                      {String(change.from ?? '(empty)')}
                                    </div>
                                    <div className="rounded bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 px-2 py-1 text-green-700 dark:text-green-400">
                                      {String(change.to ?? '(empty)')}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DETAIL MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={!!detailLog} onClose={() => setDetailLog(null)} className="max-w-2xl p-0" showCloseButton={false}>
        <ModalHeader
          title="Audit Log Detail"
          subtitle={detailLog ? formatDate(detailLog.createdAt, 'datetimeSec') : undefined}
          onClose={() => setDetailLog(null)}
          icon={<div className="rounded-lg bg-brand-50 dark:bg-brand-950/30 p-2"><Activity className="w-5 h-5 text-brand-500" /></div>}
        />

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {detailLog && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">User</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
                    {detailLog.firstName || detailLog.lastName
                      ? `${detailLog.firstName || ''} ${detailLog.lastName || ''}`.trim()
                      : `User #${detailLog.userId}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Action</p>
                  <div className="mt-0.5">
                    <span className={`inline-flex text-xs font-medium px-2 py-1 rounded-full ${actionStyles[detailLog.action] || ''}`}>
                      {detailLog.action.charAt(0).toUpperCase() + detailLog.action.slice(1)}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Entity Type</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
                    {entityTypeLabels[detailLog.entityType] || detailLog.entityType}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Entity Number</p>
                  <p className="text-sm font-mono font-medium text-brand-600 dark:text-brand-400 mt-0.5">
                    {detailLog.entityNumber || `#${detailLog.entityId}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Entity ID</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">#{detailLog.entityId}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">IP Address</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{detailLog.ipAddress || '—'}</p>
                </div>
              </div>

              {/* Changes */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Changes</h4>
                {(() => {
                  const changes = tryParseChanges(detailLog.changes)
                  if (!changes || Object.keys(changes).length === 0) {
                    return (
                      <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                        No detailed change data recorded for this action.
                      </p>
                    )
                  }
                  return (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 w-1/4">Field</th>
                            <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Old Value</th>
                            <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">New Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {Object.entries(changes).map(([field, change]) => (
                            <tr key={field} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                              <td className="py-2.5 px-3 text-xs font-mono font-medium text-gray-900 dark:text-white">{field}</td>
                              <td className="py-2.5 px-3 text-xs font-mono text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20">
                                {change.from !== null && change.from !== undefined
                                  ? String(change.from)
                                  : <span className="text-gray-400 italic">(empty)</span>}
                              </td>
                              <td className="py-2.5 px-3 text-xs font-mono text-green-600 dark:text-green-400 bg-green-50/50 dark:bg-green-950/20">
                                {change.to !== null && change.to !== undefined
                                  ? String(change.to)
                                  : <span className="text-gray-400 italic">(empty)</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })()}
              </div>

              {/* User agent */}
              {detailLog.userAgent && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">User Agent</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">{detailLog.userAgent}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <Button variant="outline" size="sm" onClick={() => setDetailLog(null)}>Close</Button>
        </div>
      </Modal>
    </div>
  )
}


