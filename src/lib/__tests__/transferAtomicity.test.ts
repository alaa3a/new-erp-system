import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from './test-helper';
import { inventoryService } from '../services/inventoryService';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { BusinessRuleError } from '../utils/errors';
import { db } from '../db';

describe('Inventory Transfer Atomicity', () => {
  let data: any;
  let whB: number;

  beforeAll(async () => {
    await setupTestDatabase();
    data = seedTestData();
    // Second warehouse for the transfer destination
    const now = new Date().toISOString();
    whB = db.prepare(
      'INSERT INTO warehouse (code, name, isActive, createdAt, updatedAt, version) VALUES (?, ?, 1, ?, ?, 1)'
    ).run('WH-B', 'Warehouse B', now, now).lastInsertRowid as number;
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('should throw when the source warehouse has insufficient stock', () => {
    const { productIds, warehouseId } = data;
    // No stock exists in the source warehouse
    expect(() => inventoryService.transferStock(productIds.widget, warehouseId, whB, 1000, 'test'))
      .toThrow(BusinessRuleError);
  });

  it('should complete a transfer atomically', () => {
    const { productIds, warehouseId } = data;
    inventoryRepository.upsertStock(productIds.widget, warehouseId, 100, 500);
    inventoryService.transferStock(productIds.widget, warehouseId, whB, 30, 'test');

    expect(inventoryRepository.getStock(productIds.widget, warehouseId)?.quantity).toBe(70);
    expect(inventoryRepository.getStock(productIds.widget, whB)?.quantity).toBe(30);
    // Both movement records exist (one outbound, one inbound)
    const movements = inventoryRepository.getMovements(productIds.widget);
    const transferMoves = movements.filter((m: any) => m.type === 'transfer');
    expect(transferMoves.length).toBe(2);
  });
});
