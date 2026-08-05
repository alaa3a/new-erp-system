'use client'
import { formatCurrency } from '@/lib/formatters'
import { ClearFiltersButton, StatusBadge, SearchInput, StatCard, EmptyState } from '@/components/ui'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, Suspense } from 'react'
import {
  Plus,
  Edit3,
  Trash2,
  AlertTriangle,
  Loader2,
  Users,
  Building2,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Tag,
} from 'lucide-react'
import { usePagination } from '@/hooks/usePagination'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { Pagination } from '@/components/Pagination'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type { BusinessPartner, PartnerType } from '@/types/erp'

const partnerTypes: PartnerType[] = ['customer', 'vendor', 'both']
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const typeConfig: Record<PartnerType, { label: string; bg: string; text: string }> = {
  customer: { label: 'Customer', bg: 'bg-blue-50 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-400' },
  vendor: { label: 'Vendor', bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-400' },
  both: { label: 'Both', bg: 'bg-purple-50 dark:bg-purple-950/50', text: 'text-purple-700 dark:text-purple-400' },
}

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  active: { label: 'Active', bg: 'bg-green-50 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-400' },
  inactive: { label: 'Inactive', bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400' },
}

const partnerTypeOptions = ['all', ...partnerTypes] as const

interface PartnerFormData {
  name: string
  type: PartnerType
  contactPerson: string
  email: string
  phone: string
  address: string
  city: string
  country: string
  taxRegistrationNumber: string
  creditLimit: number
  status: string
  tags: string[]
}

const emptyForm = (): PartnerFormData => ({
  name: '',
  type: 'customer',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  country: '',
  taxRegistrationNumber: '',
  creditLimit: 0,
  status: 'active',
  tags: [],
})

export default function BusinessPartnersPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /><span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading partners...</span></div>}>
      <BusinessPartnersPageContent />
    </Suspense>
  )
}

