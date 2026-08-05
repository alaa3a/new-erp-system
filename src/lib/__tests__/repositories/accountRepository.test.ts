import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from '../test-helper';
import { accountRepository } from '../../repositories/accountRepository';
import { db } from '../../db';

describe('accountRepository', () => {
  beforeAll(async () => {
    await setupTestDatabase();
    seedTestData();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  describe('findAll', () => {
    it('should return all active accounts ordered by code', () => {
      const accounts = accountRepository.findAll();
      expect(accounts.length).toBeGreaterThan(0);
      // Check ordering
      for (let i = 1; i < accounts.length; i++) {
        expect(accounts[i].code.localeCompare(accounts[i - 1].code)).toBeGreaterThanOrEqual(0);
      }
      // All accounts should be active
      accounts.forEach(a => expect(a.isActive).toBe(true));
    });
  });

  describe('findHierarchy', () => {
    it('should return all accounts including inactive', () => {
      const accounts = accountRepository.findHierarchy();
      // Should include root accounts (1-5)
      const rootAccts = accounts.filter(a => a.parentId === null);
      expect(rootAccts.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('findById', () => {
    it('should return account by id', () => {
      const account = accountRepository.findById(1);
      expect(account).not.toBeNull();
      expect(account!.id).toBe(1);
    });

    it('should return null for non-existent id', () => {
      const account = accountRepository.findById(99999);
      expect(account).toBeNull();
    });
  });

  describe('findByCode', () => {
    it('should return account by code', () => {
      const account = accountRepository.findByCode('1');
      expect(account).not.toBeNull();
      expect(account!.code).toBe('1');
    });

    it('should return null for non-existent code', () => {
      const account = accountRepository.findByCode('ZZZZ');
      expect(account).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new account and return its id', () => {
      const id = accountRepository.create({
        code: '601',
        name: 'Test Expense',
        type: 'expense',
        parentId: 5,
        costCenterId: null,
        linkType: null,
        linkId: null,
        linkPartnerFilter: null,
        isActive: true,
        isSystemAccount: false,
        description: 'Test account',
      });
      expect(id).toBeGreaterThan(0);

      const created = accountRepository.findById(id);
      expect(created).not.toBeNull();
      expect(created!.code).toBe('601');
      expect(created!.name).toBe('Test Expense');
      expect(created!.type).toBe('expense');
      expect(created!.parentId).toBe(5);
      expect(created!.isActive).toBe(true);
      expect(created!.version).toBe(1);
    });

  });

  describe('update', () => {
    it('should update account fields and increment version', () => {
      const account = accountRepository.findById(1)!;
      const versionBefore = account.version;

      const success = accountRepository.update(1, { name: 'Updated Assets' }, versionBefore);
      expect(success).toBe(true);

      const updated = accountRepository.findById(1)!;
      expect(updated.name).toBe('Updated Assets');
      expect(updated.version).toBe(versionBefore + 1);
    });

    it('should return false on version conflict', () => {
      const success = accountRepository.update(1, { name: 'Conflict' }, 999);
      expect(success).toBe(false);
    });
  });

  describe('hardDelete', () => {
    it('should permanently delete the account', () => {
      const id = accountRepository.create({
        code: '602', name: 'Delete Me', type: 'expense',
        parentId: null, costCenterId: null, linkType: null, linkId: null, linkPartnerFilter: null, isActive: true,
        isSystemAccount: false, description: '',
      });
      const before = accountRepository.findById(id)!;
      const success = accountRepository.hardDelete(id, before.version);
      expect(success).toBe(true);

      // Row should be fully removed (not just deactivated)
      expect(accountRepository.findById(id)).toBeNull();
      const all = accountRepository.findAll();
      expect(all.find(a => a.id === id)).toBeUndefined();
    });
  });

  describe('toggleActive', () => {
    it('should toggle account active state', () => {
      const id = accountRepository.create({
        code: '603', name: 'Toggle Me', type: 'expense',
        parentId: null, costCenterId: null, linkType: null, linkId: null, linkPartnerFilter: null, isActive: true,
        isSystemAccount: false, description: '',
      });
      const before = accountRepository.findById(id)!;
      expect(before.isActive).toBe(true);

      accountRepository.toggleActive(id, false, before.version);
      const toggled = accountRepository.findById(id)!;
      expect(toggled.isActive).toBe(false);
    });
  });

  describe('hasChildren', () => {
    it('should return true for parent accounts', () => {
      // Account 1 (Assets) should have children
      expect(accountRepository.hasChildren(1)).toBe(true);
    });

    it('should return false for leaf accounts', () => {
      expect(accountRepository.hasChildren(99999)).toBe(false);
    });
  });

  describe('usage checks', () => {
    it('should return false for unused accounts', () => {
      expect(accountRepository.isUsedInEntries('999')).toBe(false);
      expect(accountRepository.isUsedInInvoiceLines('999')).toBe(false);
      expect(accountRepository.isUsedInPostingProfiles('999')).toBe(false);
    });
  });

  describe('getUsageMap', () => {
    it('should return usage keyed by account code', () => {
      const usage = accountRepository.getUsageMap();
      expect(typeof usage).toBe('object');
      // Seed posting profile uses account '102' (AR) and seed tax type uses '202'
      const arUsage = usage['102'];
      expect(arUsage).toBeDefined();
      expect(arUsage.postingProfiles.length).toBeGreaterThan(0);
      const taxUsage = usage['202'];
      expect(taxUsage).toBeDefined();
      expect(taxUsage.taxCodes.length).toBeGreaterThan(0);
    });
  });

  describe('getActiveProfileRoles', () => {
    it('should report AR/AP usage only from active profiles', () => {
      // Seed profile maps '102' as AR and '201' as AP
      expect(accountRepository.getActiveProfileRoles('102')).toEqual({ asAr: true, asAp: false });
      expect(accountRepository.getActiveProfileRoles('201')).toEqual({ asAr: false, asAp: true });
      expect(accountRepository.getActiveProfileRoles('999')).toEqual({ asAr: false, asAp: false });
    });

    it('should ignore soft-deleted (inactive) profiles', () => {
      const id = accountRepository.create({
        code: '607', name: 'Role Profile', type: 'asset',
        parentId: null, costCenterId: null, linkType: null, linkId: null, linkPartnerFilter: null, isActive: true,
        isSystemAccount: false, description: '',
      });
      const profile = (db.prepare('SELECT id, version FROM posting_profile LIMIT 1').get() as any);
      db.prepare('UPDATE posting_profile SET isActive=0 WHERE id=?').run(profile.id);
      // '102' was AR in the (now inactive) seed profile → should no longer report AR
      expect(accountRepository.getActiveProfileRoles('102').asAr).toBe(false);
      db.prepare('UPDATE posting_profile SET isActive=1 WHERE id=?').run(profile.id);
      expect(id).toBeGreaterThan(0);
    });
  });

  describe('dynamic links (Phase 1)', () => {
    it('should persist link fields on create and default them to null', () => {
      const id = accountRepository.create({
        code: '701', name: 'Linked CC Account', type: 'asset',
        parentId: null, costCenterId: null, linkType: 'cost_center', linkId: 1,
        linkPartnerFilter: null, isActive: true,
        isSystemAccount: false, description: '',
      });
      const acct = accountRepository.findById(id)!;
      expect(acct.linkType).toBe('cost_center');
      expect(acct.linkId).toBe(1);
      expect(acct.linkPartnerFilter).toBeNull();
    });

    it('linkAccount with a cost center keeps the legacy costCenterId in sync', () => {
      const id = accountRepository.create({
        code: '702', name: 'Link Sync', type: 'asset',
        parentId: null, costCenterId: null, linkType: null, linkId: null, linkPartnerFilter: null, isActive: true,
        isSystemAccount: false, description: '',
      });
      const before = accountRepository.findById(id)!;
      const ok = accountRepository.linkAccount(id, { type: 'cost_center', linkId: 2 }, before.version);
      expect(ok).toBe(true);
      const after = accountRepository.findById(id)!;
      expect(after.linkType).toBe('cost_center');
      expect(after.linkId).toBe(2);
      expect(after.costCenterId).toBe(2);
    });

    it('linkAccount with a partner filter persists the type filter', () => {
      const id = accountRepository.create({
        code: '703', name: 'Partner Link', type: 'asset',
        parentId: null, costCenterId: null, linkType: null, linkId: null, linkPartnerFilter: null, isActive: true,
        isSystemAccount: false, description: '',
      });
      let v = accountRepository.findById(id)!.version;
      accountRepository.linkAccount(id, { type: 'partner', linkId: 1, partnerFilter: 'customer' }, v);
      expect(accountRepository.findById(id)!.linkType).toBe('partner');
      expect(accountRepository.findById(id)!.linkPartnerFilter).toBe('customer');
      expect(accountRepository.findById(id)!.costCenterId).toBeNull();

      v = accountRepository.findById(id)!.version;
      accountRepository.linkAccount(id, { type: 'partner', linkId: 2, partnerFilter: 'vendor' }, v);
      expect(accountRepository.findById(id)!.linkPartnerFilter).toBe('vendor');

      v = accountRepository.findById(id)!.version;
      accountRepository.linkAccount(id, { type: 'partner', linkId: 3, partnerFilter: 'both' }, v);
      expect(accountRepository.findById(id)!.linkPartnerFilter).toBe('both');
    });

    it('linkAccount with null clears the link and costCenterId', () => {
      const id = accountRepository.create({
        code: '704', name: 'Clear Link', type: 'asset',
        parentId: null, costCenterId: null, linkType: null, linkId: null, linkPartnerFilter: null, isActive: true,
        isSystemAccount: false, description: '',
      });
      let before = accountRepository.findById(id)!;
      accountRepository.linkAccount(id, { type: 'cost_center', linkId: 2 }, before.version);
      before = accountRepository.findById(id)!;
      const ok = accountRepository.linkAccount(id, { type: null, linkId: null }, before.version);
      expect(ok).toBe(true);
      const after = accountRepository.findById(id)!;
      expect(after.linkType).toBeNull();
      expect(after.linkId).toBeNull();
      expect(after.costCenterId).toBeNull();
      expect(after.linkPartnerFilter).toBeNull();
    });

    it('clearing a partner link clears the stored partner filter', () => {
      const id = accountRepository.create({
        code: '707', name: 'Role Reset', type: 'asset',
        parentId: null, costCenterId: null, linkType: null, linkId: null, linkPartnerFilter: null, isActive: true,
        isSystemAccount: false, description: '',
      });
      let v = accountRepository.findById(id)!.version;
      accountRepository.linkAccount(id, { type: 'partner', linkId: 1, partnerFilter: 'customer' }, v);
      expect(accountRepository.findById(id)!.linkPartnerFilter).toBe('customer');
      v = accountRepository.findById(id)!.version;
      accountRepository.linkAccount(id, { type: null, linkId: null }, v);
      const after = accountRepository.findById(id)!;
      expect(after.linkType).toBeNull();
      expect(after.linkPartnerFilter).toBeNull();
    });

    it('linkCostCenter wrapper still works and keeps the link in sync', () => {
      const id = accountRepository.create({
        code: '705', name: 'Wrapper', type: 'asset',
        parentId: null, costCenterId: null, linkType: null, linkId: null, linkPartnerFilter: null, isActive: true,
        isSystemAccount: false, description: '',
      });
      const before = accountRepository.findById(id)!;
      accountRepository.linkCostCenter(id, 2, before.version);
      expect(accountRepository.findById(id)!.linkType).toBe('cost_center');
      expect(accountRepository.findById(id)!.linkId).toBe(2);
      expect(accountRepository.findById(id)!.costCenterId).toBe(2);
    });

    it('cascadeLink propagates the link to all descendants', () => {
      const affected = accountRepository.cascadeLink(1, { type: 'cost_center', linkId: 2 });
      expect(affected).toBeGreaterThan(0);
      const child = db.prepare('SELECT * FROM account WHERE parentId = 1 LIMIT 1').get() as { linkType: string | null; linkId: number | null; costCenterId: number | null; linkPartnerFilter: string | null };
      expect(child.linkType).toBe('cost_center');
      expect(child.linkId).toBe(2);
      expect(child.costCenterId).toBe(2);
      // restore so other tests are unaffected
      accountRepository.cascadeLink(1, { type: null, linkId: null });
    });

    it('cascadeLink propagates partner links with their type filter', () => {
      const affected = accountRepository.cascadeLink(1, { type: 'partner', linkId: 1, partnerFilter: 'customer' });
      expect(affected).toBeGreaterThan(0);
      const child = db.prepare('SELECT * FROM account WHERE parentId = 1 LIMIT 1').get() as { linkType: string | null; linkId: number | null; costCenterId: number | null; linkPartnerFilter: string | null };
      expect(child.linkType).toBe('partner');
      expect(child.linkId).toBe(1);
      expect(child.linkPartnerFilter).toBe('customer');
      // restore
      accountRepository.cascadeLink(1, { type: null, linkId: null });
    });

    it('linkAccount returns false on version conflict', () => {
      const id = accountRepository.create({
        code: '706', name: 'Link Conflict', type: 'asset',
        parentId: null, costCenterId: null, linkType: null, linkId: null, linkPartnerFilter: null, isActive: true,
        isSystemAccount: false, description: '',
      });
      const ok = accountRepository.linkAccount(id, { type: 'cost_center', linkId: 2 }, 999);
      expect(ok).toBe(false);
    });
  });
});
