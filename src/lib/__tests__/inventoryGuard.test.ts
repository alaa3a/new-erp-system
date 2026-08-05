import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from './test-helper';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { BusinessRuleError } from '../utils/errors';

describe('Negative Inventory Guard', () => {
  let data: any;

  beforeAll(async () => {
    await setupTestDatabase();
    data = seedTestData();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('should throw when reducing stock below zero on an existing row', () => {
    const { productIds, warehouseId } = data;
    inventoryRepository.upsertStock(productIds.widget, warehouseId, 10, 100);
    expect(() => inventoryRepository.upsertStock(productIds.widget, warehouseId, -11, 100))
      .toThrow(BusinessRuleError);
    // Stock is unchanged after the failed reduction
    expect(inventoryRepository.getStock(productIds.widget, warehouseId)?.quantity).toBe(10);
  });

  it('should throw when reducing stock with no existing row', () => {
    const { productIds, warehouseId } = data;
    expect(() => inventoryRepository.upsertStock(productIds.service, warehouseId, -5, 100))
      .toThrow(BusinessRuleError);
  });

  it('should allow a valid stock reduction', () => {
    const { productIds, warehouseId } = data;
    inventoryRepository.upsertStock(productIds.service, warehouseId, 100, 100);
    inventoryRepository.upsertStock(productIds.service, warehouseId, -50, 100);
    expect(inventoryRepository.getStock(productIds.service, warehouseId)?.quantity).toBe(50);
  });
});
