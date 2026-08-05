import { NextRequest, NextResponse } from 'next/server';
import { reportingService } from '@/lib/services/reportingService';
import { handleApiError } from '@/lib/utils/errors';
import { validate } from '@/lib/validators';
import { reportDateRangeSchema } from '@/lib/validators/reports';
import { ensureInitialized } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized();
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const { periodId } = validate(reportDateRangeSchema, params);

    const result = reportingService.getTrialBalance(periodId);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
