'use client'
import { SearchInput, StatusBadge, ModalHeader, EmptyState } from '@/components/ui'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit3, Trash2, Loader2, Users } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type { Employee } from '@/types/erp'

interface EmployeeFormData {
  code: string
  name: string
  jobTitle: string
  department: string
  email: string
  phone: string
  isActive: boolean
}

const emptyForm = (): EmployeeFormData => ({
  code: '',
  name: '',
  jobTitle: '',
  department: '',
  email: '',
  phone: '',
  isActive: true,
})

export default function EmployeesPage() {
  const toast = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [formData, setFormData] = useState<EmployeeFormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      const qs = params.toString()
      const res = await fetch(`/api/employees${qs ? `?${qs}` : ''}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json()
      if (json.success) setEmployees(json.data)
    } catch {
      setEmployees([])
    } finally {
      setLoading(false)
    }
  }, [searchQuery])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  const openCreate = () => {
    setEditing(null)
    setFormData(emptyForm())
    setFormError('')
    setShowForm(true)
  }

  const openEdit = (e: Employee) => {
    setEditing(e)
    setFormData({
      code: e.code,
      name: e.name,
      jobTitle: e.jobTitle,
      department: e.department,
      email: e.email,
      phone: e.phone,
      isActive: e.isActive,
    })
    setFormError('')
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setFormError('Name is required')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const url = editing ? `/api/employees/${editing.id}` : '/api/employees'
      const method = editing ? 'PUT' : 'POST'
      const body: any = {
        ...formData,
        code: formData.code.trim(),
        name: formData.name.trim(),
      }
      if (editing) body.version = editing.version
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      setShowForm(false)
      await fetchEmployees()
      toast.success(editing ? `Employee "${formData.name}" updated` : `Employee "${formData.name}" created`)
    } catch (err: any) {
      setFormError(err.message || 'Failed to save')
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/employees/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: deleteTarget.version }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete')
      }
      setDeleteTarget(null)
      await fetchEmployees()
      toast.success(`Employee "${deleteTarget.name}" deactivated`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
    }
  }

  const inputCls = 'w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Employees</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage employees — the third dimension you can link chart-of-accounts accounts to.
          </p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> New Employee
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search employees..." className="max-w-sm" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      ) : employees.length === 0 ? (
        <EmptyState
          icon={<Users className="w-10 h-10 text-gray-300 dark:text-gray-600" />}
          title={searchQuery ? 'No employees match your search' : 'No employees yet'}
          description={searchQuery ? undefined : 'Add employees so chart-of-accounts accounts can be linked to them.'}
          action={searchQuery ? undefined : <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4" /> New Employee</Button>}
        />
      ) : (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Job Title</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Department</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {employees.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-brand-600 dark:text-brand-400">{e.code}</td>
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">{e.name}</td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400">{e.jobTitle || '—'}</td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400">{e.department || '—'}</td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400">{e.email || '—'}</td>
                    <td className="py-3 px-4">
                      <StatusBadge label={e.isActive ? 'Active' : 'Inactive'} color={e.isActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'} size="sm" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(e)} className="p-1.5 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors" title="Edit">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteTarget(e)} className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Deactivate">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Employee form modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} className="max-w-lg p-0" showCloseButton={false}>
        <ModalHeader title={editing ? `Edit Employee` : 'New Employee'} onClose={() => setShowForm(false)} />
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Code</label>
              <input type="text" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="Auto (EM-XXXXX)" className={inputCls} />
              {!editing && (
                <p className="text-[11px] text-gray-400 mt-0.5">Leave empty to auto-generate.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name <span className="text-red-400">*</span></label>
              <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. John Doe" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Job Title</label>
              <input type="text" value={formData.jobTitle} onChange={e => setFormData({ ...formData, jobTitle: e.target.value })} placeholder="e.g. Accountant" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Department</label>
              <input type="text" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} placeholder="e.g. Finance" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
              <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="name@company.com" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone</label>
              <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 555 000 0000" className={inputCls} />
            </div>
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
            <Button size="sm" onClick={handleSave} disabled={saving || !formData.name.trim()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} className="max-w-md p-6">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-50 dark:bg-red-950/50 p-2.5">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Deactivate employee?</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{deleteTarget.code} - {deleteTarget.name}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              The employee will be deactivated and hidden from the account-link picker. Existing entry lines keep their reference.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button size="sm" className="bg-red-500 hover:bg-red-600 disabled:bg-red-300" onClick={handleDelete}>Deactivate</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
