import { NextRequest, NextResponse } from 'next/server';
import { reportingService } from '@/lib/services/reportingService';
import { handleApiError } from '@/lib/utils/errors';
import { validate } from '@/lib/validators';
import { ledgerReportSchema } from '@/lib/validators/reports';
import { ensureInitialized } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized();
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const { startDate, endDate, accountCode, costCenterId, businessPartnerId, lineType } = validate(ledgerReportSchema, params);

    const rows = reportingService.getGeneralLedger(startDate, endDate, {
      accountCode,
      costCenterId,
      businessPartnerId,
      lineType,
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return handleApiError(error);
  }
}
