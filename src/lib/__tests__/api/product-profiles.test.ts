import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from '../test-helper';
import { productProfileRepository } from '../../repositories/productProfileRepository';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/middleware', () => ({
  requirePermission: vi.fn(async () => ({ userId: 1 })),
}));

import { POST } from '@/app/api/products/profiles/route';

function makeRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/products/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe('POST /api/products/profiles', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });
  afterAll(() => {
    teardownTestDatabase();
  });

  it('creates a profile', async () => {
    const res = await POST(makeRequest({
      code: 'NEW1', name: 'New Profile', description: '',
    }));
    expect(res.status).toBe(201);
  });

  it('rejects a duplicate code with a friendly 400 instead of a 500', async () => {
    // 'STD' is seeded by the DB, so creating it again must fail cleanly.
    const res = await POST(makeRequest({
      code: 'STD', name: 'Duplicate', description: '',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('already');
  });

  it('rejects a code that was soft-deleted (unique constraint stays reserved)', async () => {
    const id = productProfileRepository.create({ code: 'GHOST', name: 'Ghost' });
    productProfileRepository.softDelete(id);
    const res = await POST(makeRequest({
      code: 'GHOST', name: 'Recreate', description: '',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('already');
  });
});
