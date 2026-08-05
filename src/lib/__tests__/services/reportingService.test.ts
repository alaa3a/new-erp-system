import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from '../test-helper';
import { reportingService } from '../../services/reportingService';
import { invoiceRepository } from '../../repositories/invoiceRepository';
import { entryRepository } from '../../repositories/entryRepository';
import { db } from '../../db';

describe('reportingService.getInvoiceTaxSummary', () => {
  beforeAll(async () => {
    await setupTestDatabase();
    const data = seedTestData();

    const id = invoiceRepository.create({
      type: 'sales', partnerName: 'Tax Customer',
      invoiceDate: '2026-07-01', dueDate: '2026-07-31', createdBy: 'test',
    });
    invoiceRepository.addLine({
      invoiceId: id, lineNumber: 1, productId: data.productIds.service,
      description: 'Taxable service', quantity: 1, unitPrice: 10000,
      discountPercent: 0, vatCodeId: data.taxCodeId, vatRate: 20,
      vatAmount: 2000, lineTotal: 10000, lineType: 'service',
      warehouseId: null, costCenterId: null, accountCode: '',
    });
    invoiceRepository.updateTotals(id, 10000, 2000, 12000);
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('should resolve the group name and filing period for each row', () => {
    const rows = reportingService.getInvoiceTaxSummary('2026-07-01', '2026-07-31');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = rows[0];
    expect(row.groupName).toBe('Test VAT Group');
    expect(row.filingPeriod).toBe('monthly');
  });

  it('should order rows by group then code', () => {
    const rows = reportingService.getInvoiceTaxSummary('2026-07-01', '2026-07-31');
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1].groupName.localeCompare(rows[i].groupName);
      expect(prev).toBeLessThanOrEqual(0);
    }
  });
});

describe('reportingService.getGeneralLedger filters (Phase 9)', () => {
  let ccId: number;
  let customerId: number;

  beforeAll(async () => {
    await setupTestDatabase();
    const data = seedTestData();
    customerId = data.partnerIds.customer;
    const now = new Date().toISOString();
    ccId = db.prepare(
      'INSERT INTO cost_center (code, name, parentId, isActive, createdAt, updatedAt, version) VALUES (?, ?, NULL, 1, ?, ?, 1)'
    ).run('CC-LEDGER', 'Ledger Test CC', now, now).lastInsertRowid as number;

    const entryId = entryRepository.create({
      entryDate: '2026-08-01', description: 'Ledger filter test', createdBy: 'test',
    });
    entryRepository.addLine({
      entryId, lineNumber: 1, accountCode: '101', description: 'Debit with CC + partner',
      debitAmount: 1000, creditAmount: 0, businessPartnerId: customerId, costCenterId: ccId,
      vatCodeId: null, vatAmount: 0, lineType: 'normal',        supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
    });
    entryRepository.addLine({
      entryId, lineNumber: 2, accountCode: '401', description: 'Tax credit line',
      debitAmount: 0, creditAmount: 1000, businessPartnerId: null, costCenterId: null,
      vatCodeId: null, vatAmount: 0, lineType: 'tax',        supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
    });
    entryRepository.updateTotals(entryId, 1000, 1000);
    entryRepository.updateStatus(entryId, 'posted', 'test');
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('should return all posted lines by default with dimension columns', () => {
    const rows = reportingService.getGeneralLedger();
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const line = rows.find((r: any) => r.accountCode === '101');
    expect(line).toBeDefined();
    expect(line.costCenterId).toBe(ccId);
    expect(line.businessPartnerId).toBe(customerId);
    expect(line.lineType).toBe('normal');
    expect(line.partnerName).toBe('Test Customer');
    expect(line.costCenterName).toBe('Ledger Test CC');
  });

  it('should filter by cost center', () => {
    const rows = reportingService.getGeneralLedger('2026-08-01', '2026-08-31', { costCenterId: ccId });
    expect(rows.length).toBe(1);
    expect(rows[0].accountCode).toBe('101');
  });

  it('should filter by business partner', () => {
    const rows = reportingService.getGeneralLedger('2026-08-01', '2026-08-31', { businessPartnerId: customerId });
    expect(rows.length).toBe(1);
    expect(rows[0].accountCode).toBe('101');
  });

  it('should filter by line type', () => {
    const taxRows = reportingService.getGeneralLedger('2026-08-01', '2026-08-31', { lineType: 'tax' });
    expect(taxRows.length).toBe(1);
    expect(taxRows[0].accountCode).toBe('401');
    const normalRows = reportingService.getGeneralLedger('2026-08-01', '2026-08-31', { lineType: 'normal' });
    expect(normalRows.length).toBe(1);
    expect(normalRows[0].accountCode).toBe('101');
  });
});

describe('reportingService.getTaxSummaryDetails (Phase 6)', () => {
  let entryId: number;

  beforeAll(async () => {
    await setupTestDatabase();
    const data = seedTestData();
    const now = new Date().toISOString();
    entryId = entryRepository.create({ entryDate: '2026-07-15', description: 'Tax detail entry', createdBy: 'test' });
    entryRepository.addLine({
      entryId, lineNumber: 1, accountCode: '202', description: 'VAT out',
      debitAmount: 0, creditAmount: 2000, businessPartnerId: null, costCenterId: null,
      vatCodeId: data.taxCodeId, vatAmount: 2000, lineType: 'tax',
      supplierName: 'ACME Ltd', supplierTaxId: 'VAT-111', invoiceNumber: 'INV-99', invoiceDate: '2026-07-10',
      employeeId: null, taxDetailsJson: JSON.stringify({ vendorName: 'ACME', certNo: '12345' }),
    });
    entryRepository.addLine({
      entryId, lineNumber: 2, accountCode: '101', description: 'Cash',
      debitAmount: 0, creditAmount: 2000, businessPartnerId: null, costCenterId: null,
      vatCodeId: null, vatAmount: 0, lineType: 'normal',
      supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
      employeeId: null, taxDetailsJson: null,
    });
    entryRepository.updateTotals(entryId, 2000, 2000);
    entryRepository.updateStatus(entryId, 'posted', 'test');
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('should return captured supplier/invoice details with JSON extras', () => {
    const rows = reportingService.getTaxSummaryDetails('2026-07-01', '2026-07-31');
    const row = rows.find((r: any) => r.entryNumber === (entryRepository.findById(entryId)!.entryNumber));
    expect(row).toBeDefined();
    expect(row.supplierName).toBe('ACME Ltd');
    expect(row.supplierTaxId).toBe('VAT-111');
    expect(row.invoiceNumber).toBe('INV-99');
    expect(row.invoiceDate).toBe('2026-07-10');
    expect(row.vatAmount).toBe(2000);
    expect(JSON.parse(row.taxDetailsJson)).toEqual({ vendorName: 'ACME', certNo: '12345' });
  });

  it('should filter by vatCodeId', () => {
    const rows = reportingService.getTaxSummaryDetails('2026-07-01', '2026-07-31', 999999);
    expect(rows.length).toBe(0);
  });
});
