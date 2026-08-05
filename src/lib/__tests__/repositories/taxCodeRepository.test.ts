import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from '../test-helper';
import { taxCodeRepository } from '../../repositories/taxCodeRepository';
import { db } from '../../db';

describe('taxCodeRepository', () => {
  beforeAll(async () => {
    await setupTestDatabase();
    seedTestData();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('should persist isGroup and filingPeriod on create and mapRow', () => {
    const id = taxCodeRepository.create({
      code: 'GRP-T', name: 'Test Group', rate: 0, type: 'output',
      parentId: null, accountCode: '', isActive: true, isSystemCode: false,
      effectiveFrom: '2026-01-01', effectiveTo: null,
      isGroup: true, filingPeriod: 'quarterly',
      detailsConfig: [],
    });
    const row = taxCodeRepository.findById(id)!;
    expect(row.isGroup).toBe(true);
    expect(row.filingPeriod).toBe('quarterly');
  });

  it('should find groups only', () => {
    const groups = taxCodeRepository.findGroups();
    expect(groups.length).toBeGreaterThanOrEqual(1);
    groups.forEach(g => expect(g.isGroup).toBe(true));
  });

  it('should report a group with children as having children', () => {
    const groupId = taxCodeRepository.findGroups().find(g => g.code === 'VAT-GRP')!.id;
    expect(taxCodeRepository.hasChildren(groupId)).toBe(true);
  });

  it('should update isGroup and filingPeriod', () => {
    const id = taxCodeRepository.findGroups().find(g => g.code === 'VAT-GRP')!.id;
    const existing = taxCodeRepository.findById(id)!;
    const ok = taxCodeRepository.update(id, { filingPeriod: 'annually' }, existing.version);
    expect(ok).toBe(true);
    expect(taxCodeRepository.findById(id)!.filingPeriod).toBe('annually');
  });

  it('should report a code as in use when referenced by an invoice line, entry line, product, or partner', () => {
    const fresh = taxCodeRepository.create({
      code: 'USED-CHK', name: 'Usage Check', rate: 10, type: 'output',
      parentId: taxCodeRepository.findGroups()[0].id, accountCode: '202', isActive: true, isSystemCode: false,
      effectiveFrom: '2026-01-01', effectiveTo: null,
      isGroup: false, filingPeriod: 'monthly',
      detailsConfig: [],
    });
    expect(taxCodeRepository.isInUse(fresh)).toBe(false);

    // Referenced by a product (settings)
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO product (code, name, itemType, unitOfMeasure, salesPrice, purchasePrice, vatCodeId, purchaseVatCodeId, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, 0, 0, ?, NULL, 1, ?, ?, 1)'
    ).run('P-USED', 'Used Product', 'service', 'pcs', fresh, now, now);
    expect(taxCodeRepository.isInUse(fresh)).toBe(true);

    db.prepare('DELETE FROM product WHERE code = ?').run('P-USED');

    // Referenced by a partner (settings)
    db.prepare(
      'INSERT INTO business_partner (code, name, type, creditLimit, status, defaultVatCodeId, createdAt, updatedAt, version) VALUES (?, ?, ?, 0, \'active\', ?, ?, ?, 1)'
    ).run('BP-USED', 'Used Partner', 'customer', fresh, now, now);
    expect(taxCodeRepository.isInUse(fresh)).toBe(true);
    db.prepare('DELETE FROM business_partner WHERE code = ?').run('BP-USED');

    // Referenced by an entry line
    db.prepare(
      'INSERT INTO entry (entryNumber, status, entryDate, description, totalDebit, totalCredit, currencyCode, createdBy, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, 0, 0, ?, \'t\', ?, ?, 1)'
    ).run('E-USED', 'posted', '2026-01-01', 'usage', 'USD', now, now);
    const entryId = (db.prepare('SELECT id FROM entry WHERE entryNumber = ?').get('E-USED') as any).id;
    db.prepare(
      'INSERT INTO entry_line (entryId, lineNumber, accountCode, description, debitAmount, creditAmount, vatCodeId, vatAmount, createdAt) VALUES (?, 1, ?, ?, 0, 100, ?, 100, ?)'
    ).run(entryId, '202', 'vat', fresh, now);
    expect(taxCodeRepository.isInUse(fresh)).toBe(true);

    // Cleanup
    db.prepare('DELETE FROM entry_line WHERE entryId = ?').run(entryId);
    db.prepare('DELETE FROM entry WHERE id = ?').run(entryId);
    expect(taxCodeRepository.isInUse(fresh)).toBe(false);
  });

  it('should persist and round-trip detailsConfig (Phase 4)', () => {
    const id = taxCodeRepository.create({
      code: 'DETAILS-T', name: 'Details Type', rate: 5, type: 'input',
      parentId: taxCodeRepository.findGroups()[0].id, accountCode: '105', isActive: true, isSystemCode: false,
      effectiveFrom: '2026-01-01', effectiveTo: null,
      isGroup: false, filingPeriod: 'monthly',
      detailsConfig: [{ key: 'vendorName', label: 'Vendor Name', inputType: 'text' }, { key: 'invoiceDate', label: 'Invoice Date', inputType: 'date' }],
    });
    const row = taxCodeRepository.findById(id)!;
    expect(row.detailsConfig).toHaveLength(2);
    expect(row.detailsConfig[0]).toEqual({ key: 'vendorName', label: 'Vendor Name', inputType: 'text' });
    // update replaces the config
    const ok = taxCodeRepository.update(id, { detailsConfig: [{ key: 'certNo', label: 'Certificate No', inputType: 'number' }] }, row.version);
    expect(ok).toBe(true);
    expect(taxCodeRepository.findById(id)!.detailsConfig).toEqual([{ key: 'certNo', label: 'Certificate No', inputType: 'number' }]);
  });

  it('should report any parent with children as having children (multi-level)', () => {
    const groupId = taxCodeRepository.create({
      code: 'GRP-MULTI', name: 'Multi Group', rate: 0, type: 'output',
      parentId: null, accountCode: '', isActive: true, isSystemCode: false,
      effectiveFrom: '2026-01-01', effectiveTo: null,
      isGroup: true, filingPeriod: 'monthly',
      detailsConfig: [],
    });
    const subGroupId = taxCodeRepository.create({
      code: 'GRP-SUB', name: 'Sub Group', rate: 0, type: 'output',
      parentId: groupId, accountCode: '', isActive: true, isSystemCode: false,
      effectiveFrom: '2026-01-01', effectiveTo: null,
      isGroup: true, filingPeriod: 'monthly',
      detailsConfig: [],
    });
    const typeId = taxCodeRepository.create({
      code: 'TYPE-LEAF', name: 'Leaf Type', rate: 5, type: 'input',
      parentId: subGroupId, accountCode: '202', isActive: true, isSystemCode: false,
      effectiveFrom: '2026-01-01', effectiveTo: null,
      isGroup: false, filingPeriod: 'monthly',
      detailsConfig: [],
    });
    expect(taxCodeRepository.hasChildren(groupId)).toBe(true);
    expect(taxCodeRepository.hasChildren(subGroupId)).toBe(true);
    expect(taxCodeRepository.hasChildren(typeId)).toBe(false);
  });
});
