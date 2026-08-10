'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Download,
  Upload,
  Database,
  Loader2,
  AlertTriangle,
  HardDrive,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react'
import Button from '@/components/ui/button/Button'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast/ToastProvider'

const LAST_BACKUP_KEY = 'erp:lastBackupAt'

function formatBytes(n: number): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

export default function BackupRestorePage() {
  const toast = useToast()
  const [status, setStatus] = useState<{ sizeBytes: number; lastModifiedAt: string | null }>({ sizeBytes: 0, lastModifiedAt: null })
  const [lastBackup, setLastBackup] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    fetch('/api/accounts/backup/status')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setStatus(json.data)
      })
      .catch(() => {})
    setLastBackup(typeof window !== 'undefined' ? window.localStorage.getItem(LAST_BACKUP_KEY) : null)
  }, [])

  const pickFile = useCallback((f: File | null) => {
    if (!f) return
    setSelectedFile(f)
    setConfirmError('')
  }, [])

  const handleBackup = async () => {
    setBackingUp(true)
    try {
      const res = await fetch('/api/accounts/backup')
      if (!res.ok) throw new Error(`Backup failed (HTTP ${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `erp-backup-${new Date().toISOString().slice(0, 10)}.sqlite`
      a.click()
      URL.revokeObjectURL(url)
      const now = new Date().toISOString()
      window.localStorage.setItem(LAST_BACKUP_KEY, now)
      setLastBackup(now)
      toast.success('Database backup downloaded')
    } catch (err: any) {
      toast.error(err.message || 'Backup failed')
    } finally {
      setBackingUp(false)
    }
  }

  const confirmRestore = () => {
    if (!selectedFile) {
      setConfirmError('Select a backup file first.')
      return
    }
    setConfirmError('')
    setConfirmOpen(true)
  }

  const handleRestore = async () => {
    setRestoring(true)
    setConfirmError('')
    try {
      const res = await fetch('/api/accounts/restore', {
        method: 'POST',
        body: selectedFile,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `Restore failed (HTTP ${res.status})`)
      setConfirmOpen(false)
      toast.success('Database restored — reloading...')
      window.location.reload()
    } catch (err: any) {
      setConfirmError(err.message || 'Restore failed. Check the file format.')
      setRestoring(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Backup &amp; Restore</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Download a full snapshot of the database and restore it later. The backup contains all data — accounts, cost centers, partners, products, invoices and more.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-4 py-3">
        <ShieldCheck className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-800 dark:text-blue-300">
          The backup is the entire database file. Restoring replaces all current data with the uploaded file — there is no merge. Download backups regularly and keep them somewhere safe.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Backup card */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center">
              <Download className="w-5 h-5 text-brand-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Backup Database</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Download the full database as a .sqlite file</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" /> Database size</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">{formatBytes(status.sizeBytes)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><Database className="w-3.5 h-3.5" /> Last saved</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">{formatTime(status.lastModifiedAt)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">Last backup downloaded</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">{formatTime(lastBackup)}</p>
            </div>
          </div>

          <Button onClick={handleBackup} disabled={backingUp} className="w-full">
            {backingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {backingUp ? 'Preparing backup...' : 'Download Backup'}
          </Button>
        </div>

        {/* Restore card */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
              <Upload className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Restore Database</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Replace all data from a .sqlite backup file</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              pickFile(e.dataTransfer.files?.[0] ?? null)
            }}
            className={`w-full rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
              dragging
                ? 'border-brand-400 bg-brand-50 dark:bg-brand-950/30'
                : 'border-gray-300 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-700'
            }`}
          >
            {selectedFile ? (
              <>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedFile.name}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatBytes(selectedFile.size)}</p>
                <p className="mt-3 text-xs text-brand-500">Click or drop a different file</p>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500" />
                <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Click to choose or drop a backup file</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Accepts .sqlite backup files from the Backup button above</p>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sqlite,application/octet-stream"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />

          <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Restoring replaces the entire database. This cannot be undone — make a backup first.
            </p>
          </div>

          <Button onClick={confirmRestore} disabled={!selectedFile} className="w-full bg-amber-500 hover:bg-amber-600">
            <Upload className="w-4 h-4" />
            Restore Database
          </Button>
        </div>
      </div>

      {/* Restore confirm modal */}
      <Modal isOpen={confirmOpen} onClose={() => { if (!restoring) setConfirmOpen(false) }} className="max-w-md p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Restore database?</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            All current data will be replaced with the contents of <span className="font-medium text-gray-900 dark:text-white">{selectedFile?.name}</span>. This action cannot be undone.
          </p>
          {confirmError && <p className="text-sm text-red-600 dark:text-red-400">{confirmError}</p>}
          <div className="flex items-center gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)} disabled={restoring}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-red-500 hover:bg-red-600"
              onClick={handleRestore}
              disabled={restoring}
            >
              {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {restoring ? 'Restoring...' : 'Restore Now'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
