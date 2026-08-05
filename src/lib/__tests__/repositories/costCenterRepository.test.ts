import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from '../test-helper';
import { costCenterRepository } from '../../repositories/costCenterRepository';
import { db } from '../../db';

function createTestCenter(code: string, name: string): number {
  return costCenterRepository.create({
    code,
    name,
    parentId: null,
    isActive: true,
    responsiblePerson: '',
    description: '',
  });
}

describe('costCenterRepository', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  describe('findAll', () => {
    it('should return cost centers ordered by code', () => {
      const centers = costCenterRepository.findAll();
      expect(centers).toBeInstanceOf(Array);
    });
  });

  describe('findById', () => {
    it('should return null for non-existent id', () => {
      expect(costCenterRepository.findById(99999)).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new cost center and return its id', () => {
      const id = createTestCenter('CC-901', 'Test Center');
      expect(id).toBeGreaterThan(0);
      const created = costCenterRepository.findById(id);
      expect(created).not.toBeNull();
      expect(created!.code).toBe('CC-901');
      expect(created!.name).toBe('Test Center');
      expect(created!.version).toBe(1);
    });
  });

  describe('update', () => {
    it('should update cost center fields and increment version', () => {
      const id = createTestCenter('CC-902', 'Before');
      const before = costCenterRepository.findById(id)!;
      const success = costCenterRepository.update(
        id,
        {
          code: before.code,
          name: 'After',
          parentId: before.parentId,
          isActive: true,
          responsiblePerson: '',
          description: '',
        },
        before.version,
      );
      expect(success).toBe(true);
      const updated = costCenterRepository.findById(id)!;
      expect(updated.name).toBe('After');
      expect(updated.version).toBe(before.version + 1);
    });

    it('should return false on version conflict', () => {
      const id = createTestCenter('CC-902b', 'Conflict Base');
      const before = costCenterRepository.findById(id)!;
      const success = costCenterRepository.update(
        id,
        {
          code: before.code,
          name: 'Conflict',
          parentId: before.parentId,
          isActive: true,
          responsiblePerson: '',
          description: '',
        },
        999,
      );
      expect(success).toBe(false);
    });
  });

  describe('hardDelete', () => {
    it('should permanently delete the cost center', () => {
      const id = createTestCenter('CC-903', 'Delete Me');
      const before = costCenterRepository.findById(id)!;
      const success = costCenterRepository.hardDelete(id, before.version);
      expect(success).toBe(true);

      // Row should be fully removed (not just deactivated)
      expect(costCenterRepository.findById(id)).toBeNull();
    });

    it('should return false on version conflict', () => {
      const id = createTestCenter('CC-904', 'Version Guard');
      const success = costCenterRepository.hardDelete(id, 999);
      expect(success).toBe(false);
      // Row should still exist
      expect(costCenterRepository.findById(id)).not.toBeNull();
    });
  });

  describe('hasChildren', () => {
    it('should return false for leaf cost centers', () => {
      expect(costCenterRepository.hasChildren(99999)).toBe(false);
    });
  });

  describe('usage checks', () => {
    it('should return false for unused cost centers', () => {
      const id = createTestCenter('CC-905', 'Unused');
      expect(costCenterRepository.isUsedInEntries(id)).toBe(false);
      expect(costCenterRepository.isUsedInInvoiceLines(id)).toBe(false);
      expect(costCenterRepository.isUsedInAccounts(id)).toBe(false);
      expect(costCenterRepository.isUsedInPurchaseOrderLines(id)).toBe(false);
    });

    it('should detect cost centers linked to accounts', () => {
      const id = createTestCenter('CC-906', 'Linked to Account');
      db.prepare('UPDATE account SET costCenterId=? WHERE id=1').run(id);
      expect(costCenterRepository.isUsedInAccounts(id)).toBe(true);
      // Cleanup: restore
      db.prepare('UPDATE account SET costCenterId=NULL WHERE id=1').run();
      expect(costCenterRepository.isUsedInAccounts(id)).toBe(false);
    });

    it('should detect cost centers used in entry lines', () => {
      const id = createTestCenter('CC-907', 'Used in Entries');
      const now = new Date().toISOString();
      const entryId = db.prepare(
        'INSERT INTO entry (entryNumber, status, entryDate, description, totalDebit, totalCredit, createdBy, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
      ).run('ENT-TMP-CC', 'draft', '2026-01-01', 'tmp', 0, 0, '1', now, now)
        .lastInsertRowid as number;
      db.prepare(
        'INSERT INTO entry_line (entryId, lineNumber, accountCode, debitAmount, creditAmount, costCenterId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(entryId, 1, '101', 0, 0, id, now);
      expect(costCenterRepository.isUsedInEntries(id)).toBe(true);
      expect(costCenterRepository.isUsedInInvoiceLines(id)).toBe(false);
    });
  });
});
