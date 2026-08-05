import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from '../test-helper';
import { inventoryRepository } from '../../repositories/inventoryRepository';

describe('inventoryRepository', () => {
  let data: any;

  beforeAll(async () => {
    await setupTestDatabase();
    data = seedTestData();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  describe('upsertStock', () => {
    it('should create a new stock record', () => {
      inventoryRepository.upsertStock(data.productIds.widget, data.warehouseId, 100, 1500);
      const stock = inventoryRepository.getStock(data.productIds.widget, data.warehouseId);
      expect(stock).not.toBeNull();
      expect(stock!.quantity).toBe(100);
      expect(stock!.averageCost).toBe(1500);
    });

    it('should update existing stock quantity and average cost', () => {
      inventoryRepository.upsertStock(data.productIds.widget, data.warehouseId, 50, 2000);
      const stock = inventoryRepository.getStock(data.productIds.widget, data.warehouseId);
      // New qty: 100 + 50 = 150
      // New avg: (100 * 1500 + 50 * 2000) / 150 = (150000 + 100000) / 150 = 250000 / 150 = 1667
      expect(stock!.quantity).toBe(150);
      expect(stock!.averageCost).toBe(1667);
    });

    it('should handle negative stock (issues)', () => {
      inventoryRepository.upsertStock(data.productIds.widget, data.warehouseId, -30, 1667);
      const stock = inventoryRepository.getStock(data.productIds.widget, data.warehouseId);
      expect(stock!.quantity).toBe(120);
    });
  });

  describe('recordMovement', () => {
    it('should record a receipt movement', () => {
      const id = inventoryRepository.recordMovement({
        type: 'receipt',
        productId: data.productIds.widget,
        warehouseId: data.warehouseId,
        quantity: 100,
        unitCost: 1500,
        referenceType: 'invoice',
        referenceId: 1,
        referenceNumber: 'INV-S-000001',
        postedBy: 'test',
      });
      expect(id).toBeGreaterThan(0);
    });

    it('should record a second receipt movement', () => {
      const id = inventoryRepository.recordMovement({
        type: 'receipt',
        productId: data.productIds.widget,
        warehouseId: data.warehouseId,
        quantity: 50,
        unitCost: 2000,
        referenceType: 'invoice',
        referenceId: 2,
        referenceNumber: 'INV-S-000002',
        postedBy: 'test',
      });
      expect(id).toBeGreaterThan(0);
    });
  });

  describe('getMovements', () => {
    it('should return all movements', () => {
      const movements = inventoryRepository.getMovements();
      expect(movements.length).toBeGreaterThanOrEqual(2);
      movements.forEach(m => {
        expect(m.movementNumber).toBeDefined();
        expect(m.productName).toBeDefined();
        expect(m.warehouseName).toBeDefined();
      });
    });

    it('should filter by product', () => {
      const movements = inventoryRepository.getMovements(data.productIds.widget);
      movements.forEach(m => expect(m.productId).toBe(data.productIds.widget));
    });
  });

  describe('getAllStock', () => {
    it('should return stock for all warehouses of a product', () => {
      const stock = inventoryRepository.getAllStock(data.productIds.widget);
      expect(stock.length).toBeGreaterThanOrEqual(1);
      stock.forEach(s => expect(s.productId).toBe(data.productIds.widget));
    });
  });

  describe('getStockAcrossWarehouses', () => {
    it('should return stock with product and warehouse names', () => {
      const stock = inventoryRepository.getStockAcrossWarehouses();
      expect(stock.length).toBeGreaterThanOrEqual(1);
      stock.forEach(s => {
        expect(s.productName).toBeDefined();
        expect(s.warehouseName).toBeDefined();
      });
    });
  });

  describe('getValuation', () => {
    it('should return stock valuation', () => {
      const valuation = inventoryRepository.getValuation();
      expect(valuation.length).toBeGreaterThanOrEqual(1);
      valuation.forEach(v => {
        expect(v.quantity).toBeDefined();
        expect(v.averageCost).toBeDefined();
        expect(v.totalValue).toBeDefined();
      });
    });
  });
});
