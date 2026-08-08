import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, db } from '@/lib/db';
import { handleApiError } from '@/lib/utils/errors';
import { requirePermission } from '@/lib/auth/middleware';

export async function GET() {
  try {
    await ensureInitialized();
    const rows = db.prepare('SELECT * FROM product WHERE isCategory = 1 AND deletedAt IS NULL ORDER BY code').all();
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized();
    const auth = await requirePermission(request, 'product.create');
    if (auth instanceof NextResponse) return auth;
    const body = await request.json();

    if (!body.code?.trim() || !body.name?.trim()) {
      return NextResponse.json({ success: false, error: 'Code and name are required' }, { status: 400 });
    }

    const existing = db.prepare('SELECT id FROM product WHERE code = ? AND isCategory = 1').get(body.code.trim());
    if (existing) {
      return NextResponse.json({ success: false, error: 'Category code already exists' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const id = db.prepare(
      'INSERT INTO product (code, name, description, itemType, unitOfMeasure, isCategory, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 1)'
    ).run(body.code.trim(), body.name.trim(), body.description || '', 'stock', 'pcs', body.isActive !== false ? 1 : 0, now, now).lastInsertRowid;

    const category = db.prepare('SELECT * FROM product WHERE id = ?').get(id);
    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
