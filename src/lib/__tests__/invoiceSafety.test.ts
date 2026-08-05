import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from './test-helper';
import { invoiceService } from '../services/invoiceService';
import { invoiceRepository } from '../repositories/invoiceRepository';
import { BusinessRuleError } from '../utils/errors';

describe('Invoice Posting & Payment Safety', () => {
  let data: any;

  beforeAll(async () => {
    await setupTestDatabase();
    data = seedTestData();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('should reject posting an already-posted invoice', () => {
    const id = invoiceRepository.create({
      type: 'sales',
      businessPartnerId: data.partnerIds.customer,
      partnerName: 'Test Customer',
      invoiceDate: '2026-01-01',
      dueDate: '2026-02-01',
      createdBy: 'test',
    });
    // Service line — no warehouse, so no stock movement is generated.
    invoiceRepository.addLine({
      invoiceId: id,
      lineNumber: 1,
      productId: data.productIds.service,
      description: 'Consulting',
      quantity: 1,
      unitPrice: 10000,
      discountPercent: 0,
      vatCodeId: null,
      vatRate: 0,
      vatAmount: 0,
      lineTotal: 10000,
      lineType: 'service',
      warehouseId: null,
      costCenterId: null,
      accountCode: '401',
    });
    invoiceRepository.updateTotals(id, 10000, 0, 10000);

    invoiceService.postInvoice(id, 'test-user');
    expect(invoiceRepository.findById(id)!.status).toBe('posted');

    // Second post must be rejected inside the transaction guard
    expect(() => invoiceService.postInvoice(id, 'test-user')).toThrow(BusinessRuleError);
  });

  it('should reject a payment that exceeds the remaining balance', () => {
    const id = invoiceRepository.create({
      type: 'sales',
      businessPartnerId: data.partnerIds.customer,
      partnerName: 'Test Customer',
      invoiceDate: '2026-01-01',
      dueDate: '2026-02-01',
      createdBy: 'test',
    });
    invoiceRepository.updateTotals(id, 5000, 0, 5000);
    invoiceRepository.updateStatus(id, 'posted');

    expect(() => invoiceService.applyPaymentAllocation(id, 6000)).toThrow(BusinessRuleError);
    expect(invoiceRepository.findById(id)!.paidAmount).toBe(0);
  });

  it('should accept a payment within the remaining balance', () => {
    const id = invoiceRepository.create({
      type: 'sales',
      businessPartnerId: data.partnerIds.customer,
      partnerName: 'Test Customer',
      invoiceDate: '2026-01-01',
      dueDate: '2026-02-01',
      createdBy: 'test',
    });
    invoiceRepository.updateTotals(id, 5000, 0, 5000);
    invoiceRepository.updateStatus(id, 'posted');

    invoiceService.applyPaymentAllocation(id, 3000);
    const invoice = invoiceRepository.findById(id)!;
    expect(invoice.paidAmount).toBe(3000);
    expect(invoice.status).toBe('partial_paid');
  });
});
