'use client'
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import type { Entry } from '@/types/erp'

interface EntryConfirmationModalsProps {
  postTarget: Entry | null
  posting: boolean
  onPost: () => void
  onCancelPost: () => void
  cancelTarget: Entry | null
  onCancel: () => void
  onCancelCancelTarget: () => void
}

export default function EntryConfirmationModals({
  postTarget,
  posting,
  onPost,
  onCancelPost,
  cancelTarget,
  onCancel,
  onCancelCancelTarget,
}: EntryConfirmationModalsProps) {
  return (
    <>
      <Modal isOpen={!!postTarget} onClose={onCancelPost} className="max-w-md p-6">
        {postTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-green-50 dark:bg-green-950/50 p-2.5">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Post Entry</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{postTarget.entryNumber}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to post <strong>{postTarget.entryNumber}</strong>?
              This will lock the entry and update account balances. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={onCancelPost}>Cancel</Button>
              <Button size="sm" onClick={onPost} disabled={posting}
                className="flex items-center gap-2 !bg-green-600 hover:!bg-green-700">
                {posting && <Loader2 className="w-4 h-4 animate-spin" />}
                {posting ? 'Posting...' : 'Post Entry'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!cancelTarget} onClose={onCancelCancelTarget} className="max-w-md p-6">
        {cancelTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-50 dark:bg-red-950/50 p-2.5">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Cancel Entry</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{cancelTarget.entryNumber}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to cancel <strong>{cancelTarget.entryNumber}</strong>?
              This will mark the entry as cancelled and it won&apos;t affect financial reports.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={onCancelCancelTarget}>Cancel</Button>
              <Button size="sm" onClick={onCancel} className="!bg-red-500 hover:!bg-red-600">Cancel Entry</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
