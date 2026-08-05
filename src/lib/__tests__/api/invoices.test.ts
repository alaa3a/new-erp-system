import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from '../test-helper';
import { invoiceService } from '../../services/invoiceService';
import { invoiceRepository } from '../../repositories/invoiceRepository';
import { entryRepository } from '../../repositories/entryRepository';
import { inventoryRepository } from '../../repositories/inventoryRepository';
import { BusinessRuleError, NotFoundError } from '../../utils/errors';
import { db } from '../../db';

describe('Invoice Lifecycle Integration', () => {
  let data: any;

  beforeAll(async () => {
    await setupTestDatabase();
    data = seedTestData();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  function createDraftInvoice(type: string = 'sales', partnerName: string = 'Test Customer'): number {
    const id = invoiceRepository.create({
      type: type as any,
      partnerName,
      invoiceDate: '2026-07-29',
      dueDate: '2026-08-28',
      warehouseId: data.warehouseId,
      postingProfileId: data.postingProfileId,
      createdBy: 'test',
    });

    invoiceRepository.addLine({
      invoiceId: id,
      lineNumber: 1,
      productId: data.productIds.widget,
      description: 'Widget - 10 units',
      quantity: 10,
      unitPrice: 2999,
      discountPercent: 0,
      vatCodeId: null,
      vatRate: 20,
      vatAmount: 5998,
      lineTotal: 29990,
      lineType: 'stock',
      warehouseId: data.warehouseId,
      costCenterId: null,
      accountCode: '',
    });

    invoiceRepository.addLine({
      invoiceId: id,
      lineNumber: 2,
      productId: data.productIds.service,
      description: 'Service - 5 hours',
      quantity: 5,
      unitPrice: 10000,
      discountPercent: 0,
      vatCodeId: null,
      vatRate: 20,
      vatAmount: 10000,
      lineTotal: 50000,
      lineType: 'service',
      warehouseId: null,
      costCenterId: null,
      accountCode: '',
    });

    const totalVat = 5998 + 10000;
    invoiceRepository.updateTotals(id, 29990 + 50000, totalVat, 29990 + 50000 + totalVat);
    return id;
  }

  describe('Full invoice lifecycle: create → approve → post → pay', () => {
    it('should complete the full sales invoice lifecycle', () => {
      // Setup stock
      inventoryRepository.upsertStock(data.productIds.widget, data.warehouseId, 1000, 1500);

      // 1. Create draft
      const id = createDraftInvoice('sales');
      let invoice = invoiceRepository.findById(id)!;
      expect(invoice.status).toBe('draft');
      expect(invoice.approvedBy).toBeNull();
      expect(invoice.postedBy).toBeNull();

      // 2. Approve
      invoiceService.approveInvoice(id, 'approver-user');
      invoice = invoiceRepository.findById(id)!;
      expect(invoice.approvedBy).toBe('approver-user');
      expect(invoice.approvedAt).not.toBeNull();

      // 3. Post
      invoiceService.postInvoice(id, 'poster-user');
      invoice = invoiceRepository.findById(id)!;
      expect(invoice.status).toBe('posted');
      expect(invoice.postedBy).toBe('poster-user');
      expect(invoice.postedAt).not.toBeNull();

      // Verify entry was created
      const entries = entryRepository.findByLinkedInvoice(id);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries[0].status).toBe('posted');

      // Verify stock was reduced
      const stock = inventoryRepository.getStock(data.productIds.widget, data.warehouseId);
      expect(stock!.quantity).toBeLessThan(1000);

      // 4. Pay in full
      const totalAmount = invoice.totalAmount;
      invoiceService.applyPaymentAllocation(id, totalAmount);
      invoice = invoiceRepository.findById(id)!;
      expect(invoice.paidAmount).toBe(totalAmount);
      expect(invoice.status).toBe('paid');
    });

    it('should complete the full purchase invoice lifecycle', () => {
      // 1. Create draft
      const id = createDraftInvoice('purchase', 'Test Vendor');
      let invoice = invoiceRepository.findById(id)!;
      expect(invoice.status).toBe('draft');

      // 2. Approve
      invoiceService.approveInvoice(id, 'approver-user');
      invoice = invoiceRepository.findById(id)!;
      expect(invoice.approvedBy).toBe('approver-user');

      // 3. Post
      invoiceService.postInvoice(id, 'poster-user');
      invoice = invoiceRepository.findById(id)!;
      expect(invoice.status).toBe('posted');

      // Verify entry was created
      const entries = entryRepository.findByLinkedInvoice(id);
      expect(entries.length).toBeGreaterThanOrEqual(1);

      // 4. Pay in full
      const totalAmount = invoice.totalAmount;
      invoiceService.applyPaymentAllocation(id, totalAmount);
      invoice = invoiceRepository.findById(id)!;
      expect(invoice.paidAmount).toBe(totalAmount);
      expect(invoice.status).toBe('paid');
    });

    it('should handle partial payment then full payment lifecycle', () => {
      // Setup stock
      inventoryRepository.upsertStock(data.productIds.widget, data.warehouseId, 500, 1500);

      const id = createDraftInvoice('sales');
      invoiceService.approveInvoice(id, 'approver');
      invoiceService.postInvoice(id, 'poster');

      const invoice = invoiceRepository.findById(id)!;
      const halfAmount = Math.floor(invoice.totalAmount / 2);

      // Partial payment
      invoiceService.applyPaymentAllocation(id, halfAmount);
      let updated = invoiceRepository.findById(id)!;
      expect(updated.paidAmount).toBe(halfAmount);
      expect(updated.status).toBe('partial_paid');

      // Remaining payment
      const remaining = invoice.totalAmount - halfAmount;
      invoiceService.applyPaymentAllocation(id, remaining);
      updated = invoiceRepository.findById(id)!;
      expect(updated.paidAmount).toBe(invoice.totalAmount);
      expect(updated.status).toBe('paid');
    });

    it('should handle payment reversal within the lifecycle', () => {
      // Setup stock
      inventoryRepository.upsertStock(data.productIds.widget, data.warehouseId, 500, 1500);

      const id = createDraftInvoice('sales');
      invoiceService.approveInvoice(id, 'approver');
      invoiceService.postInvoice(id, 'poster');

      const invoice = invoiceRepository.findById(id)!;

      // Pay in full
      invoiceService.applyPaymentAllocation(id, invoice.totalAmount);
      let updated = invoiceRepository.findById(id)!;
      expect(updated.status).toBe('paid');

      // Reverse half
      const halfAmount = Math.floor(invoice.totalAmount / 2);
      invoiceService.reversePaymentAllocation(id, halfAmount);
      updated = invoiceRepository.findById(id)!;
      expect(updated.paidAmount).toBe(invoice.totalAmount - halfAmount);
      expect(updated.status).toBe('partial_paid');
    });

    it('should allow posting a draft invoice (approval not required by service)', () => {
      // Note: postInvoice only checks draft status, not approval status.
      // Approval is a workflow concern, not enforced at the service layer.
      const id = createDraftInvoice();
      // This should NOT throw — the service allows posting without explicit approval
      expect(() => invoiceService.postInvoice(id, 'poster'))
        .not.toThrow();
    });

    it('should prevent approval of a posted invoice', () => {
      // Setup stock
      inventoryRepository.upsertStock(data.productIds.widget, data.warehouseId, 500, 1500);

      const id = createDraftInvoice();
      invoiceService.approveInvoice(id, 'approver');
      invoiceService.postInvoice(id, 'poster');

      expect(() => invoiceService.approveInvoice(id, 'late-approver'))
        .toThrow(BusinessRuleError);
    });

    it('should prevent double posting', () => {
      // Setup stock
      inventoryRepository.upsertStock(data.productIds.widget, data.warehouseId, 500, 1500);

      const id = createDraftInvoice();
      invoiceService.approveInvoice(id, 'approver');
      invoiceService.postInvoice(id, 'poster');

      expect(() => invoiceService.postInvoice(id, 'poster-2'))
        .toThrow(BusinessRuleError);
    });

    it('should prevent payment on a draft invoice', () => {
      const id = createDraftInvoice();
      expect(() => invoiceService.applyPaymentAllocation(id, 1000))
        .toThrow(/has not been posted/);
    });

    it('should prevent over-payment beyond invoice total', () => {
      // Setup stock
      inventoryRepository.upsertStock(data.productIds.widget, data.warehouseId, 500, 1500);

      const id = createDraftInvoice();
      invoiceService.approveInvoice(id, 'approver');
      invoiceService.postInvoice(id, 'poster');

      const invoice = invoiceRepository.findById(id)!;
      invoiceService.applyPaymentAllocation(id, invoice.totalAmount);

      // Try to pay more when already paid in full
      expect(() => invoiceService.applyPaymentAllocation(id, 1000))
        .toThrow(/exceeds the invoice remaining balance/);
    });
  });

  describe('Invoice posting generates correct entries', () => {
    it('should create stock movements only for stock-type lines', () => {
      // Setup stock
      inventoryRepository.upsertStock(data.productIds.widget, data.warehouseId, 1000, 1500);

      const id = createDraftInvoice('sales');
      const preview = invoiceService.previewPosting(id);

      // Stock lines generate movements, service lines do not
      const stockMovements = preview.stockMovements;
      expect(stockMovements.length).toBeGreaterThanOrEqual(1);
      stockMovements.forEach(sm => {
        expect(sm.productId).toBe(data.productIds.widget);
      });
    });

    it('should generate receivable entry for sales invoice', () => {
      const id = createDraftInvoice('sales');
      const preview = invoiceService.previewPosting(id);

      // Sales: receivable is a DEBIT to AR account (102)
      const receivableEntry = preview.entries.find((e: any) => e.debitAmount > 0 && e.accountCode === '102');
      expect(receivableEntry).toBeDefined();
    });

    it('should generate payable entry for purchase invoice', () => {
      const id = createDraftInvoice('purchase', 'Test Vendor');
      const preview = invoiceService.previewPosting(id);

      // Should have a payable line (credit to AP account)
      const payableEntry = preview.entries.find((e: any) => e.creditAmount > 0 && e.accountCode === '201');
      expect(payableEntry).toBeDefined();
    });
  });

  describe('Version tracking through lifecycle', () => {
    it('should increment version at each state transition', () => {
      // Setup stock
      inventoryRepository.upsertStock(data.productIds.widget, data.warehouseId, 500, 1500);

      const id = createDraftInvoice();
      let invoice = invoiceRepository.findById(id)!;
      const draftVersion = invoice.version;

      invoiceService.approveInvoice(id, 'approver');
      invoice = invoiceRepository.findById(id)!;
      expect(invoice.version).toBe(draftVersion + 1);

      invoiceService.postInvoice(id, 'poster');
      invoice = invoiceRepository.findById(id)!;
      expect(invoice.version).toBe(draftVersion + 2);
    });
  });
});
