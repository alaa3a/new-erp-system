import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from '../test-helper';
import { warehouseRepository } from '../../repositories/warehouseRepository';

describe('warehouseRepository', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  describe('create', () => {
    it('should create a warehouse', () => {
      const id = warehouseRepository.create({
        code: 'WH-MAIN',
        name: 'Main Warehouse',
        address: '123 Storage Ave',
        manager: 'John Doe',
        isActive: true,
      });
      expect(id).toBeGreaterThan(0);

      const wh = warehouseRepository.findById(id);
      expect(wh).not.toBeNull();
      expect(wh!.code).toBe('WH-MAIN');
      expect(wh!.name).toBe('Main Warehouse');
      expect(wh!.manager).toBe('John Doe');
      expect(wh!.version).toBe(1);
    });
  });

  describe('findAll', () => {
    it('should return active warehouses', () => {
      const warehouses = warehouseRepository.findAll();
      expect(warehouses.length).toBeGreaterThanOrEqual(1);
      warehouses.forEach(w => expect(w.isActive).toBe(true));
    });
  });

  describe('update', () => {
    it('should update warehouse and increment version', () => {
      const before = warehouseRepository.findById(1)!;
      const success = warehouseRepository.update(1, { name: 'Main WH Updated', code: 'WH-MAIN' }, before.version);
      expect(success).toBe(true);

      const updated = warehouseRepository.findById(1)!;
      expect(updated.name).toBe('Main WH Updated');
      expect(updated.version).toBe(before.version + 1);
    });
  });

  describe('softDelete', () => {
    it('should deactivate warehouse', () => {
      const before = warehouseRepository.findById(1)!;
      warehouseRepository.softDelete(1, before.version);

      const all = warehouseRepository.findAll();
      expect(all.find(w => w.id === 1)).toBeUndefined();
    });
  });
});
