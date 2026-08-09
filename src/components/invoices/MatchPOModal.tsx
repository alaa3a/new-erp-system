'use client'
import { ModalHeader, SearchInput } from '@/components/ui'

import { Loader2, Link2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'

interface PurchaseOrder {
  id: number
  poNumber: string
  partnerName: string
  status: string
}

interface MatchPOModalProps {
  isOpen: boolean
  onClose: () => void
  invoiceNumber?: string
  partnerName?: string
  poList: PurchaseOrder[]
  loading: boolean
  search: string
  onSearchChange: (value: string) => void
  selectedPOId: number | null
  onSelectPO: (id: number) => void
  error: string
  submitting: boolean
  onMatch: () => void
}

export default function MatchPOModal({
  isOpen,
  onClose,
  invoiceNumber,
  partnerName,
  poList,
  loading,
  search,
  onSearchChange,
  selectedPOId,
  onSelectPO,
  error,
  submitting,
  onMatch,
}: MatchPOModalProps) {
  const filtered = search.trim()
    ? poList.filter(po =>
        po.poNumber.toLowerCase().includes(search.toLowerCase()) ||
        po.partnerName.toLowerCase().includes(search.toLowerCase())
      )
    : poList

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg p-0" showCloseButton={false}>
      <ModalHeader
        title="Match to Purchase Order"
        subtitle={invoiceNumber && partnerName ? `${invoiceNumber} — ${partnerName}` : undefined}
        onClose={onClose}
      />
      <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
        <SearchInput value={search} onChange={onSearchChange} placeholder="Search by PO number or vendor..." />

        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading POs...
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center py-8 text-sm text-gray-400">No matching purchase orders found.</p>
            ) : (
              filtered.map(po => (
                <button key={po.id} onClick={() => onSelectPO(po.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${
                    selectedPOId === po.id
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 dark:border-brand-400'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white font-mono">{po.poNumber}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{po.partnerName}</p>
                    </div>
                    <span className={`inline-flex text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                      po.status === 'draft' ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400' :
                      po.status === 'approved' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400' :
                      po.status === 'fully_received' ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400' :
                      'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }`}>{po.status.replace(/_/g, ' ')}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-2.5">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}
      </div>
      <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={onMatch} disabled={!selectedPOId || submitting}
          className="flex items-center gap-2 !bg-brand-600 hover:!bg-brand-700">
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
          Match Invoice
        </Button>
      </div>
    </Modal>
  )
}
