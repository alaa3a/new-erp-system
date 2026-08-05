'use client'
import { formatCurrency } from '@/lib/formatters'
import { StatusBadge, SearchInput, EmptyState } from '@/components/ui'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Edit3, Trash2, AlertTriangle, Loader2,
  Warehouse as WarehouseIcon, MapPin, User, Package, ChevronDown, ChevronRight, Box,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type { Warehouse } from '@/types/erp'

interface StockItem {
  productId: number; productName: string; warehouseId: number; warehouseName: string;
  quantity: number; averageCost: number; totalValue: number; code: string; itemType: string;
}

interface WarehouseFormData { code: string; name: string; address: string; manager: string; isActive: boolean }
const emptyForm = (): WarehouseFormData => ({ code: '', name: '', address: '', manager: '', isActive: true })

export default function WarehousesPage() {
  const toast = useToast()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [stockData, setStockData] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editingWh, setEditingWh] = useState<Warehouse | null>(null)
  const [formData, setFormData] = useState<WarehouseFormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formTouched, setFormTouched] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [whRes, stRes] = await Promise.all([
        fetch('/api/warehouses'),
        fetch('/api/inventory/stock'),
      ])
      if (!whRes.ok) throw new Error('Failed to load warehouses')
      const whJson = await whRes.json(); if (whJson.success) setWarehouses(whJson.data)
      if (stRes.ok) { const stJson = await stRes.json(); if (stJson.success) setStockData(stJson.data) }
      else setStockData([])
    } catch { setError('Failed to load data.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return warehouses
    const q = searchQuery.toLowerCase()
    return warehouses.filter(w =>
      w.code.toLowerCase().includes(q) || w.name.toLowerCase().includes(q)
    )
  }, [warehouses, searchQuery])

  const getStockForWarehouse = (whId: number) =>
    stockData.filter(s => s.warehouseId === whId)

  const getWhStats = (whId: number) => {
    const items = getStockForWarehouse(whId)
    const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)
    const totalValue = items.reduce((sum, i) => sum + i.totalValue, 0)
    const productCount = items.length
    return { totalItems, totalValue, productCount }
  }

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const openAdd = () => { setEditingWh(null); setFormData(emptyForm()); setFormTouched(false); setFormError(''); setShowForm(true) }
  const openEdit = (w: Warehouse) => {
    setEditingWh(w)
    setFormData({ code: w.code, name: w.name, address: w.address, manager: w.manager, isActive: w.isActive })
    setFormTouched(false); setFormError(''); setShowForm(true)
  }

  const handleSave = async () => {
    setFormTouched(true)
    if (!formData.code.trim() || !formData.name.trim()) { setFormError('Code and name are required'); return }
    setSaving(true); setFormError('')
    try {
      const url = editingWh ? `/api/warehouses/${editingWh.id}` : '/api/warehouses'
      const method = editingWh ? 'PUT' : 'POST'
      // Map to the API schema field names (location/description instead of address/manager)
      const body: any = {
        code: formData.code,
        name: formData.name,
        location: formData.address,
        description: formData.manager,
        isActive: formData.isActive,
      }
      if (editingWh) body.version = editingWh.version
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to save') }
      setShowForm(false); fetchAll()
      toast.success(editingWh ? `Warehouse "${formData.name}" updated` : `Warehouse "${formData.name}" created`)
    } catch (err: any) { setFormError(err.message); toast.error(err.message || 'Failed to save warehouse') }
    finally { setSaving(false) }
  }

  // --- Delete (soft delete, with undo) ---
  const restoreWarehouse = async (wh: Warehouse) => {
    try {
      const res = await fetch(`/api/warehouses/${wh.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })
      if (!res.ok) throw new Error('Restore failed')
      fetchAll()
      toast.success(`Warehouse "${wh.name}" restored`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to restore warehouse')
      fetchAll()
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const deleted = deleteTarget
    try { const res = await fetch(`/api/warehouses/${deleted.id}`, { method: 'DELETE' }); if (!res.ok) throw new Error('Delete failed'); setDeleteTarget(null); fetchAll(); toast.success(`Warehouse "${deleted.name}" deleted`, {
      action: { label: 'Undo', onClick: () => restoreWarehouse(deleted) },
      duration: 8000,
    }) }
    catch (err: any) { setError('Failed to delete'); toast.error(err?.message || 'Failed to delete warehouse') }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Warehouses</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage locations and view stock levels, quantities, and inventory valuation per warehouse.
          </p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Add Warehouse
        </button>
      </div>

      <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search warehouses..." className="max-w-sm" />

      {loading ? (
        <EmptyState icon={<Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />} title="Loading warehouses..." />
      ) : error ? (
        <EmptyState icon={<AlertTriangle className="w-10 h-10 text-red-400 mb-3" />} title={<span className="text-red-600 dark:text-red-400">{error}</span>} action={<button onClick={fetchAll} className="mt-3 text-sm font-medium text-brand-500">Try again</button>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<WarehouseIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />} title="No warehouses found" action={<button onClick={openAdd} className="mt-2 text-sm font-medium text-brand-500"><Plus className="w-4 h-4 inline" /> Add warehouse</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(w => {
            const stats = getWhStats(w.id)
            const stockItems = getStockForWarehouse(w.id)
            const isOpen = expanded.has(w.id)
            const hasStock = stockItems.length > 0

            return (
              <div key={w.id} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden hover:shadow-lg transition-all duration-200">
                {/* Header */}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="rounded-xl bg-brand-50 dark:bg-brand-950/30 p-2.5 shrink-0">
                        <WarehouseIcon className="w-5 h-5 text-brand-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{w.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{w.code}</p>
                      </div>
                    </div>
                    <StatusBadge label={w.isActive ? 'Active' : 'Inactive'} color={w.isActive ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400' : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'} size="sm" className="shrink-0" />
                  </div>

                  {/* Location & Manager */}
                  <div className="space-y-1.5 mb-3">
                    {w.manager && <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"><User className="w-3.5 h-3.5 shrink-0" /><span>{w.manager}</span></div>}
                    {w.address && <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"><MapPin className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{w.address}</span></div>}
                  </div>

                  {/* Stock Stats Summary */}
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-center">
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">{stats.productCount}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">Products</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-center">
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">{stats.totalItems}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">Total Units</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-center">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(stats.totalValue)}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">Value</p>
                    </div>
                  </div>

                  {/* Stock list toggle */}
                  {hasStock && (
                    <button
                      onClick={() => toggleExpand(w.id)}
                      className="flex items-center gap-1.5 mt-3 text-xs font-medium text-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                    >
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      {isOpen ? 'Hide stock items' : `Show ${stats.productCount} stock item${stats.productCount !== 1 ? 's' : ''}`}
                    </button>
                  )}

                  {!hasStock && (
                    <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 italic">No stock items in this warehouse</p>
                  )}
                </div>

                {/* Expanded Stock Items */}
                {hasStock && isOpen && (
                  <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800/50 bg-gray-50/50 dark:bg-gray-900/30">
                    {stockItems.map(item => (
                      <div key={`${item.productId}-${item.warehouseId}`} className="flex items-center justify-between px-5 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="rounded-md bg-white dark:bg-gray-800 p-1.5 shrink-0 shadow-xs">
                            {item.itemType === 'stock' ? <Box className="w-3.5 h-3.5 text-brand-500" /> : <Package className="w-3.5 h-3.5 text-purple-500" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{item.productName}</p>
                            <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                              <span className="font-mono">{item.code}</span>
                              <span>@ {formatCurrency(item.averageCost)}/unit</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className={`text-sm font-semibold ${item.quantity > 0 ? 'text-gray-900 dark:text-white' : 'text-red-500'}`}>
                            {item.quantity}
                          </p>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500">{formatCurrency(item.totalValue)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-1 px-5 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30">
                  <button onClick={() => openEdit(w)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors" title="Edit warehouse"><Edit3 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setDeleteTarget(w)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete warehouse"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} className="max-w-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{editingWh ? 'Edit Warehouse' : 'Add Warehouse'}</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Code <span className="text-red-400">*</span></label>
              <input type="text" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. WH-MAIN"
                className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${formTouched && !formData.code.trim() ? 'border-red-300' : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name <span className="text-red-400">*</span></label>
              <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Warehouse name"
                className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${formTouched && !formData.name.trim() ? 'border-red-300' : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'}`} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Address</label>
            <input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="Street address" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Manager</label>
            <input type="text" value={formData.manager} onChange={e => setFormData({ ...formData, manager: e.target.value })} placeholder="Manager name" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({ ...formData, isActive: e.target.checked })} className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
          </label>
          {formError && <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2"><p className="text-sm text-red-600 dark:text-red-400">{formError}</p></div>}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !formData.code.trim() || !formData.name.trim()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : editingWh ? 'Update Warehouse' : 'Create Warehouse'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} className="max-w-md p-6">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3"><div className="rounded-full bg-red-50 dark:bg-red-950/50 p-2.5"><AlertTriangle className="w-5 h-5 text-red-500" /></div><div><h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Warehouse</h3><p className="text-sm text-gray-500 dark:text-gray-400">{deleteTarget.code}</p></div></div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Are you sure you want to delete <strong>{deleteTarget.name}</strong>?</p>
            <div className="flex items-center justify-end gap-3 pt-2"><Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button size="sm" onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Delete</Button></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
