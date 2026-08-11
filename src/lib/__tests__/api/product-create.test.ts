import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from '../test-helper';
import { db } from '../../db';

vi.mock('@/lib/auth/middleware', () => ({
  requireAuth: vi.fn(async () => ({ userId: 1 })),
}));

import { POST } from '@/app/api/products/route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/products (group create)', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });
  afterAll(() => {
    teardownTestDatabase();
  });

  it('creates a top-level group', async () => {
    const res = await POST(makeRequest({
      code: 'GRP1', name: 'Electronics', isCategory: true,
    }));
    expect(res.status).toBe(201);
  });

  it('creates a group under a parent group', async () => {
    const p = await POST(makeRequest({ code: 'GRP2', name: 'Parent', isCategory: true }));
    const pid = (await p.json()).data.id;
    const res = await POST(makeRequest({
      code: 'GRP3', name: 'Child', isCategory: true, parentId: pid,
    }));
    expect(res.status).toBe(201);
  });

  it('rejects a code used by a soft-deleted product with a friendly 400', async () => {
    const now = new Date().toISOString();
    const id = db.prepare(
      'INSERT INTO product (code, name, description, itemType, unitOfMeasure, salesPrice, purchasePrice, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)'
    ).run('GRP-DEL', 'Deleted Group', '', 'stock', 'pcs', 0, 0, now, now).lastInsertRowid as number;
    db.prepare('UPDATE product SET deletedAt=? WHERE id=?').run(now, id);

    const res = await POST(makeRequest({
      code: 'GRP-DEL', name: 'Recreate Group', isCategory: true,
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('already');
  });
});
