import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from '../test-helper';
import { invoiceRepository } from '../../repositories/invoiceRepository';
import { db } from '../../db';

describe('invoiceRepository', () => {
  let data: any;

  beforeAll(async () => {
    await setupTestDatabase();
    data = seedTestData();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  describe('create', () => {
    it('should create a sales invoice', () => {
      const id = invoiceRepository.create({
        type: 'sales',
        partnerName: 'Test Customer',
        invoiceDate: '2026-07-29',
        dueDate: '2026-08-28',
        warehouseId: data.warehouseId,
        createdBy: 'test',
      });
      expect(id).toBeGreaterThan(0);

      const invoice = invoiceRepository.findById(id);
      expect(invoice).not.toBeNull();
      expect(invoice!.type).toBe('sales');
      expect(invoice!.status).toBe('draft');
      expect(invoice!.invoiceNumber).toMatch(/^INV-S-/);
      expect(invoice!.version).toBe(1);
    });

    it('should create a purchase invoice', () => {
      const id = invoiceRepository.create({
        type: 'purchase',
        partnerName: 'Test Vendor',
        invoiceDate: '2026-07-28',
        dueDate: '2026-08-27',
        createdBy: 'test',
      });
      expect(id).toBeGreaterThan(0);
      const invoice = invoiceRepository.findById(id);
      expect(invoice!.type).toBe('purchase');
      expect(invoice!.invoiceNumber).toMatch(/^INV-P-/);
    });
  });

  describe('addLine', () => {
    it('should add invoice lines', () => {
      const invoiceId = 1;
      const lineId = invoiceRepository.addLine({
        invoiceId,
        lineNumber: 1,
        productId: data.productIds.widget,
        description: 'Widget - 10 units',
        quantity: 10,
        unitPrice: 2999,
        discountPercent: 0,
        vatCodeId: null,
        vatRate: 0,
        vatAmount: 0,
        lineTotal: 29990,
        lineType: 'stock',
        warehouseId: data.warehouseId,
        costCenterId: null,
        accountCode: '',
      });
      expect(lineId).toBeGreaterThan(0);

      const lines = invoiceRepository.findLines(invoiceId);
      expect(lines.length).toBe(1);
      expect(lines[0].quantity).toBe(10);
      expect(lines[0].lineTotal).toBe(29990);
    });

    it('should add multiple lines', () => {
      invoiceRepository.addLine({
        invoiceId: 1,
        lineNumber: 2,
        productId: data.productIds.widget,
        description: 'Widget - 5 more units',
        quantity: 5,
        unitPrice: 2999,
        discountPercent: 0,
        vatCodeId: null,
        vatRate: 0,
        vatAmount: 0,
        lineTotal: 14995,
        lineType: 'stock',
        warehouseId: data.warehouseId,
        costCenterId: null,
        accountCode: '',
      });

      const lines = invoiceRepository.findLines(1);
      expect(lines.length).toBe(2);
      expect(lines[0].lineNumber).toBe(1);
      expect(lines[1].lineNumber).toBe(2);
    });
  });

  describe('updateTotals', () => {
    it('should update invoice totals', () => {
      invoiceRepository.updateTotals(1, 44985, 0, 44985);
      const invoice = invoiceRepository.findById(1)!;
      expect(invoice.subtotal).toBe(44985);
      expect(invoice.totalAmount).toBe(44985);
    });
  });

  describe('approve', () => {
    it('should approve an invoice', () => {
      invoiceRepository.approve(1, 'test-user');
      const invoice = invoiceRepository.findById(1)!;
      expect(invoice.approvedBy).toBe('test-user');
      expect(invoice.approvedAt).not.toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update status to posted with user info', () => {
      invoiceRepository.updateStatus(1, 'posted', 'test-user');
      const invoice = invoiceRepository.findById(1)!;
      expect(invoice.status).toBe('posted');
      expect(invoice.postedBy).toBe('test-user');
      expect(invoice.postedAt).not.toBeNull();
    });

    it('should update status to paid', () => {
      invoiceRepository.updateStatus(1, 'paid');
      const invoice = invoiceRepository.findById(1)!;
      expect(invoice.status).toBe('paid');
    });

    it('should update status to cancelled', () => {
      invoiceRepository.updateStatus(1, 'cancelled');
      const invoice = invoiceRepository.findById(1)!;
      expect(invoice.status).toBe('cancelled');
    });
  });

  describe('findAll', () => {
    beforeAll(() => {
      // Create a few more invoices with different types/statuses for filtering tests
      invoiceRepository.create({ type: 'purchase', partnerName: 'Vendor A', invoiceDate: '2026-07-01', dueDate: '2026-07-31', createdBy: 'test' });
    });

    it('should return all invoices', () => {
      const invoices = invoiceRepository.findAll();
      expect(invoices.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by type', () => {
      const sales = invoiceRepository.findAll('sales');
      sales.forEach(i => expect(i.type).toBe('sales'));
    });

    it('should filter by status', () => {
      const drafts = invoiceRepository.findAll(undefined, 'draft');
      drafts.forEach(i => expect(i.status).toBe('draft'));
    });

    it('should search by partner name', () => {
      const results = invoiceRepository.findAll(undefined, undefined, 'Test');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('updatePaidAmount', () => {
    it('should update paid amount', () => {
      const invoiceId = 2;
      invoiceRepository.updatePaidAmount(invoiceId, 5000);
      const invoice = invoiceRepository.findById(invoiceId)!;
      expect(invoice.paidAmount).toBe(5000);
    });
  });

  describe('deleteLines', () => {
    it('should delete all lines for an invoice', () => {
      invoiceRepository.deleteLines(1);
      const lines = invoiceRepository.findLines(1);
      expect(lines.length).toBe(0);
    });
  });
});
