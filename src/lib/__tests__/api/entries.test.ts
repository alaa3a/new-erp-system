import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from '../test-helper';
import { entryService } from '../../services/entryService';
import { entryRepository } from '../../repositories/entryRepository';
import { invoiceRepository } from '../../repositories/invoiceRepository';
import { fiscalPeriodRepository } from '../../repositories/fiscalPeriodRepository';
import { BusinessRuleError, NotFoundError } from '../../utils/errors';
import { db } from '../../db';

describe('Entry Posting Integration', () => {
  let data: any;

  beforeAll(async () => {
    await setupTestDatabase();
    data = seedTestData();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  function createBalancedEntry(extra: Record<string, any> = {}): number {
    const id = entryRepository.create({
      entryDate: '2026-07-29',
      description: 'Test journal entry',
      createdBy: 'test',
      ...extra,
    });
    entryRepository.addLine({
      entryId: id, lineNumber: 1, accountCode: '101',
      description: 'Debit cash', debitAmount: 10000, creditAmount: 0,
      businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
      lineType: 'normal', supplierName: null, supplierTaxId: null,
      invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
    });
    entryRepository.addLine({
      entryId: id, lineNumber: 2, accountCode: '401',
      description: 'Credit revenue', debitAmount: 0, creditAmount: 10000,
      businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
      lineType: 'normal', supplierName: null, supplierTaxId: null,
      invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
    });
    entryRepository.updateTotals(id, 10000, 10000);
    return id;
  }

  function createPostedInvoice(type: string = 'sales', totalAmount: number = 10000): number {
    const id = invoiceRepository.create({
      type: type as any,
      partnerName: type === 'sales' ? 'Test Customer' : 'Test Vendor',
      invoiceDate: '2026-07-29',
      dueDate: '2026-08-28',
      warehouseId: data.warehouseId,
      createdBy: 'test',
    });
    invoiceRepository.updateTotals(id, totalAmount, 0, totalAmount);
    invoiceRepository.updateStatus(id, 'posted');
    return id;
  }

  describe('Entry posting workflow', () => {
    it('should post a balanced journal entry with audit trail', () => {
      const id = createBalancedEntry();

      let entry = entryRepository.findById(id)!;
      expect(entry.status).toBe('draft');

      entryService.postEntry(id, 'accountant-user');

      entry = entryRepository.findById(id)!;
      expect(entry.status).toBe('posted');
      expect(entry.postedBy).toBe('accountant-user');
      expect(entry.postedAt).not.toBeNull();
      expect(entry.totalDebit).toBe(10000);
      expect(entry.totalCredit).toBe(10000);
    });

    it('should reject posting an unbalanced entry', () => {
      const id = entryRepository.create({
        entryDate: '2026-07-29',
        description: 'Unbalanced entry',
        createdBy: 'test',
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 1, accountCode: '101',
        description: 'Debit', debitAmount: 10000, creditAmount: 0,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal', supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 2, accountCode: '401',
        description: 'Credit', debitAmount: 0, creditAmount: 8000,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal', supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      entryRepository.updateTotals(id, 10000, 8000);

      expect(() => entryService.postEntry(id, 'accountant'))
        .toThrow(/not balanced/);
    });

    it('should reject posting a draft with no lines', () => {
      const id = entryRepository.create({
        entryDate: '2026-07-29',
        description: 'Empty entry',
        createdBy: 'test',
      });

      expect(() => entryService.postEntry(id, 'accountant'))
        .toThrow(/at least one line/);
    });

    it('should reject double posting', () => {
      const id = createBalancedEntry();
      entryService.postEntry(id, 'accountant');

      expect(() => entryService.postEntry(id, 'accountant-2'))
        .toThrow(/Only draft entries/);
    });

    it('should reject posting into a closed fiscal period', () => {
      const periodId = fiscalPeriodRepository.create({
        name: 'Closed FY 2025', startDate: '2025-01-01', endDate: '2025-12-31', status: 'open',
      });

      const id = entryRepository.create({
        entryDate: '2025-06-15',
        description: 'Entry in closed period',
        createdBy: 'test',
        periodId,
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 1, accountCode: '101',
        description: 'Debit', debitAmount: 5000, creditAmount: 0,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal', supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 2, accountCode: '401',
        description: 'Credit', debitAmount: 0, creditAmount: 5000,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal', supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      entryRepository.updateTotals(id, 5000, 5000);

      fiscalPeriodRepository.close(periodId, 'admin');

      expect(() => entryService.postEntry(id, 'accountant'))
        .toThrow(/closed fiscal period/);
    });
  });

  describe('Entry posting with payment allocations', () => {
    it('should post a payment entry that pays a sales invoice in full', () => {
      const invoiceId = createPostedInvoice('sales', 15000);

      const id = entryRepository.create({
        entryDate: '2026-07-29',
        description: 'Customer payment',
        createdBy: 'test',
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 1, accountCode: '101',
        description: 'Cash received', debitAmount: 15000, creditAmount: 0,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal', supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      const paymentLineId = entryRepository.addLine({
        entryId: id, lineNumber: 2, accountCode: '102',
        description: 'AR clearing', debitAmount: 0, creditAmount: 15000,
        businessPartnerId: data.partnerIds.customer, costCenterId: null,
        vatCodeId: null, vatAmount: 0, lineType: 'payment',
        supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      entryRepository.replaceAllocations(paymentLineId, [{ invoiceId, amount: 15000, notes: 'Full payment' }]);
      entryRepository.updateTotals(id, 15000, 15000);

      entryService.postEntry(id, 'accountant');

      const invoice = invoiceRepository.findById(invoiceId)!;
      expect(invoice.paidAmount).toBe(15000);
      expect(invoice.status).toBe('paid');
    });

    it('should post a payment entry that partially pays an invoice', () => {
      const invoiceId = createPostedInvoice('sales', 20000);

      const id = entryRepository.create({
        entryDate: '2026-07-29',
        description: 'Partial customer payment',
        createdBy: 'test',
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 1, accountCode: '101',
        description: 'Cash received', debitAmount: 12000, creditAmount: 0,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal', supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      const paymentLineId = entryRepository.addLine({
        entryId: id, lineNumber: 2, accountCode: '102',
        description: 'AR clearing', debitAmount: 0, creditAmount: 12000,
        businessPartnerId: data.partnerIds.customer, costCenterId: null,
        vatCodeId: null, vatAmount: 0, lineType: 'payment',
        supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      entryRepository.replaceAllocations(paymentLineId, [{ invoiceId, amount: 12000, notes: 'Partial' }]);
      entryRepository.updateTotals(id, 12000, 12000);

      entryService.postEntry(id, 'accountant');

      const invoice = invoiceRepository.findById(invoiceId)!;
      expect(invoice.paidAmount).toBe(12000);
      expect(invoice.status).toBe('partial_paid');
    });

    it('should post a payment entry allocating to multiple invoices', () => {
      const invoiceId1 = createPostedInvoice('sales', 8000);
      const invoiceId2 = createPostedInvoice('sales', 12000);

      const id = entryRepository.create({
        entryDate: '2026-07-29',
        description: 'Bulk customer payment',
        createdBy: 'test',
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 1, accountCode: '101',
        description: 'Cash received', debitAmount: 20000, creditAmount: 0,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal', supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      const paymentLineId = entryRepository.addLine({
        entryId: id, lineNumber: 2, accountCode: '102',
        description: 'AR clearing', debitAmount: 0, creditAmount: 20000,
        businessPartnerId: data.partnerIds.customer, costCenterId: null,
        vatCodeId: null, vatAmount: 0, lineType: 'payment',
        supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      entryRepository.replaceAllocations(paymentLineId, [
        { invoiceId: invoiceId1, amount: 8000, notes: 'Invoice 1 full' },
        { invoiceId: invoiceId2, amount: 12000, notes: 'Invoice 2 full' },
      ]);
      entryRepository.updateTotals(id, 20000, 20000);

      entryService.postEntry(id, 'accountant');

      const inv1 = invoiceRepository.findById(invoiceId1)!;
      const inv2 = invoiceRepository.findById(invoiceId2)!;
      expect(inv1.paidAmount).toBe(8000);
      expect(inv1.status).toBe('paid');
      expect(inv2.paidAmount).toBe(12000);
      expect(inv2.status).toBe('paid');
    });

    it('should reject posting a payment that exceeds invoice balance', () => {
      const invoiceId = createPostedInvoice('sales', 5000);

      const id = entryRepository.create({
        entryDate: '2026-07-29',
        description: 'Overpayment attempt',
        createdBy: 'test',
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 1, accountCode: '101',
        description: 'Cash', debitAmount: 10000, creditAmount: 0,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal', supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      const paymentLineId = entryRepository.addLine({
        entryId: id, lineNumber: 2, accountCode: '102',
        description: 'AR clearing', debitAmount: 0, creditAmount: 10000,
        businessPartnerId: data.partnerIds.customer, costCenterId: null,
        vatCodeId: null, vatAmount: 0, lineType: 'payment',
        supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      entryRepository.replaceAllocations(paymentLineId, [{ invoiceId, amount: 10000, notes: 'Too much' }]);
      entryRepository.updateTotals(id, 10000, 10000);

      expect(() => entryService.postEntry(id, 'accountant'))
        .toThrow(/exceeds the invoice remaining balance/);
    });

    it('should reject payment line on AR account without a partner during validation', () => {
      // validateReferences enforces AR/AP partner requirements
      expect(() =>
        entryService.validateReferences([
          { accountCode: '102', costCenterId: null, businessPartnerId: null, lineType: 'payment' },
        ])
      ).toThrow(/requires a business partner/);
    });

    it('should reject payment to vendor on AR account during validation', () => {
      // validateReferences enforces partner role matching
      expect(() =>
        entryService.validateReferences([
          { accountCode: '102', costCenterId: null, businessPartnerId: data.partnerIds.vendor, lineType: 'payment' },
        ])
      ).toThrow(/only customer partners/);
    });
  });

  describe('Multi-line entry posting', () => {
    it('should post a complex multi-line journal entry', () => {
      const id = entryRepository.create({
        entryDate: '2026-07-29',
        description: 'Complex allocation',
        createdBy: 'test',
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 1, accountCode: '101',
        description: 'Cash portion', debitAmount: 5000, creditAmount: 0,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal', supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 2, accountCode: '102',
        description: 'AR portion', debitAmount: 3000, creditAmount: 0,
        businessPartnerId: data.partnerIds.customer, costCenterId: null,
        vatCodeId: null, vatAmount: 0, lineType: 'normal',
        supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 3, accountCode: '401',
        description: 'Revenue', debitAmount: 0, creditAmount: 7000,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal', supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 4, accountCode: '202',
        description: 'VAT liability', debitAmount: 0, creditAmount: 1000,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal', supplierName: null, supplierTaxId: null,
        invoiceNumber: null, invoiceDate: null, employeeId: null, taxDetailsJson: null,
      });
      entryRepository.updateTotals(id, 8000, 8000);

      entryService.postEntry(id, 'accountant');

      const entry = entryRepository.findById(id)!;
      expect(entry.status).toBe('posted');
      expect(entry.totalDebit).toBe(8000);
      expect(entry.totalCredit).toBe(8000);

      const lines = entryRepository.findLines(id);
      expect(lines.length).toBe(4);
    });

    it('should preserve entry line details after posting', () => {
      const id = createBalancedEntry({ description: 'Detailed entry' });

      entryService.postEntry(id, 'accountant');

      const lines = entryRepository.findLines(id);
      expect(lines[0].accountCode).toBe('101');
      expect(lines[0].debitAmount).toBe(10000);
      expect(lines[1].accountCode).toBe('401');
      expect(lines[1].creditAmount).toBe(10000);
    });
  });
});
