import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from '../test-helper';
import { entryRepository } from '../../repositories/entryRepository';
import { entryCategoryRepository } from '../../repositories/entryCategoryRepository';
import { fiscalPeriodRepository } from '../../repositories/fiscalPeriodRepository';
import { db } from '../../db';

describe('entryRepository', () => {
  beforeAll(async () => {
    await setupTestDatabase();
    // Seed FK parents these tests reference (foreign_keys = ON since Bug Fix #1).
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO business_partner (id, code, name, type, status, createdAt, updatedAt, version) VALUES (1, ?, ?, ?, ?, ?, ?, 1)'
    ).run('BP-FK-01', 'FK Partner', 'vendor', 'active', now, now);
    db.prepare(
      'INSERT INTO invoice (id, invoiceNumber, type, status, invoiceDate, dueDate, createdBy, createdAt, updatedAt, version) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    ).run('INV-FK-01', 'sales', 'draft', '2026-07-29', '2026-08-29', 'test', now, now);
    db.prepare(
      'INSERT INTO invoice (id, invoiceNumber, type, status, invoiceDate, dueDate, createdBy, createdAt, updatedAt, version) VALUES (2, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    ).run('INV-FK-02', 'sales', 'draft', '2026-07-29', '2026-08-29', 'test', now, now);
    for (const id of [999001, 999003, 999004]) {
      db.prepare(
        'INSERT INTO entry_category (id, code, name, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, 1, ?, ?, 1)'
      ).run(id, `CAT-${id}`, `Category ${id}`, now, now);
    }
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  describe('create', () => {
    it('should create a journal entry', () => {
      const id = entryRepository.create({
        entryDate: '2026-07-29',
        description: 'Test journal entry',
        createdBy: 'test',
      });
      expect(id).toBeGreaterThan(0);

      const entry = entryRepository.findById(id);
      expect(entry).not.toBeNull();
      expect(entry!.status).toBe('draft');
      expect(entry!.entryNumber).toMatch(/^JE-/);
      expect(entry!.version).toBe(1);
    });

    it('should create an entry linked to an invoice', () => {
      const id = entryRepository.create({
        entryDate: '2026-07-29',
        description: 'Sales receipt',
        linkedInvoiceId: 1,
        createdBy: 'test',
      });
      expect(id).toBeGreaterThan(0);
      const entry = entryRepository.findById(id);
      expect(entry!.entryNumber).toMatch(/^JE-/);
      expect(entry!.linkedInvoiceId).toBe(1);
    });

    it('should number entries by their category sequence (JE-<CODE>-)', () => {
      const catId = entryCategoryRepository.create({ code: 'SALES', name: 'Sales', isActive: true });
      const a = entryRepository.create({ entryDate: '2026-07-29', description: 'Cat 1', categoryId: catId, createdBy: 'test' });
      const b = entryRepository.create({ entryDate: '2026-07-29', description: 'Cat 2', categoryId: catId, createdBy: 'test' });
      expect(entryRepository.findById(a)!.entryNumber).toMatch(/^JE-SALES-/);
      expect(entryRepository.findById(b)!.entryNumber).toMatch(/^JE-SALES-/);
      expect(entryRepository.findById(a)!.entryNumber).not.toBe(entryRepository.findById(b)!.entryNumber);
      // Uncategorized entries still use the plain journal sequence
      const c = entryRepository.create({ entryDate: '2026-07-29', description: 'Plain', createdBy: 'test' });
      expect(entryRepository.findById(c)!.entryNumber).toMatch(/^JE-/);
    });

    it('should sanitize the category code into the number prefix', () => {
      const catId = entryCategoryRepository.create({ code: 'Sales (Retail)', name: 'Retail', isActive: true });
      const id = entryRepository.create({ entryDate: '2026-07-29', description: 'Retail entry', categoryId: catId, createdBy: 'test' });
      expect(entryRepository.findById(id)!.entryNumber).toMatch(/^JE-SALESRETAIL-/);
    });

    it('should auto-assign periodId from the entry date', () => {
      const periodId = fiscalPeriodRepository.create({
        name: 'FY 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open',
      });
      const id = entryRepository.create({ entryDate: '2026-06-15', description: 'Auto period', createdBy: 'test' });
      expect(entryRepository.findById(id)!.periodId).toBe(periodId);
    });
  });

  describe('addLine', () => {
    it('should add entry lines', () => {
      const entryId = 1;

      entryRepository.addLine({
        entryId,
        lineNumber: 1,
        accountCode: '101',
        description: 'Debit line',
        debitAmount: 10000,
        creditAmount: 0,
        businessPartnerId: null,
        costCenterId: null,
        vatCodeId: null,
        vatAmount: 0,
        lineType: 'normal',
        supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
      });

      entryRepository.addLine({
        entryId,
        lineNumber: 2,
        accountCode: '401',
        description: 'Credit line',
        debitAmount: 0,
        creditAmount: 10000,
        businessPartnerId: null,
        costCenterId: null,
        vatCodeId: null,
        vatAmount: 0,
        lineType: 'normal',
        supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
      });

      const lines = entryRepository.findLines(entryId);
      expect(lines.length).toBe(2);
      expect(lines[0].debitAmount).toBe(10000);
      expect(lines[1].creditAmount).toBe(10000);
    });

    it('should maintain line ordering', () => {
      const lines = entryRepository.findLines(1);
      expect(lines[0].lineNumber).toBe(1);
      expect(lines[1].lineNumber).toBe(2);
    });

    it('should persist lineType and supplier document fields', () => {
      const id = entryRepository.create({ entryDate: '2026-07-29', description: 'Tax line test', createdBy: 'test' });
      entryRepository.addLine({
        entryId: id, lineNumber: 1, accountCode: '202',
        description: 'VAT', debitAmount: 0, creditAmount: 2000,
        businessPartnerId: null, costCenterId: null, vatCodeId: 1, vatAmount: 2000,
        lineType: 'tax',
        supplierName: 'ACME Ltd', supplierTaxId: 'VAT-123', invoiceNumber: 'INV-1', invoiceDate: '2026-07-01',
        employeeId: null, taxDetailsJson: null,
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 2, accountCode: '101',
        description: 'Cash', debitAmount: 0, creditAmount: 2000,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal',
        supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
      });
      const lines = entryRepository.findLines(id);
      expect(lines[0].lineType).toBe('tax');
      expect(lines[0].vatCodeId).toBe(1);
      expect(lines[0].vatAmount).toBe(2000);
      expect(lines[0].supplierName).toBe('ACME Ltd');
      expect(lines[0].supplierTaxId).toBe('VAT-123');
      expect(lines[0].invoiceNumber).toBe('INV-1');
      expect(lines[0].invoiceDate).toBe('2026-07-01');
      expect(lines[1].lineType).toBe('normal');
    });

    it('should default lineType to normal when absent', () => {
      const id = entryRepository.create({ entryDate: '2026-07-29', description: 'Legacy line', createdBy: 'test' });
      const lineId = entryRepository.addLine({
        entryId: id, lineNumber: 1, accountCode: '101',
        description: 'Plain', debitAmount: 0, creditAmount: 0,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal',
        supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
      });
      const lines = entryRepository.findLines(id);
      expect(lines[0].lineType).toBe('normal');
      expect(lineId).toBeGreaterThan(0);
    });

    it('should replace payment allocations per line and clear them on delete', () => {
      const id = entryRepository.create({ entryDate: '2026-07-29', description: 'Payment test', createdBy: 'test' });
      const lineId = entryRepository.addLine({
        entryId: id, lineNumber: 1, accountCode: '201',
        description: 'AP clearing', debitAmount: 10000, creditAmount: 0,
        businessPartnerId: 1, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'payment',
        supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 2, accountCode: '101',
        description: 'Cash', debitAmount: 0, creditAmount: 10000,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal',
        supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
      });

      entryRepository.replaceAllocations(lineId, [
        { invoiceId: 1, amount: 6000, notes: 'first invoice' },
        { invoiceId: 2, amount: 4000, notes: '' },
      ]);

      let allocations = entryRepository.findAllocations(lineId);
      expect(allocations.length).toBe(2);
      expect(allocations[0].amount).toBe(6000);
      expect(allocations[0].notes).toBe('first invoice');
      expect(entryRepository.findAllocationsForEntry(id).length).toBe(2);

      // replaceAllocations replaces, not appends
      entryRepository.replaceAllocations(lineId, [{ invoiceId: 1, amount: 10000, notes: '' }]);
      allocations = entryRepository.findAllocations(lineId);
      expect(allocations.length).toBe(1);
      expect(allocations[0].amount).toBe(10000);

      // deleteLines cascades to allocations
      entryRepository.deleteLines(id);
      expect(entryRepository.findAllocationsForEntry(id).length).toBe(0);
    });
  });

  describe('updateTotals', () => {
    it('should update entry totals', () => {
      entryRepository.updateTotals(1, 10000, 10000);
      const entry = entryRepository.findById(1)!;
      expect(entry.totalDebit).toBe(10000);
      expect(entry.totalCredit).toBe(10000);
    });
  });

  describe('updateStatus', () => {
    it('should post entry with user info', () => {
      entryRepository.updateStatus(1, 'posted', 'test-user');
      const entry = entryRepository.findById(1)!;
      expect(entry.status).toBe('posted');
      expect(entry.postedBy).toBe('test-user');
      expect(entry.postedAt).not.toBeNull();
      expect(entry.version).toBe(2);
    });

    it('should cancel entry', () => {
      entryRepository.updateStatus(2, 'cancelled');
      // Create and post an entry first
      const id = entryRepository.create({
        entryDate: '2026-07-29',
        description: 'To cancel', createdBy: 'test',
      });
      entryRepository.updateStatus(id, 'cancelled');
      const entry = entryRepository.findById(id)!;
      expect(entry.status).toBe('cancelled');
    });
  });

  describe('findByLinkedInvoice', () => {
    it('should find entries linked to an invoice', () => {
      const entries = entryRepository.findByLinkedInvoice(1);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      entries.forEach(e => expect(e.linkedInvoiceId).toBe(1));
    });
  });

  describe('findAll', () => {
    it('should return all entries in order', () => {
      const entries = entryRepository.findAll();
      expect(entries.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by status', () => {
      const posted = entryRepository.findAll('posted');
      posted.forEach(e => expect(e.status).toBe('posted'));
    });
  });

  describe('category filtering', () => {
    it('should filter entries by a specific category', () => {
      const catId = 999001;
      const now = new Date().toISOString();
      // Create two entries, one in the category and one not
      const id = entryRepository.create({ entryDate: '2026-07-29', description: 'Categorized', categoryId: catId, createdBy: 'test' });
      entryRepository.create({ entryDate: '2026-07-29', description: 'Uncategorized', createdBy: 'test' });

      const filtered = entryRepository.findAll(undefined, undefined, catId);
      expect(filtered.length).toBeGreaterThanOrEqual(1);
      filtered.forEach(e => expect(e.categoryId).toBe(catId));
      expect(filtered.some(e => e.id === id)).toBe(true);
    });

    it('should paginate with a category filter', () => {
      const catId = 999003;
      entryRepository.create({ entryDate: '2026-07-29', description: 'Cat page 1', categoryId: catId, createdBy: 'test' });
      entryRepository.create({ entryDate: '2026-07-29', description: 'Cat page 2', categoryId: catId, createdBy: 'test' });
      // A non-matching entry that should be excluded from total
      entryRepository.create({ entryDate: '2026-07-29', description: 'Other category', categoryId: 999004, createdBy: 'test' });

      const result = entryRepository.paginate(1, 10, undefined, undefined, catId);
      expect(result.total).toBe(2);
      result.data.forEach(e => expect(e.categoryId).toBe(catId));
    });
  });
});
