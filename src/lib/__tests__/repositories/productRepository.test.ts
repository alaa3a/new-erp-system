import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from '../test-helper';
import { productRepository } from '../../repositories/productRepository';

describe('productRepository', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  describe('create', () => {
    it('should create a stock product', () => {
      const id = productRepository.create({
        name: 'Widget Pro',
        description: '',
        itemType: 'stock',
        unitOfMeasure: 'pcs',
        salesPrice: 2999,
        purchasePrice: 1500,
        vatCodeId: null,
        purchaseVatCodeId: null,
        defaultWarehouseId: null,
        reorderPoint: 0,
        isActive: true,
        parentId: null,
        isCategory: false,
        profileId: null,
      });
      expect(id).toBeGreaterThan(0);

      const product = productRepository.findById(id);
      expect(product).not.toBeNull();
      expect(product!.name).toBe('Widget Pro');
      expect(product!.itemType).toBe('stock');
      expect(product!.code).toMatch(/^PR-\d{5}$/);
      expect(product!.version).toBe(1);
    });

    it('should create a service product', () => {
      const id = productRepository.create({
        name: 'Consulting',
        description: '',
        itemType: 'service',
        unitOfMeasure: 'hrs',
        salesPrice: 10000,
        purchasePrice: 0,
        vatCodeId: null,
        purchaseVatCodeId: null,
        defaultWarehouseId: null,
        reorderPoint: 0,
        isActive: true,
        parentId: null,
        isCategory: false,
        profileId: null,
      });
      expect(id).toBeGreaterThan(0);

      const product = productRepository.findById(id);
      expect(product!.itemType).toBe('service');
      expect(product!.unitOfMeasure).toBe('hrs');
    });
  });

  describe('findAll', () => {
    it('should return all active products', () => {
      const products = productRepository.findAll();
      expect(products.length).toBeGreaterThanOrEqual(2);
      products.forEach(p => expect(p.isActive).toBe(true));
    });

    it('should filter by itemType', () => {
      const stock = productRepository.findAll(undefined, 'stock');
      stock.forEach(p => expect(p.itemType).toBe('stock'));
    });

    it('should search by name', () => {
      const results = productRepository.findAll('Widget');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('update', () => {
    it('should update product fields and increment version', () => {
      const before = productRepository.findById(1)!;
      const success = productRepository.update(1, {
        name: 'Widget Pro Deluxe',
        salesPrice: 3999,
        itemType: 'stock',
        unitOfMeasure: 'pcs',
        purchasePrice: 1500,
        reorderPoint: 0,
        isActive: true,
      }, before.version);
      expect(success).toBe(true);

      const updated = productRepository.findById(1)!;
      expect(updated.name).toBe('Widget Pro Deluxe');
      expect(updated.salesPrice).toBe(3999);
      expect(updated.version).toBe(before.version + 1);
    });

    it('should only change the provided fields on partial update (toggle-active safe)', () => {
      const id = productRepository.create({
        name: 'Partial Update Item', description: 'desc', itemType: 'stock', unitOfMeasure: 'kg',
        salesPrice: 1234, purchasePrice: 567, vatCodeId: null, purchaseVatCodeId: null,
        defaultWarehouseId: null, reorderPoint: 7, isActive: true, parentId: null, isCategory: false, profileId: null,
      });
      const before = productRepository.findById(id)!;
      const ok = productRepository.update(id, { isActive: false }, before.version);
      expect(ok).toBe(true);
      const after = productRepository.findById(id)!;
      expect(after.isActive).toBe(false);
      expect(after.name).toBe(before.name);
      expect(after.description).toBe('desc');
      expect(after.unitOfMeasure).toBe('kg');
      expect(after.salesPrice).toBe(1234);
      expect(after.purchasePrice).toBe(567);
      expect(after.reorderPoint).toBe(7);
      expect(after.code).toBe(before.code);

      // code changes persist too
      const ok2 = productRepository.update(id, { code: 'PART-001' }, after.version);
      expect(ok2).toBe(true);
      expect(productRepository.findById(id)!.code).toBe('PART-001');
    });
  });

  describe('softDelete', () => {
    it('should deactivate product', () => {
      const before = productRepository.findById(1)!;
      productRepository.softDelete(1, before.version);
      const deleted = productRepository.findById(1)!;
      expect(deleted.isActive).toBe(false);

      // Should not appear in findAll
      const all = productRepository.findAll();
      expect(all.find(p => p.id === 1)).toBeUndefined();
    });
  });
});
