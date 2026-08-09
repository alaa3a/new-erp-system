import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from './test-helper';
import { db } from '../db';
import { existsSync } from 'fs';

describe('DEBUG seed state 2', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('prints full permission keys', () => {
    const perms = db.prepare('SELECT id, key FROM permission ORDER BY id').all() as any[];
    console.log('DEBUG keys:', JSON.stringify(perms.map((p) => p.key)));
    console.log('DEBUG fileExists:', existsSync('erp.sqlite'));
    expect(true).toBe(true);
  });
});
