import { db } from '../db';
import { invoiceRepository } from '../repositories/invoiceRepository';
import { entryRepository } from '../repositories/entryRepository';
import { accountRepository } from '../repositories/accountRepository';
import { partnerRepository } from '../repositories/partnerRepository';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { postingProfileRepository } from '../repositories/postingProfileRepository';
import { taxCodeRepository } from '../repositories/taxCodeRepository';
import { notificationRepository } from '../repositories/userRepository';
import { resolveAr, resolveAp } from './postingProfileService';
import { BusinessRuleError, NotFoundError } from '../utils/errors';

export const invoiceService = {
  approveInvoice(invoiceId: number, userId: string): void {
    const invoice = invoiceRepository.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    if (invoice.status !== 'draft') throw new BusinessRuleError('Only draft invoices can be approved');
    if (invoice.approvedBy) throw new BusinessRuleError('Invoice is already approved');

    const transaction = db.transaction(() => {
      invoiceRepository.approve(invoiceId, userId);

      const allUsers = db.prepare('SELECT id FROM users WHERE isActive = 1').all() as { id: number }[];
      for (const user of allUsers) {
        notificationRepository.create({
          userId: user.id,
          type: 'success',
          title: 'Invoice Approved',
          message: `${invoice.invoiceNumber} — ${invoice.partnerName} has been approved by user #${userId}.`,
          entityType: 'invoice',
          entityId: invoiceId,
        });
      }
    });

    transaction();
  },


  previewPosting(invoiceId: number): { entries: any[]; stockMovements: any[] } {
    const invoice = invoiceRepository.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    if (invoice.status !== 'draft') throw new BusinessRuleError('Only draft invoices can be posted');

    const lines = invoiceRepository.findLines(invoiceId);
    if (lines.length === 0) throw new BusinessRuleError('Invoice must have at least one line');

    const profile = invoice.postingProfileId ? postingProfileRepository.findById(invoice.postingProfileId) : null;
    const entries: any[] = [];
    const stockMovements: any[] = [];

    for (const line of lines) {
      entries.push({
        accountCode: line.accountCode,
        description: line.description,
        debitAmount: invoice.type === 'sales' || invoice.type === 'debit_note' ? line.lineTotal : 0,
        creditAmount: invoice.type === 'purchase' || invoice.type === 'credit_note' ? line.lineTotal : 0,
      });

      if (line.vatAmount > 0) {
        const taxType = line.vatCodeId ? taxCodeRepository.findById(line.vatCodeId) : null;
        const vatAccount = taxType?.accountCode || (invoice.type === 'sales' || invoice.type === 'debit_note' ? '2100' : '2200');
        if (invoice.type === 'sales' || invoice.type === 'debit_note') {
          entries.push({ accountCode: vatAccount, description: `VAT - ${line.description}`, debitAmount: 0, creditAmount: line.vatAmount, vatCodeId: line.vatCodeId });
        } else {
          entries.push({ accountCode: vatAccount, description: `VAT - ${line.description}`, debitAmount: line.vatAmount, creditAmount: 0, vatCodeId: line.vatCodeId });
        }
      }

      if (line.warehouseId && line.lineType !== 'service') {
        stockMovements.push({ productId: line.productId, warehouseId: line.warehouseId, quantity: invoice.type === 'sales' || invoice.type === 'debit_note' ? -line.quantity : line.quantity, unitCost: line.unitPrice });
      }
    }

    const arAccount = resolveAr(profile);
    const apAccount = resolveAp(profile);
    if (invoice.type === 'sales' || invoice.type === 'debit_note') {
      entries.push({ accountCode: arAccount, description: `Receivable - ${invoice.invoiceNumber}`, debitAmount: invoice.totalAmount, creditAmount: 0 });
    } else {
      entries.push({ accountCode: apAccount, description: `Payable - ${invoice.invoiceNumber}`, debitAmount: 0, creditAmount: invoice.totalAmount });
    }

    return { entries, stockMovements };
  },

  postInvoice(invoiceId: number, userId: string): void {
    const invoice = invoiceRepository.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    if (invoice.status !== 'draft') throw new BusinessRuleError('Only draft invoices can be posted');

    const transaction = db.transaction(() => {
      const { entries, stockMovements } = this.previewPosting(invoiceId);

      // Auto-generated entries get the posting profile's default entry category,
      // so they are not invisible under the Category filter (Phase 5).
      const profile = invoice.postingProfileId ? postingProfileRepository.findById(invoice.postingProfileId) : null;
      const entryId = entryRepository.create({
        entryDate: invoice.invoiceDate,
        description: `Invoice ${invoice.invoiceNumber}`,
        linkedInvoiceId: invoiceId,
        categoryId: profile?.entryCategoryId ?? null,
        createdBy: userId,
      });

      let lineNum = 1;
      const totalDebit = entries.reduce((sum, e) => sum + e.debitAmount, 0);
      const totalCredit = entries.reduce((sum, e) => sum + e.creditAmount, 0);

      for (const e of entries) {
        // Inherit the account's link dimension (D2): a cost-center-linked account
        // gets the linked CC; a partner-linked account gets the invoice's partner.
        const acct = e.accountCode ? accountRepository.findByCode(e.accountCode) : null;
        const inheritedCcId = acct?.linkType === 'cost_center' && acct.linkId ? acct.linkId : null;
        // Inherit the invoice partner only when it matches the account's link filter (customer | vendor | both)
        let inheritedPartnerId: number | null = null;
        if (acct?.linkType === 'partner' && acct.linkId && invoice.businessPartnerId) {
          const partner = partnerRepository.findById(invoice.businessPartnerId);
          const filter = acct.linkPartnerFilter || 'both';
          if (partner && partner.status === 'active') {
            const matches = filter === 'both'
              || (filter === 'customer' && partner.type !== 'vendor')
              || (filter === 'vendor' && partner.type !== 'customer');
            if (matches) inheritedPartnerId = invoice.businessPartnerId;
          }
        }
        entryRepository.addLine({
          entryId, lineNumber: lineNum++, accountCode: e.accountCode, description: e.description,
          debitAmount: e.debitAmount, creditAmount: e.creditAmount,
          businessPartnerId: inheritedPartnerId, costCenterId: inheritedCcId, employeeId: null,
          vatCodeId: e.vatCodeId ?? null,
          vatAmount: e.vatCodeId ? e.debitAmount + e.creditAmount : 0,
          lineType: e.vatCodeId ? 'tax' : 'normal',
          supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
          taxDetailsJson: null,
        });
      }
      entryRepository.updateTotals(entryId, totalDebit, totalCredit);
      entryRepository.updateStatus(entryId, 'posted', userId);

      for (const sm of stockMovements) {
        inventoryRepository.upsertStock(sm.productId, sm.warehouseId, sm.quantity, sm.unitCost);
        inventoryRepository.recordMovement({ type: sm.quantity > 0 ? 'receipt' : 'issue', productId: sm.productId, warehouseId: sm.warehouseId, quantity: sm.quantity, unitCost: sm.unitCost, referenceType: 'invoice', referenceId: invoiceId, referenceNumber: invoice.invoiceNumber, postedBy: userId });
      }

      invoiceRepository.updateStatus(invoiceId, 'posted', userId);

      // Create notification
      const notifTitle = invoice.type === 'sales' ? 'Invoice Posted' : invoice.type === 'purchase' ? 'Purchase Posted' : invoice.type === 'credit_note' ? 'Credit Note Posted' : 'Debit Note Posted';
      const notifMessage = `${invoice.invoiceNumber} — ${invoice.partnerName} (${invoice.type === 'sales' || invoice.type === 'debit_note' ? '$' + (invoice.totalAmount / 100).toFixed(2) + ' receivable' : '$' + (invoice.totalAmount / 100).toFixed(2) + ' payable'})`;
      const recipients = [];
      const allUsers = db.prepare('SELECT id FROM users WHERE isActive = 1').all() as { id: number }[];
      for (const user of allUsers) {
        notificationRepository.create({
          userId: user.id,
          type: 'info',
          title: notifTitle,
          message: notifMessage,
          entityType: 'invoice',
          entityId: invoiceId,
        });
      }
    });

    transaction();
  },

  /**
   * Shared payment engine — increments an invoice's paid amount by a payment
   * allocation (used by posted journal-entry payment lines and the legacy
   * quick-pay flow). Guards against over-allocation so ageing stays correct.
   */
  applyPaymentAllocation(invoiceId: number, amount: number): void {
    const invoice = invoiceRepository.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    if (invoice.status === 'cancelled') throw new BusinessRuleError('Cannot pay cancelled invoice');
    if (invoice.status === 'draft') throw new BusinessRuleError('Cannot pay an invoice that has not been posted');

    const remaining = invoice.totalAmount - invoice.paidAmount;
    if (amount > remaining) {
      throw new BusinessRuleError(`Payment amount (${amount}) exceeds the invoice remaining balance (${remaining})`);
    }

    const newPaidAmount = invoice.paidAmount + amount;
    invoiceRepository.updatePaidAmount(invoiceId, newPaidAmount);
    invoiceRepository.updateStatus(invoiceId, newPaidAmount >= invoice.totalAmount ? 'paid' : newPaidAmount > 0 ? 'partial_paid' : 'posted');
  },

  /**
   * Shared payment engine — decrements an invoice's paid amount (reversal of a
   * payment allocation), recomputing status paid → partial_paid → posted.
   * Blocks reversing below zero.
   */
  reversePaymentAllocation(invoiceId: number, amount: number): void {
    const invoice = invoiceRepository.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    if (invoice.status === 'cancelled') throw new BusinessRuleError('Cannot reverse a payment on a cancelled invoice');

    const newPaidAmount = invoice.paidAmount - amount;
    if (newPaidAmount < 0) {
      throw new BusinessRuleError(`Cannot reverse ${amount} — invoice paid amount is only ${invoice.paidAmount}`);
    }

    invoiceRepository.updatePaidAmount(invoiceId, newPaidAmount);
    invoiceRepository.updateStatus(invoiceId, newPaidAmount >= invoice.totalAmount ? 'paid' : newPaidAmount > 0 ? 'partial_paid' : 'posted');
  },
};
