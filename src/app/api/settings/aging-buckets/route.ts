import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { agingBucketRepository } from '@/lib/repositories/agingBucketRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function GET() {
  try {
    await ensureInitialized();
    const buckets = agingBucketRepository.findAll();
    return NextResponse.json({ success: true, data: buckets });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const body = await request.json();
    const { id, label, fromDays, toDays, sortOrder, version } = body;
    if (!id || !label) {
      return NextResponse.json({ success: false, error: 'id and label are required' }, { status: 400 });
    }
    const updated = agingBucketRepository.update(id, { label, fromDays, toDays, sortOrder }, version);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Bucket was modified by another user. Please refresh.' }, { status: 409 });
    }
    const buckets = agingBucketRepository.findAll();
    return NextResponse.json({ success: true, data: buckets });
  } catch (error) {
    return handleApiError(error);
  }
}
