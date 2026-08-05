import { NextRequest, NextResponse } from 'next/server';
import { reportingService } from '@/lib/services/reportingService';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const rawVat = searchParams.get('vatCodeId');
    const vatCodeId = rawVat ? parseInt(rawVat, 10) : undefined;
    const data = reportingService.getTaxSummaryDetails(startDate, endDate, vatCodeId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}
