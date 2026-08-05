import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { reportingService } from '@/lib/services/reportingService';
import { handleApiError } from '@/lib/utils/errors';
import { validate } from '@/lib/validators';
import { dateStringSchema } from '@/lib/validators/common';
import { ensureInitialized } from '@/lib/db';

const balanceSheetSchema = z.object({
  asOfDate: dateStringSchema,
});

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized();
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const { asOfDate } = validate(balanceSheetSchema, params);

    const rows = reportingService.getBalanceSheet(asOfDate);
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return handleApiError(error);
  }
}