function BusinessPartnersPageContent() {
  const toast = useToast()
  const [partners, setPartners] = useState<BusinessPartner[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const { page, pageSize, setFilterAndResetPage } = usePagination()

  const [showForm, setShowForm] = useState(false)
  const [editingPartner, setEditingPartner] = useState<BusinessPartner | null>(null)
  const [formData, setFormData] = useState<PartnerFormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formTouched, setFormTouched] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BusinessPartner | null>(null)
  const [tagInput, setTagInput] = useState('')

  const fetchPartners = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      if (searchQuery) params.set('search', searchQuery)
      if (typeFilter !== 'all') params.set('type', typeFilter)
      const res = await fetch(`/api/partners?${params}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setPartners(json.data)
      setTotal(json.total)
    } catch {
      setError('Failed to load business partners.')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchQuery, typeFilter])

  useEffect(() => { fetchPartners() }, [fetchPartners])

  const openAddForm = () => {
    setEditingPartner(null)
    setFormData(emptyForm())
    setFormTouched(false)
    setFormError('')
    setTagInput('')
    setShowForm(true)
  }

  const openEditForm = (partner: BusinessPartner) => {
    setEditingPartner(partner)
    setFormData({
      name: partner.name,
      type: partner.type,
      contactPerson: partner.contactPerson,
      email: partner.email,
      phone: partner.phone,
      address: partner.address,
      city: partner.city,
      country: partner.country,
      taxRegistrationNumber: partner.taxRegistrationNumber,
      creditLimit: Math.round(partner.creditLimit / 100), // Convert cents to dollars for display
      status: partner.status,
      tags: partner.tags,
    })
    setFormTouched(false)
    setFormError('')
    setTagInput('')
    setShowForm(true)
  }

  const addTag = () => {
    const tag = tagInput.trim()
    if (tag && !formData.tags.includes(tag)) {
      setFormData({ ...formData, tags: [...formData.tags, tag] })
    }
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) })
  }

  const handleSave = async () => {
    setFormTouched(true)
    if (!formData.name.trim() || !formData.type) {
      setFormError('Name and type are required')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const url = editingPartner ? `/api/partners/${editingPartner.id}` : '/api/partners'
      const method = editingPartner ? 'PUT' : 'POST'
      // Map to the API schema field names (taxId instead of taxRegistrationNumber)
      const body: any = {
        name: formData.name,
        type: formData.type,
        contactPerson: formData.contactPerson,
        email: formData.email,
        phone: formData.phone,
        taxId: formData.taxRegistrationNumber,
        address: formData.address,
        city: formData.city,
        country: formData.country,
        creditLimit: Math.round(formData.creditLimit * 100),
        status: formData.status,
        tags: formData.tags,
      }
      if (editingPartner) body.version = editingPartner.version
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      setShowForm(false)
      fetchPartners()
      toast.success(editingPartner ? `Partner "${formData.name}" updated` : `Partner "${formData.name}" created`)
    } catch (err: any) {
      setFormError(err.message)
      toast.error(err.message || 'Failed to save partner')
    } finally {
      setSaving(false)
    }
  }

  // --- Delete (soft delete, with undo) ---
  const restorePartner = async (partner: BusinessPartner) => {
    try {
      const res = await fetch(`/api/partners/${partner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      if (!res.ok) throw new Error('Restore failed')
      fetchPartners()
      toast.success(`Partner "${partner.name}" restored`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to restore partner')
      fetchPartners()
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const deleted = deleteTarget
    try {
      const res = await fetch(`/api/partners/${deleted.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setDeleteTarget(null)
      fetchPartners()
      toast.success(`Partner "${deleted.name}" deleted`, {
        action: { label: 'Undo', onClick: () => restorePartner(deleted) },
        duration: 8000,
      })
    } catch (err: any) {
      setError('Failed to delete partner')
      toast.error(err?.message || 'Failed to delete partner')
    }
  }


  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Business Partners</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage customers, vendors, and partners with contact details and credit limits.
          </p>
        </div>
        <button
          onClick={openAddForm}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Partner
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Partners', value: partners.length, color: 'text-brand-500' },
          { label: 'Customers', value: partners.filter(p => p.type === 'customer' || p.type === 'both').length, color: 'text-blue-500' },
          { label: 'Vendors', value: partners.filter(p => p.type === 'vendor' || p.type === 'both').length, color: 'text-amber-500' },
          { label: 'Active', value: partners.filter(p => p.status === 'active').length, color: 'text-green-500' },
        ].map(s => (
          <StatCard key={s.label} label={s.label} value={s.value} color={s.color} />
        ))}
      </div>

      {/* Filters + Search */}
      <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-2.5">
        {partnerTypeOptions.map(t => (
          <button
            key={t}
            onClick={() => setFilterAndResetPage(setTypeFilter, t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              typeFilter === t
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {t === 'all' ? 'All' : capitalize(t)}
          </button>
        ))}
        <div className="flex-1 min-w-0" />
        <ClearFiltersButton
          filters={{ type: typeFilter !== 'all', search: searchQuery !== '' }}
          onClear={() => {
            setFilterAndResetPage(setTypeFilter, 'all')
            setFilterAndResetPage(setSearchQuery, '')
          }}
        />
        <SearchInput value={searchQuery} onChange={v => setFilterAndResetPage(setSearchQuery, v)} placeholder="Search by name, code, or email..." className="max-w-xs w-full" compact />
      </div>

      {/* Content */}
      {loading ? (
        <EmptyState icon={<Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />} title="Loading partners..." />
      ) : error ? (
        <EmptyState icon={<AlertTriangle className="w-10 h-10 text-red-400 mb-3" />} title={<span className="text-red-600 dark:text-red-400">{error}</span>} action={<button onClick={fetchPartners} className="mt-3 text-sm font-medium text-brand-500">Try again</button>} />
      ) : partners.length === 0 ? (
        <EmptyState
          icon={<Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />}
          title={searchQuery || typeFilter !== 'all' ? 'No partners match your filters' : 'No business partners yet'}
          action={!searchQuery && typeFilter === 'all' ? (
            <button onClick={openAddForm} className="mt-2 text-sm font-medium text-brand-500 hover:text-brand-600">
              <Plus className="w-4 h-4 inline" /> Add your first partner
            </button>
          ) : undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {partners.map(partner => (
              <div
                key={partner.id}
                className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="rounded-xl bg-brand-50 dark:bg-brand-950/30 p-2.5 shrink-0">
                      <Building2 className="w-5 h-5 text-brand-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{partner.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{partner.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusBadge label={typeConfig[partner.type].label} color={`${typeConfig[partner.type].bg} ${typeConfig[partner.type].text}`} size="sm" />
                  </div>
                </div>

                {/* Contact Details */}
                <div className="space-y-1.5 mt-3">
                  {partner.contactPerson && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      <span>{partner.contactPerson}</span>
                    </div>
                  )}
                  {partner.email && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{partner.email}</span>
                    </div>
                  )}
                  {partner.phone && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>{partner.phone}</span>
                    </div>
                  )}
                  {(partner.city || partner.country) && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{[partner.city, partner.country].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  {partner.creditLimit > 0 && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <CreditCard className="w-3.5 h-3.5 shrink-0" />
                      <span>Credit limit: {formatCurrency(partner.creditLimit, { fractionDigits: 0 })}</span>
                    </div>
                  )}
                </div>

                {/* Tags */}
                {partner.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {partner.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                        <Tag className="w-2.5 h-2.5" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Status + Actions */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <StatusBadge label={partner.status === 'active' ? 'Active' : 'Inactive'} color={`${statusConfig[partner.status]?.bg || 'bg-gray-50'} ${statusConfig[partner.status]?.text || 'text-gray-500'}`} size="sm" />
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditForm(partner)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                      title="Edit partner"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(partner)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      title="Delete partner"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} />
        </>
      )}

      {/* --- Add/Edit Modal --- */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} className="max-w-2xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {editingPartner ? 'Edit Partner' : 'Add Business Partner'}
        </h3>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1 custom-scrollbar">
          {/* Name + Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Company name"
                className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${
                  formTouched && !formData.name.trim()
                    ? 'border-red-300 dark:border-red-700'
                    : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'
                }`}
              />
              {formTouched && !formData.name.trim() && (
                <p className="text-[11px] text-red-500 mt-1">Name is required</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Type <span className="text-red-400">*</span>
              </label>
              <select
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value as PartnerType })}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              >
                {partnerTypes.map(t => (
                  <option key={t} value={t}>{capitalize(t)} {t === 'both' ? '(Customer & Vendor)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Contact Person + Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Contact Person</label>
              <input
                type="text"
                value={formData.contactPerson}
                onChange={e => setFormData({ ...formData, contactPerson: e.target.value })}
                placeholder="Full name"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@company.com"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
            </div>
          </div>

          {/* Phone + Tax Reg */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone</label>
              <input
                type="text"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1 234 567 890"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tax Registration No.</label>
              <input
                type="text"
                value={formData.taxRegistrationNumber}
                onChange={e => setFormData({ ...formData, taxRegistrationNumber: e.target.value })}
                placeholder="VAT / Tax ID"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Address</label>
            <input
              type="text"
              value={formData.address}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              placeholder="Street address"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            />
          </div>

          {/* City + Country */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={e => setFormData({ ...formData, city: e.target.value })}
                placeholder="City"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Country</label>
              <input
                type="text"
                value={formData.country}
                onChange={e => setFormData({ ...formData, country: e.target.value })}
                placeholder="Country"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
            </div>
          </div>

          {/* Credit Limit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Credit Limit (USD)</label>
            <input
              type="number"
              value={formData.creditLimit || ''}
              onChange={e => setFormData({ ...formData, creditLimit: Number(e.target.value) || 0 })}
              placeholder="0.00"
              min="0"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Status</label>
            <select
              value={formData.status}
              onChange={e => setFormData({ ...formData, status: e.target.value })}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tags</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="Type a tag and press Enter..."
                className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
              <button onClick={addTag} className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                Add
              </button>
            </div>
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {formData.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-red-500 transition-colors">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
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
              {saving ? 'Saving...' : editingPartner ? 'Update Partner' : 'Create Partner'}
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
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Partner</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{deleteTarget.code}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This will soft-delete the partner.
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
