import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from './test-helper';
import { db } from '../db';
import { productRepository } from '../repositories/productRepository';
import { ConflictError } from '../utils/errors';

describe('DB-layer UNIQUE safety net', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });
  afterAll(() => {
    teardownTestDatabase();
  });

  it('translates a duplicate-code INSERT into ConflictError (409), not a raw error', () => {
    const now = new Date().toISOString();
    const stmt = db.prepare(
      'INSERT INTO product (code, name, description, itemType, unitOfMeasure, salesPrice, purchasePrice, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)'
    );
    stmt.run('DUP-CODE', 'First', '', 'stock', 'pcs', 0, 0, now, now);
    let thrown: ConflictError | null = null;
    try {
      stmt.run('DUP-CODE', 'Second', '', 'stock', 'pcs', 0, 0, now, now);
    } catch (err) {
      thrown = err as ConflictError;
    }
    expect(thrown).toBeInstanceOf(ConflictError);
    expect(thrown!.statusCode).toBe(409);
    expect(thrown!.code).toBe('CONFLICT');
    expect(thrown!.message).toContain('product');
    expect(thrown!.message).toContain('already exists');
  });

  it('productRepository.create surfaces ConflictError for a code reserved by a soft-deleted row', () => {
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO product (code, name, description, itemType, unitOfMeasure, salesPrice, purchasePrice, isActive, deletedAt, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 1)'
    ).run('RESERVED-CODE', 'Ghost', '', 'stock', 'pcs', 0, 0, now, now, now);
    // Route-level pre-checks would return 400 first; this calls the repository
    // directly to prove the DB layer itself never lets a raw UNIQUE error escape.
    expect(() =>
      productRepository.create({
        code: 'RESERVED-CODE',
        name: 'New item',
        description: '',
        itemType: 'stock',
        unitOfMeasure: 'pcs',
        salesPrice: 0,
        purchasePrice: 0,
        vatCodeId: null,
        purchaseVatCodeId: null,
        defaultWarehouseId: null,
        reorderPoint: 0,
        isActive: true,
        parentId: null,
        isCategory: false,
        profileId: null,
      })
    ).toThrow(ConflictError);
  });
});
