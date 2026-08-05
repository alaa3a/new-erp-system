'use client'
import { SearchInput } from '@/components/ui'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  
  Plus,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Edit3,
  Trash2,
  Save,
  Building,
  Calendar,
  CreditCard,
  FileText,
  Lock,
  Unlock,
  Globe,
  Phone,
  Mail,
  MapPin,
  Hash,
  DollarSign,
  Clock,
} from 'lucide-react'
import DatePicker from '@/components/form/input/DatePicker'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { useToast } from '@/components/ui/toast/ToastProvider'

// ---------- Types ----------
interface CompanyInfo {
  id?: number
  name: string
  registrationNumber: string
  taxRegistrationNumber: string
  address: string
  city: string
  country: string
  phone: string
  email: string
  website: string
  baseCurrencyCode: string
  fiscalYearStartMonth: number
  version?: number
}

interface FiscalPeriod {
  id: number
  name: string
  startDate: string
  endDate: string
  status: 'open' | 'closed' | 'locked'
  closedBy: string | null
  closedAt: string | null
  version: number
}

interface PaymentTerm {
  id: number
  code: string
  name: string
  daysUntilDue: number
  discountPercent: number
  discountDays: number
  isActive: boolean
  version: number
}

interface DocumentSequence {
  id: number
  documentType: string
  prefix: string
  nextNumber: number
  padding: number
  version: number
}

type Tab = 'company' | 'fiscal-periods' | 'payment-terms' | 'sequences' | 'aging-buckets'

const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'company', label: 'Company Info', icon: <Building className="w-4 h-4" /> },
  { key: 'fiscal-periods', label: 'Fiscal Periods', icon: <Calendar className="w-4 h-4" /> },
  { key: 'payment-terms', label: 'Payment Terms', icon: <CreditCard className="w-4 h-4" /> },
  { key: 'sequences', label: 'Doc Sequences', icon: <FileText className="w-4 h-4" /> },
  { key: 'aging-buckets', label: 'Aging Buckets', icon: <Clock className="w-4 h-4" /> },
]

const months = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
]

// ---------- Period form ----------
interface PeriodFormData {
  name: string
  startDate: string
  endDate: string
}

const emptyPeriodForm = (): PeriodFormData => ({
  name: '',
  startDate: '',
  endDate: '',
})

// ---------- Payment term form ----------
interface TermFormData {
  code: string
  name: string
  daysUntilDue: number
  discountPercent: number
  discountDays: number
}

const emptyTermForm = (): TermFormData => ({
  code: '',
  name: '',
  daysUntilDue: 30,
  discountPercent: 0,
  discountDays: 0,
})

// ---------- Sequence form ----------
interface SeqFormData {
  prefix: string
  nextNumber: number
  padding: number
}

interface AgingBucket {
  id: number
  label: string
  fromDays: number
  toDays: number
  sortOrder: number
  version: number
}

