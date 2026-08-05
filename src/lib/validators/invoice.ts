import { z } from 'zod'
import { moneySchema, optionalString, dateStringSchema } from './common'

const invoiceLineSchema = z.object({
  description: z.string().min(1, 'Line description is required').max(500),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unitPrice: moneySchema,
  taxRate: z.number().min(0).max(100).optional().default(0),
  vatRate: z.number().min(0).max(100).optional().default(0),
  vatCodeId: z.number().int().positive().nullable().optional().default(null),
  discountPercent: z.number().min(0).max(100).optional().default(0),
  lineType: z.enum(['stock', 'service']).optional().default('stock'),
  costCenterId: z.number().int().positive().nullable().optional().default(null),
  accountCode: z.string().max(50).optional().default(''),
  warehouseId: z.number().int().positive().nullable().optional().default(null),
  productId: z.number().int().positive().nullable().optional().default(null),
})

export const invoiceTypeEnum = z.enum(['sales', 'purchase', 'debit_note', 'credit_note'])

export const createInvoiceSchema = z.object({
  type: invoiceTypeEnum,
  invoiceNumber: z.string().max(50).optional().default(''),
  invoiceDate: dateStringSchema,
  dueDate: dateStringSchema.optional(),
  businessPartnerId: z.number().int().positive('Partner is required'),
  partnerName: z.string().max(200).optional().default(''),
  partnerTaxId: z.string().max(50).optional().default(''),
  currency: z.string().length(3).optional().default('USD'),
  notes: optionalString,
  lines: z.array(invoiceLineSchema).min(1, 'At least one line is required'),
  costCenterId: z.number().int().positive().nullable().optional().default(null),
})

export const updateInvoiceSchema = createInvoiceSchema.partial()

export const linkPaymentSchema = z.object({
  amount: moneySchema,
})
