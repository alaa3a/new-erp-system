import { NextRequest, NextResponse } from 'next/server';
import { productProfileRepository } from '@/lib/repositories/productProfileRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { requirePermission } from '@/lib/auth/middleware';
import { validate, createProductProfileSchema } from '@/lib/validators';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized();
    const { id } = await params;
    const profile = productProfileRepository.findById(Number(id));
    if (!profile) {
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized();
    const auth = await requirePermission(request, 'product.create');
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    const body = validate(createProductProfileSchema.partial(), await request.json());
    const updated = productProfileRepository.update(Number(id), body);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
    }
    const profile = productProfileRepository.findById(Number(id));
    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized();
    const auth = await requirePermission(request, 'product.create');
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    const deleted = productProfileRepository.softDelete(Number(id));
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { message: 'Profile deleted' } });
  } catch (error) {
    return handleApiError(error);
  }
}
