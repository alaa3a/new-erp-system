'use client'
import { formatCurrency } from '@/lib/formatters'

import { useState, useEffect } from 'react'
import { Loader2, DollarSign, CheckCircle, AlertTriangle } from 'lucide-react'
import DatePicker from '@/components/form/input/DatePicker'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import type { Invoice, PostingProfile } from '@/types/erp'

interface RecordPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  invoice: Invoice
  invoiceType: 'sales' | 'purchase'
  onSuccess: () => void
}

/**
 * Records a payment as a journal-entry payment line (Phase 8 cut-over).
 * The entry carries a `payment` clearing line with a per-invoice allocation plus
 * a `normal` cash line; posting it applies the allocation to the invoice's
 * paidAmount/status via the shared payment engine (postEntry → applyPaymentAllocation).
 */
export default function RecordPaymentModal({
  isOpen,
  onClose,
  invoice,
  invoiceType,
  onSuccess,
}: RecordPaymentModalProps) {
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [reference, setReference] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [profiles, setProfiles] = useState<PostingProfile[]>([])

  useEffect(() => {
    if (!isOpen) return
    fetch('/api/posting-profiles')
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.success) setProfiles(json.data) })
      .catch(() => { /* silent — fall back to defaults */ })
  }, [isOpen])

  const balanceDue = invoice.totalAmount - invoice.paidAmount
  const maxPayment = balanceDue
  const isValidAmount = amount && Number(amount) > 0 && Number(amount) <= maxPayment / 100

  // Account resolution: the invoice's own profile → per-type default → global default → seed fallbacks.
  const profile = profiles.find(p => p.id === invoice.postingProfileId)
    || profiles.find(p => p.invoiceType === invoiceType && p.isDefault)
    || profiles.find(p => p.invoiceType === invoiceType)
    || profiles.find(p => p.isDefault)
    || profiles[0]
  const controlAccount = invoiceType === 'sales'
    ? (profile?.accountsReceivableCode || '102')
    : (profile?.accountsPayableCode || '201')
  const cashAccount = profile?.cashAccountCode || '101'

  const reset = () => {
    setAmount('')
    setPaymentDate(new Date().toISOString().split('T')[0])
    setReference('')
    setError('')
    setSuccess(false)
    setSubmitting(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async () => {
    if (!isValidAmount) return
    if (!invoice.businessPartnerId) {
      setError('This invoice has no linked partner — cannot record a payment against it.')
      return
    }
    setSubmitting(true)
    setError('')

    const amountCents = Math.round(Number(amount) * 100)

    try {
      // Payment entry: AR/AP clearing (`payment`, with the allocation) + cash (`normal`).
      // Posting it applies the allocation to the invoice automatically (postEntry).
      const isSales = invoiceType === 'sales'
      const entryBody = {
        entryDate: paymentDate,
        description: `${isSales ? 'Payment received' : 'Payment made'} - ${invoice.invoiceNumber} (${invoice.partnerName})`,
        referenceNumber: reference.trim() || invoice.invoiceNumber,
        entryCategoryId: profile?.entryCategoryId ?? null,
        lines: [
          {
            accountCode: controlAccount,
            description: `${isSales ? 'AR clearing' : 'AP clearing'} - ${invoice.invoiceNumber}`,
            debitAmount: isSales ? 0 : amountCents,
            creditAmount: isSales ? amountCents : 0,
            lineType: 'payment',
            businessPartnerId: invoice.businessPartnerId,
            costCenterId: null,
            vatCodeId: null,
            vatAmount: 0,
            supplierName: null,
            supplierTaxId: null,
            invoiceNumber: null,
            invoiceDate: null,
            allocations: [{ invoiceId: invoice.id, amount: amountCents, notes: reference.trim() || '' }],
          },
          {
            accountCode: cashAccount,
            description: `Cash - ${invoice.invoiceNumber}`,
            debitAmount: isSales ? amountCents : 0,
            creditAmount: isSales ? 0 : amountCents,
            lineType: 'normal',
            businessPartnerId: null,
            costCenterId: null,
            vatCodeId: null,
            vatAmount: 0,
            supplierName: null,
            supplierTaxId: null,
            invoiceNumber: null,
            invoiceDate: null,
            allocations: [],
          },
        ],
      }

      const entryRes = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entryBody),
      })

      if (!entryRes.ok) {
        const err = await entryRes.json()
        throw new Error(err.error || 'Failed to create payment entry')
      }

      const entry = await entryRes.json()
      const entryId = entry.data?.id

      // Step 2: Post the entry — postEntry applies the allocation to the invoice.
      const postRes = await fetch(`/api/entries/${entryId}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'post' }),
      })

      if (!postRes.ok) {
        const err = await postRes.json()
        throw new Error(err.error || 'Failed to post payment entry')
      }

      setSuccess(true)
      setTimeout(() => {
        handleClose()
        onSuccess()
      }, 2000)
    } catch (err: any) {
      setError(err?.message || 'An error occurred processing payment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} className="max-w-lg p-0" showCloseButton={false}>
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Record Payment
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {invoiceType === 'sales' ? 'Receive payment' : 'Make payment'} for {invoice.invoiceNumber}
        </p>
      </div>

      <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
        {/* Invoice summary */}
        <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Invoice Total</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
              {formatCurrency(invoice.totalAmount)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Paid So Far</p>
            <p className="text-sm font-semibold text-green-600 dark:text-green-400 mt-0.5">
              {formatCurrency(invoice.paidAmount)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Balance Due</p>
            <p className={`text-sm font-semibold mt-0.5 ${balanceDue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600'}`}>
              {formatCurrency(balanceDue)}
            </p>
          </div>
        </div>

        {/* Partner info */}
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <DollarSign className="w-4 h-4 text-gray-400" />
          <span>{invoice.partnerName}</span>
          <span className="text-gray-300 dark:text-gray-600">•</span>
          <span className="font-mono text-xs">{invoice.invoiceNumber}</span>
        </div>

        {/* Payment form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Payment Amount <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                min="0.01"
                max={maxPayment / 100}
                step="0.01"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-7 pr-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
            </div>
            {amount && !isValidAmount && (
              <p className="text-[11px] text-red-500 mt-1">
                Amount must be between $0.01 and {formatCurrency(maxPayment)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Payment Date</label>
            <DatePicker value={paymentDate} onChange={setPaymentDate} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reference</label>
            <input
              type="text"
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="Check #, transaction ID, or notes"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            />
          </div>
        </div>

        {/* Posting accounts (informational) */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400">
          Posts via journal entry: <span className="font-mono">{controlAccount}</span> (AR/AP) ↔ <span className="font-mono">{cashAccount}</span> (Cash)
        </div>

        {/* Success state */}
        {success && (
          <div className="rounded-lg bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 px-4 py-3 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">Payment recorded successfully!</p>
              <p className="text-xs text-green-600 dark:text-green-400">Invoice status has been updated.</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
        <Button variant="outline" size="sm" onClick={handleClose} disabled={submitting}>
          {success ? 'Close' : 'Cancel'}
        </Button>
        {!success && (
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !isValidAmount}
            className="flex items-center gap-2 !bg-green-600 hover:!bg-green-700"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {submitting ? 'Processing...' : `Record $${Number(amount || 0).toFixed(2)} Payment`}
          </Button>
        )}
      </div>
    </Modal>
  )
}
