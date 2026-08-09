import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized } from '@/lib/db';
import { handleApiError } from '@/lib/utils/errors';
import { requirePermission } from '@/lib/auth/middleware';
import { ProductCategoryRepository } from '@/lib/repositories/productCategoryRepository';
import { generateCategoryCode } from '@/lib/utils/idGenerator';

const productCategoryRepository = new ProductCategoryRepository();

export async function GET() {
  try {
    await ensureInitialized();
    const categories = productCategoryRepository.findAll();
    return NextResponse.json({ success: true, data: categories });
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

    if (!body.name?.trim()) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }

    const code = body.code?.trim() || generateCategoryCode();

    // Check for duplicate code
    const allCategories = await productCategoryRepository.findAll();
    const existing = allCategories.find(c => c.code === code);
    if (existing) {
      return NextResponse.json({ success: false, error: 'Category code already exists' }, { status: 409 });
    }

    const id = await productCategoryRepository.create({
      code,
      name: body.name.trim(),
      description: body.description || '',
      isActive: body.isActive !== false,
      parentId: body.parentId ?? null,
      version: 1,
    });

    const category = await productCategoryRepository.findById(id);
    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
