'use client'
import { Loader2, CheckCircle, AlertTriangle, BadgeCheck, X } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import type { Invoice } from '@/types/erp'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  target: Invoice | null
  loading: boolean
  icon: React.ReactNode
  title: string
  message: React.ReactNode
  warning?: string
  confirmLabel: string
  confirmColor: string
}

function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  target,
  loading,
  icon,
  title,
  message,
  warning,
  confirmLabel,
  confirmColor,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-sm p-6">
      <div className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-opacity-10 flex items-center justify-center mb-4">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{message}</p>
        {warning && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> {warning}
          </p>
        )}
      </div>
      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button size="sm" onClick={onConfirm} disabled={loading}
          className={`flex items-center gap-2 ${confirmColor}`}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {loading ? `${confirmLabel}...` : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

interface CancelModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  target: Invoice | null
  titlePrefix: string
}

export function CancelInvoiceModal({ isOpen, onClose, onConfirm, target, titlePrefix }: CancelModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-sm p-6">
      <div className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{titlePrefix}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Cancel invoice <strong>{target?.invoiceNumber}</strong>? It will be marked as cancelled and cannot be posted.
        </p>
      </div>
      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button variant="outline" size="sm" onClick={onClose}>Keep</Button>
        <Button size="sm" onClick={onConfirm}
          className="flex items-center gap-2 !bg-red-600 hover:!bg-red-700">
          <X className="w-3.5 h-3.5" /> Cancel Invoice
        </Button>
      </div>
    </Modal>
  )
}

interface InvoiceConfirmationModalsProps {
  approveTarget: Invoice | null
  approveLoading: boolean
  onApprove: () => void
  onCancelApprove: () => void
  postTarget: Invoice | null
  postLoading: boolean
  onPost: () => void
  onCancelPost: () => void
  cancelTarget: Invoice | null
  onCancel: () => void
  onCancelCancelTarget: () => void
  unlinkPOTarget: Invoice | null
  unlinkPOLoading: boolean
  onUnlinkPO: () => void
  onCancelUnlinkPO: () => void
  cancelTitlePrefix: string
}

export default function InvoiceConfirmationModals({
  approveTarget,
  approveLoading,
  onApprove,
  onCancelApprove,
  postTarget,
  postLoading,
  onPost,
  onCancelPost,
  cancelTarget,
  onCancel,
  onCancelCancelTarget,
  unlinkPOTarget,
  unlinkPOLoading,
  onUnlinkPO,
  onCancelUnlinkPO,
  cancelTitlePrefix,
}: InvoiceConfirmationModalsProps) {
  return (
    <>
      <ConfirmModal
        isOpen={!!approveTarget}
        onClose={onCancelApprove}
        onConfirm={onApprove}
        target={approveTarget}
        loading={approveLoading}
        icon={<div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center"><BadgeCheck className="w-6 h-6 text-indigo-500" /></div>}
        title="Approve Invoice"
        message={<>Are you sure you want to approve <span className="font-medium text-gray-700 dark:text-gray-300">{approveTarget?.invoiceNumber}</span>? Approved invoices can still be edited before posting.</>}
        confirmLabel="Approve"
        confirmColor="!bg-indigo-600 hover:!bg-indigo-700"
      />

      <ConfirmModal
        isOpen={!!postTarget}
        onClose={onCancelPost}
        onConfirm={onPost}
        target={postTarget}
        loading={postLoading}
        icon={<div className="w-12 h-12 rounded-full bg-green-50 dark:bg-green-950/50 flex items-center justify-center"><CheckCircle className="w-6 h-6 text-green-500" /></div>}
        title="Post Invoice"
        message={<>This will create journal entries, update stock, and post invoice <strong>{postTarget?.invoiceNumber}</strong>.</>}
        warning="This action cannot be undone."
        confirmLabel="Confirm Post"
        confirmColor="!bg-green-600 hover:!bg-green-700"
      />

      <CancelInvoiceModal
        isOpen={!!cancelTarget}
        onClose={onCancelCancelTarget}
        onConfirm={onCancel}
        target={cancelTarget}
        titlePrefix={cancelTitlePrefix}
      />

      <ConfirmModal
        isOpen={!!unlinkPOTarget}
        onClose={onCancelUnlinkPO}
        onConfirm={onUnlinkPO}
        target={unlinkPOTarget}
        loading={unlinkPOLoading}
        icon={<div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/50 flex items-center justify-center"><AlertTriangle className="w-6 h-6 text-red-500" /></div>}
        title="Unlink Purchase Order"
        message={<>Unlink <strong>{unlinkPOTarget?.invoiceNumber}</strong> from its linked purchase order? This will reset the invoiced quantities on the PO lines.</>}
        confirmLabel="Unlink PO"
        confirmColor="!bg-red-600 hover:!bg-red-700"
      />
    </>
  )
}
