import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from '../test-helper';
import { getDefaultProfile, resolveAr, resolveAp, resolveCash, resolveDiscount, validateProfile } from '../../services/postingProfileService';
import { postingProfileRepository } from '../../repositories/postingProfileRepository';
import { ValidationError } from '../../utils/errors';

describe('postingProfileService', () => {
  let data: any;

  beforeAll(async () => {
    await setupTestDatabase();
    data = seedTestData();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  describe('resolver', () => {
    it('should resolve the default profile for an invoice type', () => {
      const profile = getDefaultProfile('sales');
      expect(profile).not.toBeNull();
      expect(profile!.invoiceType).toBe('sales');
    });

    it('should resolve AR/AP/cash/discount from the explicit profile', () => {
      const profile = postingProfileRepository.findById(data.postingProfileId)!;
      expect(resolveAr(profile)).toBe('102');
      expect(resolveAp(profile)).toBe('201');
      expect(resolveCash(profile)).toBe('101');
      expect(resolveDiscount(profile)).toBe('502');
    });

    it('should fall back to the default profile when none is passed', () => {
      // Seed profile is the only (default) profile — resolver falls back to it.
      expect(resolveAr(null)).toBe('102');
      expect(resolveAp(null)).toBe('201');
      expect(resolveCash(null)).toBe('101');
    });
  });

  describe('validateProfile', () => {
    it('should require AR for sales-side profiles and AP for purchase-side', () => {
      expect(() => validateProfile({ invoiceType: 'sales', accountsPayableCode: '201', cashAccountCode: '101' }))
        .toThrow(ValidationError);
      expect(() => validateProfile({ invoiceType: 'purchase', accountsReceivableCode: '102', cashAccountCode: '101' }))
        .toThrow(ValidationError);
      expect(() => validateProfile({ invoiceType: 'purchase', accountsPayableCode: '201', cashAccountCode: '101' }))
        .not.toThrow();
    });

    it('should require a cash account', () => {
      expect(() => validateProfile({ invoiceType: 'sales', accountsReceivableCode: '102' }))
        .toThrow(/Cash \/ Bank account is required/);
    });

    it('should reject AR and AP being the same account', () => {
      expect(() => validateProfile({ invoiceType: 'sales', accountsReceivableCode: '102', accountsPayableCode: '102', cashAccountCode: '101' }))
        .toThrow(/must be different accounts/);
    });

    it('should return no warning for a consistent profile', () => {
      const warning = validateProfile({ invoiceType: 'sales', accountsReceivableCode: '102', cashAccountCode: '101' });
      expect(warning).toBe('');
    });
  });

  describe('repository (Phase 7 changes)', () => {
    it('should persist entryCategoryId on create', () => {
      const id = postingProfileRepository.create({
        name: 'Cat Profile', invoiceType: 'sales',
        accountsReceivableCode: '102', accountsPayableCode: '', cashAccountCode: '101',
        discountAccountCode: '', inventoryAccountCode: '', cogsAccountCode: '',
        entryCategoryId: 7, isDefault: false, isActive: true,
      });
      expect(postingProfileRepository.findById(id)!.entryCategoryId).toBe(7);
    });

    it('should clear other defaults of the same invoice type', () => {
      const id = postingProfileRepository.create({
        name: 'Second Sales', invoiceType: 'sales',
        accountsReceivableCode: '102', accountsPayableCode: '', cashAccountCode: '101',
        discountAccountCode: '', inventoryAccountCode: '', cogsAccountCode: '',
        entryCategoryId: null, isDefault: true, isActive: true,
      });
      postingProfileRepository.clearOtherDefaults(id, 'sales');
      const salesDefaults = postingProfileRepository.findAll()
        .filter(p => p.invoiceType === 'sales' && p.isDefault);
      expect(salesDefaults.length).toBe(1);
      expect(salesDefaults[0].id).toBe(id);
    });
  });
});
