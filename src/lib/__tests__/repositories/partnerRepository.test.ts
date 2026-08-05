import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from '../test-helper';
import { partnerRepository } from '../../repositories/partnerRepository';

describe('partnerRepository', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  describe('findAll', () => {
    it('should return empty array when no partners exist', () => {
      const partners = partnerRepository.findAll();
      expect(partners).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create a customer partner', () => {
      const id = partnerRepository.create({
        name: 'Acme Corp',
        type: 'customer',
        contactPerson: '',
        email: 'orders@acme.com',
        phone: '',
        address: '',
        city: 'New York',
        country: '',
        taxRegistrationNumber: '',
        defaultVatCodeId: null,
        paymentTermId: null,
        creditLimit: 0,
        status: 'active',
        tags: [],
      });
      expect(id).toBeGreaterThan(0);

      const partner = partnerRepository.findById(id);
      expect(partner).not.toBeNull();
      expect(partner!.name).toBe('Acme Corp');
      expect(partner!.type).toBe('customer');
      expect(partner!.code).toMatch(/^BP-\d{5}$/);
      expect(partner!.status).toBe('active');
      expect(partner!.version).toBe(1);
    });

    it('should create a vendor partner', () => {
      const id = partnerRepository.create({
        name: 'Supplier Inc',
        type: 'vendor',
        contactPerson: '',
        email: 'sales@supplier.com',
        phone: '',
        address: '',
        city: 'Chicago',
        country: '',
        taxRegistrationNumber: '',
        defaultVatCodeId: null,
        paymentTermId: null,
        creditLimit: 0,
        status: 'active',
        tags: [],
      });
      expect(id).toBeGreaterThan(0);
    });
  });

  describe('findById', () => {
    it('should return partner by id', () => {
      const partner = partnerRepository.findById(1);
      expect(partner).not.toBeNull();
      expect(partner!.id).toBe(1);
      expect(partner!.name).toBe('Acme Corp');
    });

    it('should return null for non-existent id', () => {
      expect(partnerRepository.findById(99999)).toBeNull();
    });
  });

  describe('findByCode', () => {
    it('should return partner by code', () => {
      const partner = partnerRepository.findByCode('BP-00001');
      expect(partner).not.toBeNull();
      expect(partner!.name).toBe('Acme Corp');
    });

    it('should return null for non-existent code', () => {
      expect(partnerRepository.findByCode('INVALID')).toBeNull();
    });
  });

  describe('findAll with filters', () => {
    it('should filter by type', () => {
      const customers = partnerRepository.findAll(undefined, 'customer');
      expect(customers.length).toBeGreaterThanOrEqual(1);
      customers.forEach(c => expect(c.type).toBe('customer'));
    });

    it('should search by name', () => {
      const results = partnerRepository.findAll('Acme');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toContain('Acme');
    });
  });

  describe('update', () => {
    it('should update partner fields and increment version', () => {
      const partner = partnerRepository.findById(1)!;
      const versionBefore = partner.version;

      const success = partnerRepository.update(1, {
        name: 'Acme Corp Updated',
        email: 'new@acme.com',
        type: 'customer',
        creditLimit: 0,
        status: 'active',
      }, versionBefore);
      expect(success).toBe(true);

      const updated = partnerRepository.findById(1)!;
      expect(updated.name).toBe('Acme Corp Updated');
      expect(updated.email).toBe('new@acme.com');
      expect(updated.version).toBe(versionBefore + 1);
    });

    it('should return false on version conflict', () => {
      expect(partnerRepository.update(1, { name: 'Conflict' }, 999)).toBe(false);
    });
  });

  describe('softDelete', () => {
    it('should mark partner as deleted', () => {
      const id = partnerRepository.create({
        name: 'Temp',
        type: 'customer',
        contactPerson: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        country: '',
        taxRegistrationNumber: '',
        defaultVatCodeId: null,
        paymentTermId: null,
        creditLimit: 0,
        status: 'active',
        tags: [],
      });
      const before = partnerRepository.findById(id)!;
      expect(before.status).toBe('active');

      partnerRepository.softDelete(id, before.version);
      const deleted = partnerRepository.findById(id);
      expect(deleted!.status).toBe('deleted');

      // Should not appear in findAll (filtered out)
      const all = partnerRepository.findAll();
      expect(all.find(p => p.id === id)).toBeUndefined();
    });
  });

  describe('count', () => {
    it('should return count of non-deleted partners', () => {
      const count = partnerRepository.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });
});
