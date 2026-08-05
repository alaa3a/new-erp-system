'use client'
import { SearchInput, StatusBadge, ModalHeader } from '@/components/ui'
import { formatDate } from '@/lib/formatters'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
   Plus, Loader2, AlertTriangle, CheckCircle,
  Edit3, Trash2, X, Shield, UserIcon, Lock, Mail,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type { User, Permission } from '@/types/erp'

// ─── Constants ─────────────────────────────────────────────────────────


// ─── Types ──────────────────────────────────────────────────────────────

interface UserFormData {
  email: string
  password: string
  confirmPassword: string
  firstName: string
  lastName: string
  isActive: boolean
  permissionIds: number[]
}

// ─── Helpers ────────────────────────────────────────────────────────────

const emptyForm = (): UserFormData => ({
  email: '',
  password: '',
  confirmPassword: '',
  firstName: '',
  lastName: '',
  isActive: true,
  permissionIds: [],
})

// ─── Main Component ─────────────────────────────────────────────────────

export default function UsersPage() {
  const toast = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  // Default to 'Active' so soft-deleted (deactivated) users stay hidden after refresh;
  // switch to 'Inactive' to view/reactivate them.
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')

  // Form
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState<UserFormData>(emptyForm())
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  // Toggle active
  const [toggleTarget, setToggleTarget] = useState<User | null>(null)
  const [toggling, setToggling] = useState(false)

  // ── Permissions grouped by module ──
  const permissionsByModule = useMemo(() => {
    const grouped: Record<string, Permission[]> = {}
    for (const p of permissions) {
      if (!grouped[p.module]) grouped[p.module] = []
      grouped[p.module].push(p)
    }
    return grouped
  }, [permissions])

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [usersRes, permsRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/permissions'),
      ])
      if (!usersRes.ok || !permsRes.ok) throw new Error('Failed to load data')
      const usersJson = await usersRes.json()
      const permsJson = await permsRes.json()
      if (usersJson.success) setUsers(usersJson.data)
      if (permsJson.success) setPermissions(permsJson.data)
    } catch (err: any) {
      setError(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Filtered users ──
  const filteredUsers = useMemo(() => {
    let list = users
    if (statusFilter === 'active') list = list.filter(u => u.isActive)
    if (statusFilter === 'inactive') list = list.filter(u => !u.isActive)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(u =>
        u.email.toLowerCase().includes(q) ||
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q)
      )
    }
    return list
  }, [users, statusFilter, searchQuery])

  // ── Toggle permission ──
  const togglePermission = (permId: number) => {
    setFormData(prev => ({
      ...prev,
      permissionIds: prev.permissionIds.includes(permId)
        ? prev.permissionIds.filter(id => id !== permId)
        : [...prev.permissionIds, permId],
    }))
  }

  // ── Select all permissions for a module ──
  const selectModule = (module: string, select: boolean) => {
    const modulePermIds = permissionsByModule[module].map(p => p.id)
    setFormData(prev => ({
      ...prev,
      permissionIds: select
        ? [...new Set([...prev.permissionIds, ...modulePermIds])]
        : prev.permissionIds.filter(id => !modulePermIds.includes(id)),
    }))
  }

  // ── Form helpers ──
  const openAddForm = () => {
    setEditingUser(null)
    setFormData(emptyForm())
    setFormError('')
    setShowForm(true)
  }

  const openEditForm = (user: User) => {
    setEditingUser(user)
    setFormData({
      email: user.email,
      password: '',
      confirmPassword: '',
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      permissionIds: user.permissionIds,
    })
    setFormError('')
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingUser(null)
    setFormError('')
  }

  // ── Save ──
  const handleSave = async () => {
    setSubmitting(true)
    setFormError('')

    if (!formData.email.trim() || !formData.firstName.trim() || !formData.lastName.trim()) {
      setFormError('Email, first name, and last name are required')
      setSubmitting(false)
      return
    }

    if (!editingUser && !formData.password) {
      setFormError('Password is required for new users')
      setSubmitting(false)
      return
    }

    if (formData.password && formData.password !== formData.confirmPassword) {
      setFormError('Passwords do not match')
      setSubmitting(false)
      return
    }

    try {
      const body: any = {
        email: formData.email.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        isActive: formData.isActive,
        permissionIds: formData.permissionIds,
      }

      if (formData.password) body.password = formData.password

      if (editingUser) {
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to update user')
        }
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to create user')
        }
      }

      closeForm()
      await fetchData()
      const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim()
      toast.success(editingUser ? `User "${fullName}" updated` : `User "${fullName}" created`)
    } catch (err: any) {
      setFormError(err?.message || 'An error occurred')
      toast.error(err?.message || 'Failed to save user')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Toggle active ──
  const handleToggleActive = async () => {
    if (!toggleTarget) return
    setToggling(true)
    try {
      const res = await fetch(`/api/users/${toggleTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggleActive',
          isActive: !toggleTarget.isActive,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to toggle')
      }
      setToggleTarget(null)
      await fetchData()
      const fullName = `${toggleTarget.firstName} ${toggleTarget.lastName}`.trim()
      toast.success(toggleTarget.isActive ? `User "${fullName}" deactivated` : `User "${fullName}" activated`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update user')
    } finally {
      setToggling(false)
    }
  }

  // ── Delete (deactivate, with undo) ──
  const restoreUser = async (user: User) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggleActive', isActive: true }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to restore user')
      }
      await fetchData()
      const fullName = `${user.firstName} ${user.lastName}`.trim()
      toast.success(`User "${fullName}" activated`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to restore user')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const deleted = deleteTarget
    try {
      const res = await fetch(`/api/users/${deleted.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete')
      }
      setDeleteTarget(null)
      // Delete is a soft delete (isActive=0) — remove the row locally so it disappears
      // immediately instead of refetching (which would bring it back as Inactive).
      // Undo restores via restoreUser → fetchData.
      setUsers(prev => prev.filter(u => u.id !== deleted.id))
      const fullName = `${deleted.firstName} ${deleted.lastName}`.trim()
      toast.success(`User "${fullName}" deactivated`, {
        action: { label: 'Undo', onClick: () => restoreUser(deleted) },
        duration: 8000,
      })
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete user')
    }
  }

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">User Management</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage system users, assign permissions, and control access.
          </p>
        </div>
        <button onClick={openAddForm}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      {/* Filters + Search */}
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
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search by name or email..." className="max-w-xs w-full" compact />
      </div>

      {/* Users table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading users...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <button onClick={fetchData} className="mt-3 text-sm font-medium text-brand-500 hover:text-brand-600">Try again</button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Login</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Permissions</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center">
                      <UserIcon className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {users.length === 0
                          ? 'No users yet'
                          : searchQuery
                            ? 'No users match your search'
                            : statusFilter === 'active'
                              ? 'No active users'
                              : statusFilter === 'inactive'
                                ? 'No inactive users'
                                : 'No users match the current filter'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(user => (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-brand-50 dark:bg-brand-950/30 p-2">
                            <UserIcon className="w-4 h-4 text-brand-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="text-xs text-gray-400">ID: {user.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{user.email}</td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                        {user.lastLoginAt ? formatDate(user.lastLoginAt, 'datetime') : 'Never'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <StatusBadge label={user.isActive ? 'Active' : 'Inactive'} color={user.isActive ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'} />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {user.permissionIds.length} permission(s)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEditForm(user)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                            title="Edit user"><Edit3 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setToggleTarget(user)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                            title={user.isActive ? 'Deactivate' : 'Activate'}><CheckCircle className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDeleteTarget(user)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Delete user"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          CREATE / EDIT USER MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={showForm} onClose={closeForm} className="max-w-3xl p-0" showCloseButton={false}>
        <ModalHeader title={editingUser ? `Edit User: ${editingUser.firstName} ${editingUser.lastName}` : 'Create User'} onClose={closeForm} />

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* ── Basic Info ── */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-gray-400" /> Basic Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  First Name <span className="text-red-400">*</span>
                </label>
                <input type="text" value={formData.firstName}
                  onChange={e => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="John"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Last Name <span className="text-red-400">*</span>
                </label>
                <input type="text" value={formData.lastName}
                  onChange={e => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Doe"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  <Mail className="w-3.5 h-3.5 inline mr-1" /> Email <span className="text-red-400">*</span>
                </label>
                <input type="email" value={formData.email}
                  onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="john@company.com"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
              </div>
            </div>
          </div>

          {/* ── Password ── */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4 text-gray-400" /> Password
            </h4>
            <p className="text-xs text-gray-400 mb-3">
              {editingUser ? 'Leave blank to keep current password.' : 'Password must be at least 8 characters with uppercase, lowercase, and a number.'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {editingUser ? 'New Password' : 'Password'} {!editingUser && <span className="text-red-400">*</span>}
                </label>
                <input type="password" value={formData.password}
                  onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder={editingUser ? 'Leave blank to keep' : 'Min 8 characters'}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Confirm Password
                </label>
                <input type="password" value={formData.confirmPassword}
                  onChange={e => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="Confirm password"
                  className={`w-full rounded-lg border bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${
                    formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword
                      ? 'border-red-300 dark:border-red-700'
                      : 'border-gray-200 dark:border-gray-700'
                  }`} />
                {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <p className="text-[11px] text-red-500 mt-1">Passwords do not match</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Status ── */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={formData.isActive}
                onChange={e => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500 w-4 h-4" />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Active</span>
                <p className="text-xs text-gray-400">Inactive users cannot sign in to the system</p>
              </div>
            </label>
          </div>

          {/* ── Permissions ── */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-gray-400" /> Permissions
            </h4>

            {Object.keys(permissionsByModule).length === 0 ? (
              <p className="text-sm text-gray-400 italic py-4 text-center">No permissions defined in the system.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(permissionsByModule).map(([module, perms]) => {
                  const allSelected = perms.every(p => formData.permissionIds.includes(p.id))
                  return (
                    <div key={module}
                      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                          {module.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <button onClick={() => selectModule(module, !allSelected)}
                          className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 transition-colors">
                          {allSelected ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {perms.map(perm => {
                          const isSelected = formData.permissionIds.includes(perm.id)
                          return (
                            <label key={perm.id}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-900'
                                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                              }`}>
                              <input type="checkbox" checked={isSelected}
                                onChange={() => togglePermission(perm.id)}
                                className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500 w-3.5 h-3.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-gray-900 dark:text-white truncate capitalize">
                                  {perm.action}
                                </p>
                                <p className="text-[10px] text-gray-400 truncate">{perm.description}</p>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Form error */}
          {formError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-2.5">
              <p className="text-sm text-red-700 dark:text-red-400">{formError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <Button variant="outline" size="sm" onClick={closeForm} disabled={submitting}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={submitting}
            className="flex items-center gap-2">
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {editingUser ? 'Update User' : 'Create User'}
          </Button>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          TOGGLE ACTIVE CONFIRMATION
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={!!toggleTarget} onClose={() => setToggleTarget(null)} className="max-w-md p-6">
        {toggleTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-50 dark:bg-amber-950/50 p-2.5">
                <CheckCircle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {toggleTarget.isActive ? 'Deactivate User' : 'Activate User'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{toggleTarget.firstName} {toggleTarget.lastName}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {toggleTarget.isActive
                ? `Are you sure you want to deactivate ${toggleTarget.firstName} ${toggleTarget.lastName}? They will not be able to sign in.`
                : `Are you sure you want to activate ${toggleTarget.firstName} ${toggleTarget.lastName}? They will be able to sign in again.`
              }
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setToggleTarget(null)}>Cancel</Button>
              <Button size="sm" onClick={handleToggleActive} disabled={toggling}
                className={toggleTarget.isActive ? '!bg-amber-500 hover:!bg-amber-600' : '!bg-green-600 hover:!bg-green-700'}>
                {toggling ? 'Updating...' : toggleTarget.isActive ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          DELETE CONFIRMATION
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} className="max-w-md p-6">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-50 dark:bg-red-950/50 p-2.5">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete User</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{deleteTarget.firstName} {deleteTarget.lastName}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to deactivate <strong>{deleteTarget.firstName} {deleteTarget.lastName}</strong>?
              The user will be marked as inactive and won't be able to sign in.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button size="sm" onClick={handleDelete} className="!bg-red-500 hover:!bg-red-600">Deactivate</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