// ==================================================================
export default function SystemSettingsPage() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<Tab>('company')

  // Loading / error
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Company
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [companyForm, setCompanyForm] = useState<CompanyInfo | null>(null)
  const [companySaving, setCompanySaving] = useState(false)
  const [companySaved, setCompanySaved] = useState(false)

  // Fiscal Periods
  const [periods, setPeriods] = useState<FiscalPeriod[]>([])
  const [periodFormOpen, setPeriodFormOpen] = useState(false)
  const [periodForm, setPeriodForm] = useState<PeriodFormData>(emptyPeriodForm())
  const [periodSaving, setPeriodSaving] = useState(false)
  const [periodError, setPeriodError] = useState('')
  const [closeConfirm, setCloseConfirm] = useState<FiscalPeriod | null>(null)

  // Payment Terms
  const [terms, setTerms] = useState<PaymentTerm[]>([])
  const [termSearch, setTermSearch] = useState('')
  const [termFormOpen, setTermFormOpen] = useState(false)
  const [editingTerm, setEditingTerm] = useState<PaymentTerm | null>(null)
  const [termForm, setTermForm] = useState<TermFormData>(emptyTermForm())
  const [termSaving, setTermSaving] = useState(false)
  const [termError, setTermError] = useState('')
  const [deleteTerm, setDeleteTerm] = useState<PaymentTerm | null>(null)

  // Document Sequences
  const [sequences, setSequences] = useState<DocumentSequence[]>([])
  const [seqFormOpen, setSeqFormOpen] = useState(false)
  const [editingSeq, setEditingSeq] = useState<DocumentSequence | null>(null)
  const [seqForm, setSeqForm] = useState<SeqFormData>({ prefix: '', nextNumber: 1, padding: 6 })
  const [seqSaving, setSeqSaving] = useState(false)
  const [seqError, setSeqError] = useState('')

  // Aging Buckets
  const [buckets, setBuckets] = useState<AgingBucket[]>([])
  const [bucketSaving, setBucketSaving] = useState(false)
  const [bucketError, setBucketError] = useState('')
  const [bucketSaved, setBucketSaved] = useState(false)

  // ---------- Data fetching ----------
  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [companyRes, periodsRes, termsRes, seqRes, bucketRes] = await Promise.all([
        fetch('/api/company'),
        fetch('/api/fiscal-periods'),
        fetch('/api/payment-terms'),
        fetch('/api/document-sequences'),
        fetch('/api/settings/aging-buckets'),
      ])
      if (!companyRes.ok || !periodsRes.ok || !termsRes.ok || !seqRes.ok || !bucketRes.ok) {
        throw new Error('Failed to load settings data')
      }
      const [c, p, t, s, b] = await Promise.all([
        companyRes.json(), periodsRes.json(), termsRes.json(), seqRes.json(), bucketRes.json(),
      ])
      setCompany(c.data || c)
      setCompanyForm(c.data ? { ...c.data } : null)
      setPeriods(p.data || p)
      setTerms(t.data || t)
      setSequences(s.data || s)
      setBuckets(b.data || b)
    } catch (err: any) {
      setError(err.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ---------- Company ----------
  const handleCompanySave = async () => {
    if (!companyForm?.name.trim()) return
    setCompanySaving(true)
    try {
      const res = await fetch('/api/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(companyForm),
      })
      if (!res.ok) throw new Error('Save failed')
      const json = await res.json(); const updated = json.data || json
      setCompany(updated)
      setCompanyForm(updated)
      setCompanySaved(true)
      setTimeout(() => setCompanySaved(false), 3000)
      toast.success('Company information saved')
    } catch (err: any) {
      setError(err?.message || 'Failed to save company info')
      toast.error(err?.message || 'Failed to save company info')
    } finally {
      setCompanySaving(false)
    }
  }

  // ---------- Fiscal Periods ----------
  const handleCreatePeriod = async () => {
    if (!periodForm.name || !periodForm.startDate || !periodForm.endDate) return
    setPeriodSaving(true)
    setPeriodError('')
    try {
      const res = await fetch('/api/fiscal-periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(periodForm),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create period')
      }
      setPeriodFormOpen(false)
      setPeriodForm(emptyPeriodForm())
      const periodsRes = await fetch('/api/fiscal-periods')
      const p = await periodsRes.json()
      setPeriods(p.data || p)
      toast.success(`Fiscal period "${periodForm.name}" created`)
    } catch (err: any) {
      setPeriodError(err.message)
      toast.error(err.message || 'Failed to create fiscal period')
    } finally {
      setPeriodSaving(false)
    }
  }

  const handleClosePeriod = async () => {
    if (!closeConfirm) return
    try {
      await fetch(`/api/fiscal-periods/${closeConfirm.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close' }),
      })
      setCloseConfirm(null)
      const res = await fetch('/api/fiscal-periods')
      const json = await res.json()
      if (json.success) setPeriods(json.data)
      toast.success(`Fiscal period "${closeConfirm.name}" closed`)
    } catch (err: any) {
      setError('Failed to close period')
      toast.error(err?.message || 'Failed to close period')
    }
  }

  // ---------- Payment Terms ----------
  const filteredTerms = useMemo(() => {
    if (!termSearch.trim()) return terms
    const q = termSearch.toLowerCase()
    return terms.filter(t => t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
  }, [terms, termSearch])

  const openAddTerm = () => {
    setEditingTerm(null)
    setTermForm(emptyTermForm())
    setTermError('')
    setTermFormOpen(true)
  }

  const openEditTerm = (term: PaymentTerm) => {
    setEditingTerm(term)
    setTermForm({
      code: term.code,
      name: term.name,
      daysUntilDue: term.daysUntilDue,
      discountPercent: term.discountPercent,
      discountDays: term.discountDays,
    })
    setTermError('')
    setTermFormOpen(true)
  }

  const handleSaveTerm = async () => {
    if (!termForm.code.trim() || !termForm.name.trim()) return
    setTermSaving(true)
    setTermError('')
    try {
      const url = editingTerm ? `/api/payment-terms/${editingTerm.id}` : '/api/payment-terms'
      const method = editingTerm ? 'PUT' : 'POST'
      const body: any = { ...termForm }
      if (editingTerm) body.version = editingTerm.version
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      setTermFormOpen(false)
      const termsJson = await (await fetch('/api/payment-terms')).json()
      if (termsJson.success) setTerms(termsJson.data)
      toast.success(editingTerm ? `Payment term "${termForm.name}" updated` : `Payment term "${termForm.name}" created`)
    } catch (err: any) {
      setTermError(err.message)
      toast.error(err.message || 'Failed to save payment term')
    } finally {
      setTermSaving(false)
    }
  }

  // --- Delete (soft delete, with undo) ---
  const restoreTerm = async (term: PaymentTerm) => {
    try {
      const res = await fetch(`/api/payment-terms/${term.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: term.code,
          name: term.name,
          daysUntilDue: term.daysUntilDue,
          discountPercent: term.discountPercent,
          discountDays: term.discountDays,
          isActive: true,
        }),
      })
      if (!res.ok) throw new Error('Restore failed')
      const termsJson = await (await fetch('/api/payment-terms')).json()
      if (termsJson.success) setTerms(termsJson.data)
      toast.success(`Payment term "${term.name}" restored`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to restore payment term')
    }
  }

  const handleDeleteTerm = async () => {
    if (!deleteTerm) return
    const deleted = deleteTerm
    try {
      const res = await fetch(`/api/payment-terms/${deleted.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setDeleteTerm(null)
      const termsJson = await (await fetch('/api/payment-terms')).json()
      if (termsJson.success) setTerms(termsJson.data)
      toast.success(`Payment term "${deleted.name}" deleted`, {
        action: { label: 'Undo', onClick: () => restoreTerm(deleted) },
        duration: 8000,
      })
    } catch (err: any) {
      setError('Failed to delete payment term')
      toast.error(err?.message || 'Failed to delete payment term')
    }
  }

  // ---------- Document Sequences ----------
  const openEditSeq = (seq: DocumentSequence) => {
    setEditingSeq(seq)
    setSeqForm({ prefix: seq.prefix, nextNumber: seq.nextNumber, padding: seq.padding })
    setSeqError('')
    setSeqFormOpen(true)
  }

  const handleSaveSeq = async () => {
    if (!editingSeq) return
    setSeqSaving(true)
    setSeqError('')
    try {
      const res = await fetch('/api/document-sequences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingSeq.id, version: editingSeq.version, ...seqForm }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      const json = await res.json(); const updated = json.data || json
      setSequences(updated)
      setSeqFormOpen(false)
      toast.success(`Document sequence "${editingSeq.documentType}" updated`)
    } catch (err: any) {
      setSeqError(err.message)
      toast.error(err.message || 'Failed to save document sequence')
    } finally {
      setSeqSaving(false)
    }
  }

  // ---------- Render ----------
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading settings...</p>
      </div>
    )
  }

  if (error && !company && periods.length === 0 && terms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button onClick={fetchAll} className="mt-3 text-sm font-medium text-brand-500 hover:text-brand-600">Try again</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">System Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage company information, fiscal periods, payment terms, and document numbering.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 pb-px overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all -mb-px ${
              activeTab === tab.key
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ---------- Tab: Company Info ---------- */}
      {activeTab === 'company' && (
        <div className="max-w-2xl">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Company Information</h2>
              <div className="flex items-center gap-3">
                {companySaved && (
                  <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                    <CheckCircle className="w-3.5 h-3.5" /> Saved
                  </span>
                )}
                <button
                  onClick={handleCompanySave}
                  disabled={companySaving || !companyForm?.name.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {companySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {companySaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            {companyForm && (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Company Name <span className="text-red-400">*</span></label>
                  <input type="text" value={companyForm.name} onChange={e => setCompanyForm({ ...companyForm, name: e.target.value })}
                    placeholder="Your Company Name"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    <Hash className="w-3.5 h-3.5 inline mr-1" /> Registration No.
                  </label>
                  <input type="text" value={companyForm.registrationNumber} onChange={e => setCompanyForm({ ...companyForm, registrationNumber: e.target.value })}
                    placeholder="CRN-12345"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    <Hash className="w-3.5 h-3.5 inline mr-1" /> Tax Registration No.
                  </label>
                  <input type="text" value={companyForm.taxRegistrationNumber} onChange={e => setCompanyForm({ ...companyForm, taxRegistrationNumber: e.target.value })}
                    placeholder="VAT-67890"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    <MapPin className="w-3.5 h-3.5 inline mr-1" /> Address
                  </label>
                  <input type="text" value={companyForm.address} onChange={e => setCompanyForm({ ...companyForm, address: e.target.value })}
                    placeholder="123 Main Street"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">City</label>
                  <input type="text" value={companyForm.city} onChange={e => setCompanyForm({ ...companyForm, city: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    <Globe className="w-3.5 h-3.5 inline mr-1" /> Country
                  </label>
                  <input type="text" value={companyForm.country} onChange={e => setCompanyForm({ ...companyForm, country: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    <Phone className="w-3.5 h-3.5 inline mr-1" /> Phone
                  </label>
                  <input type="text" value={companyForm.phone} onChange={e => setCompanyForm({ ...companyForm, phone: e.target.value })}
                    placeholder="+1 555-0000"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    <Mail className="w-3.5 h-3.5 inline mr-1" /> Email
                  </label>
                  <input type="email" value={companyForm.email} onChange={e => setCompanyForm({ ...companyForm, email: e.target.value })}
                    placeholder="info@company.com"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    <Globe className="w-3.5 h-3.5 inline mr-1" /> Website
                  </label>
                  <input type="text" value={companyForm.website} onChange={e => setCompanyForm({ ...companyForm, website: e.target.value })}
                    placeholder="https://company.com"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    <DollarSign className="w-3.5 h-3.5 inline mr-1" /> Base Currency
                  </label>
                  <input type="text" value={companyForm.baseCurrencyCode} onChange={e => setCompanyForm({ ...companyForm, baseCurrencyCode: e.target.value.toUpperCase() })}
                    placeholder="USD"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    <Calendar className="w-3.5 h-3.5 inline mr-1" /> Fiscal Year Start
                  </label>
                  <select value={companyForm.fiscalYearStartMonth} onChange={e => setCompanyForm({ ...companyForm, fiscalYearStartMonth: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                    {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {!companyForm && (
              <div className="flex flex-col items-center justify-center py-10">
                <Building className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No company information set yet</p>
                <button onClick={() => setCompanyForm({
                  name: '', registrationNumber: '', taxRegistrationNumber: '', address: '',
                  city: '', country: '', phone: '', email: '', website: '',
                  baseCurrencyCode: 'USD', fiscalYearStartMonth: 1,
                })}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors">
                  <Plus className="w-4 h-4" /> Add Company Info
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- Tab: Fiscal Periods ---------- */}
      {activeTab === 'fiscal-periods' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Open periods allow posting transactions. Close periods to lock financial data.
            </p>
            <button
              onClick={() => { setPeriodForm(emptyPeriodForm()); setPeriodError(''); setPeriodFormOpen(true) }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> New Period
            </button>
          </div>

          {periods.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-gray-200 dark:border-gray-800">
              <Calendar className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">No fiscal periods defined</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Create a fiscal period to start posting transactions</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                    <th className="text-start px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Name</th>
                    <th className="text-start px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Start Date</th>
                    <th className="text-start px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">End Date</th>
                    <th className="text-start px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Status</th>
                    <th className="text-start px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Closed By</th>
                    <th className="text-end px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {periods.map(period => (
                    <tr key={period.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{period.name}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{period.startDate}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{period.endDate}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          period.status === 'open'
                            ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                            : period.status === 'closed'
                            ? 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                        }`}>
                          {period.status === 'open' ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          {period.status.charAt(0).toUpperCase() + period.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{period.closedBy || '—'}</td>
                      <td className="px-4 py-3 text-end">
                        {period.status === 'open' && (
                          <button
                            onClick={() => setCloseConfirm(period)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          >
                            Close Period
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---------- Tab: Payment Terms ---------- */}
      {activeTab === 'payment-terms' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <SearchInput value={termSearch} onChange={setTermSearch} placeholder="Search terms..." className="max-w-sm" />
            <button onClick={openAddTerm}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm">
              <Plus className="w-4 h-4" /> Add Term
            </button>
          </div>

          {filteredTerms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-gray-200 dark:border-gray-800">
              <CreditCard className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {termSearch ? 'No payment terms match your search' : 'No payment terms yet'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTerms.map(term => (
                <div key={term.id}
                  className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{term.code}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{term.name}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      term.isActive ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      {term.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-2.5 py-1.5">
                      <p className="text-gray-400">Due In</p>
                      <p className="font-medium text-gray-900 dark:text-white mt-0.5">{term.daysUntilDue} days</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-2.5 py-1.5">
                      <p className="text-gray-400">Disc. %</p>
                      <p className="font-medium text-gray-900 dark:text-white mt-0.5">{term.discountPercent}%</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-2.5 py-1.5">
                      <p className="text-gray-400">Disc. Days</p>
                      <p className="font-medium text-gray-900 dark:text-white mt-0.5">{term.discountDays}d</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <button onClick={() => openEditTerm(term)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors" title="Edit">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteTerm(term)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------- Tab: Document Sequences ---------- */}
      {activeTab === 'sequences' && (
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Configure document numbering prefixes, starting numbers, and padding for each document type.
          </p>

          {sequences.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-gray-200 dark:border-gray-800">
              <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No document sequences configured</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Sequences are auto-created when documents are first generated</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sequences.map(seq => (
                <div key={seq.id}
                  className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:shadow-lg transition-all duration-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                        {seq.documentType.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Document Type</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/30 px-2.5 py-1 rounded-lg">
                        {seq.prefix}{String(seq.nextNumber).padStart(seq.padding, '0')}
                      </span>
                      <button onClick={() => openEditSeq(seq)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors" title="Edit">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>Prefix: <strong className="text-gray-700 dark:text-gray-300 font-mono">{seq.prefix}</strong></span>
                    <span>Next #: <strong className="text-gray-700 dark:text-gray-300 font-mono">{seq.nextNumber}</strong></span>
                    <span>Padding: <strong className="text-gray-700 dark:text-gray-300 font-mono">{seq.padding}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------- Tab: Aging Buckets ---------- */}
      {activeTab === 'aging-buckets' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configure aging period ranges for partner payment aging reports.
            </p>
            {bucketSaved && (
              <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                <CheckCircle className="w-3.5 h-3.5" /> Saved
              </span>
            )}
          </div>

          {bucketError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 mb-4">
              <p className="text-sm text-red-600 dark:text-red-400">{bucketError}</p>
            </div>
          )}

          {buckets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-gray-200 dark:border-gray-800">
              <Clock className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No aging buckets configured</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {buckets.map(bucket => (
                <EditableBucketCard
                  key={bucket.id}
                  bucket={bucket}
                  onSave={async (data) => {
                    setBucketSaving(true)
                    setBucketError('')
                    try {
                      const res = await fetch('/api/settings/aging-buckets', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data),
                      })
                      if (!res.ok) {
                        const err = await res.json()
                        throw new Error(err.error || 'Save failed')
                      }
                      const json = await res.json()
                      setBuckets(json.data || json)
                      setBucketSaved(true)
                      setTimeout(() => setBucketSaved(false), 3000)
                      toast.success(`Aging bucket "${bucket.label}" updated`)
                    } catch (err: any) {
                      setBucketError(err.message)
                      toast.error(err.message || 'Failed to save aging bucket')
                    } finally {
                      setBucketSaving(false)
                    }
                  }}
                  saving={bucketSaving}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========== MODALS ========== */}

      {/* New Period Modal */}
      <Modal isOpen={periodFormOpen} onClose={() => setPeriodFormOpen(false)} className="max-w-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create Fiscal Period</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name <span className="text-red-400">*</span></label>
            <input type="text" value={periodForm.name} onChange={e => setPeriodForm({ ...periodForm, name: e.target.value })}
              placeholder="e.g. FY 2026 Q1"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Start Date <span className="text-red-400">*</span></label>
              <DatePicker value={periodForm.startDate} onChange={(v) => setPeriodForm({ ...periodForm, startDate: v })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">End Date <span className="text-red-400">*</span></label>
              <DatePicker value={periodForm.endDate} onChange={(v) => setPeriodForm({ ...periodForm, endDate: v })} />
            </div>
          </div>
          {periodError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2">
              <p className="text-sm text-red-600 dark:text-red-400">{periodError}</p>
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" size="sm" onClick={() => setPeriodFormOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreatePeriod} disabled={periodSaving || !periodForm.name || !periodForm.startDate || !periodForm.endDate}>
              {periodSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {periodSaving ? 'Creating...' : 'Create Period'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Close Period Confirmation */}
      <Modal isOpen={!!closeConfirm} onClose={() => setCloseConfirm(null)} className="max-w-md p-6">
        {closeConfirm && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-50 dark:bg-amber-950/50 p-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Close Fiscal Period</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{closeConfirm.name}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to close <strong>{closeConfirm.name}</strong> ({closeConfirm.startDate} — {closeConfirm.endDate})?
              Once closed, no new transactions can be posted to this period.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setCloseConfirm(null)}>Cancel</Button>
              <Button size="sm" onClick={handleClosePeriod} className="bg-amber-500 hover:bg-amber-600">
                Close Period
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Payment Term Form Modal */}
      <Modal isOpen={termFormOpen} onClose={() => setTermFormOpen(false)} className="max-w-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {editingTerm ? 'Edit Payment Term' : 'Create Payment Term'}
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Code <span className="text-red-400">*</span></label>
              <input type="text" value={termForm.code} onChange={e => setTermForm({ ...termForm, code: e.target.value.toUpperCase() })}
                placeholder="NET30"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name <span className="text-red-400">*</span></label>
              <input type="text" value={termForm.name} onChange={e => setTermForm({ ...termForm, name: e.target.value })}
                placeholder="Net 30 Days"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Days Until Due</label>
              <input type="number" value={termForm.daysUntilDue} onChange={e => setTermForm({ ...termForm, daysUntilDue: Number(e.target.value) })}
                min="0"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Discount %</label>
              <input type="number" value={termForm.discountPercent} onChange={e => setTermForm({ ...termForm, discountPercent: Number(e.target.value) })}
                min="0" max="100" step="0.1"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Discount Days</label>
              <input type="number" value={termForm.discountDays} onChange={e => setTermForm({ ...termForm, discountDays: Number(e.target.value) })}
                min="0"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
            </div>
          </div>
          {termError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2">
              <p className="text-sm text-red-600 dark:text-red-400">{termError}</p>
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" size="sm" onClick={() => setTermFormOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveTerm} disabled={termSaving || !termForm.code || !termForm.name}>
              {termSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {termSaving ? 'Saving...' : editingTerm ? 'Update Term' : 'Create Term'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Term Confirmation */}
      <Modal isOpen={!!deleteTerm} onClose={() => setDeleteTerm(null)} className="max-w-md p-6">
        {deleteTerm && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-50 dark:bg-red-950/50 p-2.5">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Payment Term</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{deleteTerm.code} — {deleteTerm.name}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to deactivate <strong>{deleteTerm.name}</strong>?
              Partners using this term will remain unchanged but it won't be available for new selections.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTerm(null)}>Cancel</Button>
              <Button size="sm" onClick={handleDeleteTerm} className="bg-red-500 hover:bg-red-600">Deactivate</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Sequence Modal */}
      <Modal isOpen={seqFormOpen} onClose={() => setSeqFormOpen(false)} className="max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Edit Document Sequence: {editingSeq?.documentType.replace(/_/g, ' ')}
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Prefix</label>
              <input type="text" value={seqForm.prefix} onChange={e => setSeqForm({ ...seqForm, prefix: e.target.value })}
                placeholder="e.g. INV-"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Next Number</label>
              <input type="number" value={seqForm.nextNumber} onChange={e => setSeqForm({ ...seqForm, nextNumber: Number(e.target.value) })}
                min="1"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Padding</label>
              <input type="number" value={seqForm.padding} onChange={e => setSeqForm({ ...seqForm, padding: Number(e.target.value) })}
                min="1" max="10"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
            </div>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Example output:</p>
            <p className="text-sm font-mono font-semibold text-brand-600 dark:text-brand-400 mt-1">
              {seqForm.prefix}{String(seqForm.nextNumber).padStart(seqForm.padding, '0')}
            </p>
          </div>
          {seqError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2">
              <p className="text-sm text-red-600 dark:text-red-400">{seqError}</p>
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" size="sm" onClick={() => setSeqFormOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveSeq} disabled={seqSaving}>
              {seqSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {seqSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ---------- EditableBucketCard ----------
function EditableBucketCard({ bucket, onSave, saving }: { bucket: AgingBucket; onSave: (data: any) => Promise<void>; saving: boolean }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...bucket })

  useEffect(() => { setForm({ ...bucket }) }, [bucket])

  if (!editing) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:shadow-lg transition-all duration-200">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{bucket.label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {bucket.fromDays} to {bucket.toDays >= 999999 ? '∞' : bucket.toDays} days overdue
            </p>
          </div>
          <button onClick={() => setEditing(true)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors" title="Edit">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-gray-500 dark:text-gray-400">
          <span>Sort order: <strong className="text-gray-700 dark:text-gray-300">{bucket.sortOrder}</strong></span>
        </div>
      </div>
    )
  }

  const handleSave = async () => {
    await onSave({ ...form, id: bucket.id, version: bucket.version })
    setEditing(false)
  }

  return (
    <div className="rounded-2xl border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/20 p-5">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Label</label>
          <input type="text" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">From (days)</label>
            <input type="number" value={form.fromDays} onChange={e => setForm({ ...form, fromDays: Number(e.target.value) })}
              min="0"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">To (days)</label>
            <input type="number" value={form.toDays >= 999999 ? 999999 : form.toDays} onChange={e => setForm({ ...form, toDays: Number(e.target.value) })}
              min="0"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Sort Order</label>
          <input type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: Number(e.target.value) })}
            min="1"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={() => setEditing(false)}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !form.label}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
