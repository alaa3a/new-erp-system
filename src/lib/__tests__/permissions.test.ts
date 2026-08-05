import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from './test-helper';
import { hasPermission } from '../auth/permissions';
import { db } from '../db';
import { User } from '@/types/erp';

describe('Permission System', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('should allow the seeded admin (granted all permissions)', () => {
    const admin = db.prepare("SELECT * FROM users WHERE email = 'admin@erp.local'").get() as any;
    expect(admin).toBeDefined();
    const adminUser: User = {
      id: admin.id, email: admin.email, passwordHash: admin.passwordHash,
      firstName: admin.firstName, lastName: admin.lastName,
      permissionIds: JSON.parse(admin.permissionIds || '[]'),
      isActive: true, lastLoginAt: null,
      createdAt: admin.createdAt, updatedAt: admin.updatedAt, version: admin.version,
    };
    expect(hasPermission(adminUser, 'invoice.view')).toBe(true);
    expect(hasPermission(adminUser, 'invoice.approve')).toBe(true);
    expect(hasPermission(adminUser, 'purchaseOrder.close')).toBe(true);
    expect(hasPermission(adminUser, 'inventory.adjust')).toBe(true);
  });

  it('should deny a user without the matching permission', () => {
    const user: User = {
      id: 999, email: 'limited@test.com', passwordHash: '', firstName: 'Limited', lastName: 'User',
      permissionIds: [], isActive: true, lastLoginAt: null, createdAt: '', updatedAt: '', version: 1,
    };
    expect(hasPermission(user, 'invoice.view')).toBe(false);
    expect(hasPermission(user, 'invoice.approve')).toBe(false);
  });

  it('should return a boolean without throwing for any valid key', () => {
    const user: User = {
      id: 1, email: 'test@test.com', passwordHash: '', firstName: 'Test', lastName: 'User',
      permissionIds: [], isActive: true, lastLoginAt: null, createdAt: '', updatedAt: '', version: 1,
    };
    expect(typeof hasPermission(user, 'invoice.view')).toBe('boolean');
  });
});
