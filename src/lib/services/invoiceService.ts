import { db } from '../db';
import { invoiceRepository } from '../repositories/invoiceRepository';
import { entryRepository } from '../repositories/entryRepository';
import { accountRepository } from '../repositories/accountRepository';
import { partnerRepository } from '../repositories/partnerRepository';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { inventoryService } from './inventoryService';
import { notificationRepository } from '../repositories/userRepository';
import { BusinessRuleError, NotFoundError } from '../utils/errors';

/**
 * Posting accounts come from the product's product-profile chain — the single
 * source of truth. Resolution order: the product's own account columns → its
 * product profile → the seeded chart-of-accounts fallback. `posting_profile`
 * was retired (Task 9); posting no longer reads it.
 */
const FALLBACK = {
  sales: '401', salesService: '402', purchase: '503',
  inventory: '103', cogs: '501', ar: '102', ap: '201',
  vatOut: '202', vatIn: '105',
};

function accountCodeFor(accountId: number | null | undefined, fallback: string): string {
  if (accountId == null) return fallback;
  const row = db.prepare('SELECT code FROM account WHERE id = ?').get(accountId) as any;
  return row?.code || fallback;
}

/** VAT posting account comes from the tax type's own account (tax_code.accountCode). */
function vatAccountCodeFor(line: any, fallback: string): string {
  if (line.vatCodeId) {
    const tax = db.prepare('SELECT accountCode FROM tax_code WHERE id = ?').get(line.vatCodeId) as any;
    if (tax?.accountCode) return tax.accountCode;
  }
  return fallback;
}

interface ResolvedAccounts {
  sales: string;
  purchase: string;
  inventory: string;
  cogs: string;
  ar: string;
  ap: string;
  vatOut: string;
  vatIn: string;
}

/** Resolves posting accounts + default cost center for one invoice line. */
function resolveLineContext(line: any): { accounts: ResolvedAccounts; costCenterId: number | null } {
  let product: any = null;
  let profile: any = null;
  if (line.productId) {
    product = db.prepare('SELECT * FROM product WHERE id = ?').get(line.productId) as any;
    if (product?.profileId) {
      profile = db.prepare('SELECT * FROM product_profile WHERE id = ? AND isActive = 1').get(product.profileId) as any;
    }
  }
  const pick = (prodVal: any, profVal: any) => prodVal ?? profVal ?? null;
  const service = line.lineType === 'service';
  return {
    accounts: {
      sales: accountCodeFor(pick(product?.salesAccountId, profile?.salesAccountId), service ? FALLBACK.salesService : FALLBACK.sales),
      purchase: accountCodeFor(pick(product?.purchaseAccountId, profile?.purchaseAccountId), FALLBACK.purchase),
      inventory: accountCodeFor(pick(product?.inventoryAccountId, profile?.inventoryAccountId), FALLBACK.inventory),
      cogs: accountCodeFor(pick(product?.cogsAccountId, profile?.cogsAccountId), FALLBACK.cogs),
      ar: accountCodeFor(pick(profile?.arAccountId, null), FALLBACK.ar),
      ap: accountCodeFor(pick(profile?.apAccountId, null), FALLBACK.ap),
      vatOut: vatAccountCodeFor(line, FALLBACK.vatOut),
      vatIn: vatAccountCodeFor(line, FALLBACK.vatIn),
    },
    costCenterId: line.costCenterId ?? null,
  };
}

/** Current stock unit cost (average cost) for a line, falling back to its unit price. */
function lineStockCost(line: any, invoice: any): number {
  let warehouseId = line.warehouseId ?? invoice.warehouseId;
  if (!warehouseId) {
    const product = db.prepare('SELECT defaultWarehouseId FROM product WHERE id = ?').get(line.productId) as any;
    warehouseId = product?.defaultWarehouseId ?? null;
  }
  if (warehouseId) {
    const stock = inventoryRepository.getStock(line.productId, warehouseId);
    if (stock?.averageCost) return stock.averageCost;
  }
  return line.unitPrice;
}

