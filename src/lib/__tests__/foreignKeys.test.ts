import { describe, it, expect, beforeAll } from 'vitest';
import { db, ensureInitialized } from '../db';

describe('Foreign Key Constraints', () => {
  beforeAll(async () => {
    await ensureInitialized();
  });

  it('should have PRAGMA foreign_keys = ON', () => {
    const result = db.prepare('PRAGMA foreign_keys').get() as any;
    expect(result.foreign_keys).toBe(1);
  });
});
