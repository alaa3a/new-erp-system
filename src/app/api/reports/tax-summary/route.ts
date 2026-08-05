import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { reportingService } from '@/lib/services/reportingService';

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const summary = reportingService.getInvoiceTaxSummary(startDate ?? undefined, endDate ?? undefined);

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    return handleApiError(error);
  }
}