export const invoiceService = {
  approveInvoice(invoiceId: number, userId: string): void {
    const transaction = db.transaction(() => {
      // Re-read inside the transaction so the status checks are atomic with the
      // update — two concurrent approves cannot both pass (TOCTOU fix).
      const invoice = invoiceRepository.findById(invoiceId);
      if (!invoice) throw new NotFoundError('Invoice', invoiceId);
      if (invoice.status !== 'draft') throw new BusinessRuleError('Only draft invoices can be approved');
      if (invoice.approvedBy) throw new BusinessRuleError('Invoice is already approved');

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

    const isSalesSide = invoice.type === 'sales' || invoice.type === 'debit_note';
    const entries: any[] = [];
    const stockMovements: any[] = [];

    for (const line of lines) {
      const { accounts, costCenterId } = resolveLineContext(line);
      const isStockLine = line.lineType !== 'service' && !!line.productId;

      if (isSalesSide) {
        // Revenue (Cr) — the old `line.accountCode` was never set by the UI, so
        // this fixed the empty-accountCode bug by resolving from product/profile.
        entries.push({ accountCode: accounts.sales, description: line.description, debitAmount: 0, creditAmount: line.lineTotal, costCenterId });

        if (line.vatAmount > 0) {
          entries.push({ accountCode: accounts.vatOut, description: `VAT - ${line.description}`, debitAmount: 0, creditAmount: line.vatAmount, vatCodeId: line.vatCodeId, costCenterId });
        }

        // Stock lines also post COGS (Dr) / Inventory (Cr) at average cost.
        if (isStockLine) {
          const cost = Math.round(lineStockCost(line, invoice) * line.quantity);
          if (cost > 0) {
            entries.push({ accountCode: accounts.cogs, description: `COGS - ${line.description}`, debitAmount: cost, creditAmount: 0, costCenterId });
            entries.push({ accountCode: accounts.inventory, description: `Inventory - ${line.description}`, debitAmount: 0, creditAmount: cost, costCenterId });
          }
        }
      } else {
        // Purchase side: stock → Dr Inventory, non-stock → Dr Expense.
        entries.push({
          accountCode: isStockLine ? accounts.inventory : accounts.purchase,
          description: line.description,
          debitAmount: line.lineTotal,
          creditAmount: 0,
          costCenterId,
        });

        if (line.vatAmount > 0) {
          entries.push({ accountCode: accounts.vatIn, description: `VAT - ${line.description}`, debitAmount: line.vatAmount, creditAmount: 0, vatCodeId: line.vatCodeId, costCenterId });
        }
      }

      if (isStockLine) {
        // Task 43 — auto-select the warehouse from the product's default when the line has none.
        let warehouseId = line.warehouseId ?? invoice.warehouseId;
        if (!warehouseId) {
          const product = db.prepare('SELECT defaultWarehouseId FROM product WHERE id = ?').get(line.productId) as any;
          warehouseId = product?.defaultWarehouseId ?? null;
        }
        if (warehouseId) {
          stockMovements.push({ productId: line.productId, warehouseId, quantity: isSalesSide ? -line.quantity : line.quantity, unitCost: line.unitPrice });
        }
      }
    }

    const { ar, ap } = resolveLineContext(lines[0]).accounts;
    entries.push({
      accountCode: isSalesSide ? ar : ap,
      description: `${isSalesSide ? 'Receivable' : 'Payable'} - ${invoice.invoiceNumber}`,
      debitAmount: isSalesSide ? invoice.totalAmount : 0,
      creditAmount: isSalesSide ? 0 : invoice.totalAmount,
    });

    return { entries, stockMovements };
  },

  /**
   * Task 43 — validates that every outgoing stock line has enough AVAILABLE
   * stock (on hand minus reservations) before posting. Throws a clear error
   * naming the product, available qty and required qty.
   */
  validateStockAvailability(invoiceId: number): void {
    const invoice = invoiceRepository.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    const lines = invoiceRepository.findLines(invoiceId);
    const outgoing = invoice.type === 'sales' || invoice.type === 'debit_note';
    for (const line of lines) {
      if (line.lineType === 'service' || !line.productId) continue;
      let warehouseId = line.warehouseId ?? invoice.warehouseId;
      if (!warehouseId) {
        const product = db.prepare('SELECT defaultWarehouseId FROM product WHERE id = ?').get(line.productId) as any;
        warehouseId = product?.defaultWarehouseId ?? null;
      }
      if (!warehouseId) continue;
      if (outgoing) {
        const stock = inventoryRepository.getStock(line.productId, warehouseId);
        const available = stock?.available ?? 0;
        if (available < line.quantity) {
          const product = db.prepare('SELECT name FROM product WHERE id = ?').get(line.productId) as any;
          throw new BusinessRuleError(`Cannot post: Insufficient stock for ${product?.name || `Product #${line.productId}`} (available: ${available}, required: ${line.quantity})`);
        }
      }
    }
  },

  postInvoice(invoiceId: number, userId: string): void {
    const transaction = db.transaction(() => {
      // Re-read inside the transaction — the draft check is atomic with the
      // update, so two concurrent posts cannot both pass (TOCTOU fix).
      const invoice = invoiceRepository.findById(invoiceId);
      if (!invoice) throw new NotFoundError('Invoice', invoiceId);
      if (invoice.status !== 'draft') throw new BusinessRuleError('Only draft invoices can be posted');

      // Task 43 — block posting when any outgoing stock line exceeds availability.
      this.validateStockAvailability(invoiceId);

      const { entries, stockMovements } = this.previewPosting(invoiceId);

      // Auto-generated entry — posting_profile was retired (§Task 9); entry
      // category falls back to the entry category resolver below.
      const entryId = entryRepository.create({
        entryDate: invoice.invoiceDate,
        description: `Invoice ${invoice.invoiceNumber}`,
        linkedInvoiceId: invoiceId,
        categoryId: null,
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
          businessPartnerId: inheritedPartnerId, costCenterId: e.costCenterId ?? inheritedCcId, employeeId: null,
          vatCodeId: e.vatCodeId ?? null,
          vatAmount: e.vatCodeId ? e.debitAmount + e.creditAmount : 0,
          lineType: e.vatCodeId ? 'tax' : 'normal',
          supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
          taxDetailsJson: null,
        });
      }
      entryRepository.updateTotals(entryId, totalDebit, totalCredit);
      entryRepository.updateStatus(entryId, 'posted', userId);

      const invoiceLines = invoiceRepository.findLines(invoiceId);
      for (const sm of stockMovements) {
        // Task 38 — a reservation held for this invoice is consumed as the
        // units physically leave the warehouse (no-op when nothing was reserved).
        inventoryRepository.consumeReservation(sm.productId, sm.warehouseId, Math.abs(sm.quantity));
        // Task 46 — capture the current average cost (fall back to the line's
        // unit price when no stock row exists yet, e.g. first receipt).
        const current = inventoryRepository.getStock(sm.productId, sm.warehouseId);
        const costForMovement = current?.averageCost || sm.unitCost;
        inventoryRepository.upsertStock(sm.productId, sm.warehouseId, sm.quantity, sm.unitCost);
        inventoryRepository.recordMovement({ type: sm.quantity > 0 ? 'receipt' : 'issue', productId: sm.productId, warehouseId: sm.warehouseId, quantity: sm.quantity, unitCost: sm.unitCost, referenceType: 'invoice', referenceId: invoiceId, referenceNumber: invoice.invoiceNumber, postedBy: userId });
        // Capture the unit cost on the invoice line for profit reporting (Task 46).
        const line = invoiceLines.find(l => l.productId === sm.productId && l.warehouseId === sm.warehouseId);
        if (line) invoiceRepository.updateLineCost(line.id, costForMovement);
      }

      invoiceRepository.updateStatus(invoiceId, 'posted', userId);

      // Task 39 — stock changed, fire reorder-point notifications if any item dropped low.
      inventoryService.checkReorderPoints();

      // Create notification
      const notifTitle = invoice.type === 'sales' ? 'Invoice Posted' : invoice.type === 'purchase' ? 'Purchase Posted' : invoice.type === 'credit_note' ? 'Credit Note Posted' : 'Debit Note Posted';
      const notifMessage = `${invoice.invoiceNumber} — ${invoice.partnerName} (${invoice.type === 'sales' || invoice.type === 'debit_note' ? '$' + (invoice.totalAmount / 100).toFixed(2) + ' receivable' : '$' + (invoice.totalAmount / 100).toFixed(2) + ' payable'})`;
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
    const transaction = db.transaction(() => {
      // Checks and updates are atomic — no over-payment races (Bug Fix #9).
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
    });
    transaction();
  },

  /**
   * Shared payment engine — decrements an invoice's paid amount (reversal of a
   * payment allocation), recomputing status paid → partial_paid → posted.
   * Blocks reversing below zero.
   */
  reversePaymentAllocation(invoiceId: number, amount: number): void {
    const transaction = db.transaction(() => {
      const invoice = invoiceRepository.findById(invoiceId);
      if (!invoice) throw new NotFoundError('Invoice', invoiceId);
      if (invoice.status === 'cancelled') throw new BusinessRuleError('Cannot reverse a payment on a cancelled invoice');

      const newPaidAmount = invoice.paidAmount - amount;
      if (newPaidAmount < 0) {
        throw new BusinessRuleError(`Cannot reverse ${amount} — invoice paid amount is only ${invoice.paidAmount}`);
      }

      invoiceRepository.updatePaidAmount(invoiceId, newPaidAmount);
      invoiceRepository.updateStatus(invoiceId, newPaidAmount >= invoice.totalAmount ? 'paid' : newPaidAmount > 0 ? 'partial_paid' : 'posted');
    });
    transaction();
  },
};
