import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { inventoryRepository } from '@/lib/repositories/inventoryRepository';

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth;
    const valuation = inventoryRepository.getValuation();
    return NextResponse.json({ success: true, data: valuation });
  } catch (error) {
    return handleApiError(error);
  }
}
