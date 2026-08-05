import { z } from 'zod'
import { dateStringSchema } from './common'

export const reportDateRangeSchema = z.object({
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  periodId: z.coerce.number().int().positive().optional(),
})

export const agingReportSchema = reportDateRangeSchema.extend({
  partnerId: z.coerce.number().int().positive().optional(),
  partnerType: z.enum(['customer', 'supplier', 'both']).optional().default('customer'),
})

export const ledgerReportSchema = z.object({
  accountCode: z.string().optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  costCenterId: z.coerce.number().int().positive().optional(),
  businessPartnerId: z.coerce.number().int().positive().optional(),
  lineType: z.enum(['normal', 'tax', 'payment']).optional(),
})
