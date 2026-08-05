import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from './test-helper';
import { db } from '../db';

describe('Admin User Seed', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('should seed an admin user with permissions', () => {
    const admin = db.prepare("SELECT * FROM users WHERE email = 'admin@erp.local'").get() as any;
    expect(admin).toBeDefined();
    const permissionIds = JSON.parse(admin.permissionIds || '[]');
    expect(permissionIds.length).toBeGreaterThan(0);
  });

  it('should grant the admin every seeded permission id', () => {
    const admin = db.prepare("SELECT id, permissionIds FROM users WHERE email = 'admin@erp.local'").get() as any;
    const allIds = (db.prepare('SELECT id FROM permission').all() as { id: number }[]).map(p => p.id);
    const adminIds = JSON.parse(admin.permissionIds || '[]');
    expect(adminIds.length).toBe(allIds.length);
    for (const id of allIds) {
      expect(adminIds).toContain(id);
    }
  });
});
