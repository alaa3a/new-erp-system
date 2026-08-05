import { z } from 'zod'
import { moneySchema, optionalString, dateStringSchema } from './common'

const lineAllocationSchema = z.object({
  invoiceId: z.number().int().positive('Invoice id must be a positive integer'),
  amount: moneySchema,
  notes: z.string().max(500).optional().default(''),
})

const entryLineSchema = z.object({
  accountCode: z.string().min(1, 'Account code is required'),
  debitAmount: moneySchema,
  creditAmount: moneySchema,
  description: z.string().max(500).optional().default(''),
  lineType: z.enum(['normal', 'tax', 'payment']).optional().default('normal'),
  costCenterId: z.number().int().positive().nullable().optional().default(null),
  businessPartnerId: z.number().int().positive().nullable().optional().default(null),
  vatCodeId: z.number().int().positive().nullable().optional().default(null),
  vatAmount: z.number().int().min(0).optional().default(0),
  supplierName: z.string().max(200).nullable().optional().default(null),
  supplierTaxId: z.string().max(100).nullable().optional().default(null),
  invoiceNumber: z.string().max(100).nullable().optional().default(null),
  invoiceDate: z.string().max(20).nullable().optional().default(null),
  employeeId: z.number().int().positive().nullable().optional().default(null),
  /** Free-form captured values of the tax type's dynamic detail fields (Phase 4) — a JSON string. */
  taxDetailsJson: z.string().max(4000).nullable().optional().default(null),
  allocations: z.array(lineAllocationSchema).optional().default([]),
})

export const createEntrySchema = z.object({
  entryDate: dateStringSchema,
  description: z.string().min(1, 'Description is required').max(500),
  reference: optionalString,
  lines: z.array(entryLineSchema).min(2, 'At least two lines are required for a balanced entry'),
  entryCategoryId: z.number().int().positive().nullable().optional().default(null),
})

export const updateEntrySchema = createEntrySchema.partial()
