import { NextRequest } from 'next/server';
import { z } from 'zod';
import { exportService } from '@/lib/services/exportService';
import { handleApiError, ValidationError } from '@/lib/utils/errors';
import { validate } from '@/lib/validators';
import { dateStringSchema } from '@/lib/validators/common';
import { ensureInitialized } from '@/lib/db';

const validReportTypes = ['trial-balance', 'income-statement', 'balance-sheet', 'ledger', 'aging', 'inventory-valuation', 'tax-summary'];

const exportQuerySchema = z.object({
  format: z.enum(['csv', 'xls']).optional().default('csv'),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  asOfDate: dateStringSchema.optional(),
  periodId: z.coerce.number().int().positive().optional(),
  accountCode: z.string().optional(),
  costCenterId: z.coerce.number().int().positive().optional(),
  businessPartnerId: z.coerce.number().int().positive().optional(),
  lineType: z.enum(['normal', 'tax', 'payment']).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ reportType: string }> }) {
  try {
    await ensureInitialized();
    const { reportType } = await params;

    if (!validReportTypes.includes(reportType)) {
      throw new ValidationError(`Invalid report type. Valid types: ${validReportTypes.join(', ')}`);
    }

    const { searchParams } = new URL(request.url);
    const queryParams = Object.fromEntries(searchParams.entries());
    const { format, startDate, endDate, asOfDate, periodId, accountCode, costCenterId, businessPartnerId, lineType } = validate(exportQuerySchema, queryParams);

    let result: { content: string; filename: string; contentType: string };

    switch (reportType) {
      case 'trial-balance':
        result = exportService.trialBalance(format, periodId);
        break;
      case 'income-statement':
        if (!startDate || !endDate) throw new ValidationError('startDate and endDate are required');
        result = exportService.incomeStatement(format, startDate, endDate);
        break;
      case 'balance-sheet':
        if (!asOfDate) throw new ValidationError('asOfDate is required');
        result = exportService.balanceSheet(format, asOfDate);
        break;
      case 'ledger':
        if (!startDate || !endDate) throw new ValidationError('startDate and endDate are required');
        result = exportService.ledger(format, startDate, endDate, { accountCode, costCenterId, businessPartnerId, lineType });
        break;
      case 'aging':
        result = exportService.aging(format);
        break;
      case 'inventory-valuation':
        result = exportService.inventoryValuation(format);
        break;
      case 'tax-summary':
        result = exportService.taxSummary(format, startDate, endDate);
        break;
      default:
        throw new ValidationError(`Invalid report type: ${reportType}`);
    }

    return new Response(result.content, {
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
