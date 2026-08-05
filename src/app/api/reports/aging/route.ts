import { NextRequest, NextResponse } from 'next/server';
import { reportingService } from '@/lib/services/reportingService';
import { agingService } from '@/lib/services/agingService';
import { handleApiError } from '@/lib/utils/errors';
import { validate } from '@/lib/validators';
import { agingReportSchema } from '@/lib/validators/reports';
import { ensureInitialized } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized();
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const { partnerId, startDate, endDate } = validate(agingReportSchema, params);

    const partnerAging = reportingService.getPartnerAging();
    const overdueReceivables = agingService.getOverdueReceivables();
    const overduePayables = agingService.getOverduePayables();
    const inventoryValuation = reportingService.getInventoryValuation();
    const taxSummary = reportingService.getTaxSummary(startDate, endDate);

    return NextResponse.json({ success: true, data: {
      partnerAging,
      overdueReceivables,
      overduePayables,
      inventoryValuation,
      taxSummary,
    }});
  } catch (error) {
    return handleApiError(error);
  }
}
