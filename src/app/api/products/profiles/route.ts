import { NextRequest, NextResponse } from 'next/server';
import { productProfileRepository } from '@/lib/repositories/productProfileRepository';
import { handleApiError, ValidationError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { requirePermission } from '@/lib/auth/middleware';
import { validate, createProductProfileSchema } from '@/lib/validators';

export async function GET() {
  try {
    await ensureInitialized();
    const profiles = productProfileRepository.findAll();
    return NextResponse.json({ success: true, data: profiles });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized();
    const auth = await requirePermission(request, 'product.create');
    if (auth instanceof NextResponse) return auth;
    const body = validate(createProductProfileSchema, await request.json());
    if (productProfileRepository.findByCode(body.code)) {
      throw new ValidationError(`Product profile code "${body.code}" is already in use`);
    }
    const id = productProfileRepository.create(body);
    const profile = productProfileRepository.findById(id);
    return NextResponse.json({ success: true, data: profile }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
