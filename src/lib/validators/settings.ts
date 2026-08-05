import { z } from 'zod'
import { entityNameSchema, optionalString, dateStringSchema } from './common'

export const companySchema = z.object({
  name: entityNameSchema,
  registrationNumber: z.string().max(100).optional().default(''),
  taxRegistrationNumber: z.string().max(100).optional().default(''),
  address: optionalString,
  city: z.string().max(100).optional().default(''),
  country: z.string().max(100).optional().default(''),
  phone: z.string().max(50).optional().default(''),
  email: z.string().email().optional().default(''),
  website: z.string().max(200).optional().default(''),
  baseCurrencyCode: z.string().length(3).optional().default('USD'),
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional().default(1),
})

export const fiscalPeriodSchema = z.object({
  name: entityNameSchema,
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  isOpen: z.boolean().optional().default(true),
})

export const paymentTermSchema = z.object({
  code: z.string('Code is required').min(1).max(20),
  name: entityNameSchema,
  daysUntilDue: z.number().int().min(0, 'Due days must be non-negative'),
  discountDays: z.number().int().min(0).optional().default(0),
  discountPercent: z.number().min(0).max(100).optional().default(0),
})

export const postingProfileSchema = z.object({
  name: entityNameSchema,
  invoiceType: z.enum(['sales', 'purchase', 'debit_note', 'credit_note']).optional().default('sales'),
  accountsReceivableCode: z.string().max(20).optional().default(''),
  accountsPayableCode: z.string().max(20).optional().default(''),
  cashAccountCode: z.string().max(20).optional().default(''),
  discountAccountCode: z.string().max(20).optional().default(''),
  inventoryAccountCode: z.string().max(20).optional().default(''),
  cogsAccountCode: z.string().max(20).optional().default(''),
  entryCategoryId: z.number().int().positive().nullable().optional().default(null),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
})

export const entryCategorySchema = z.object({
  code: z.string('Code is required').min(1).max(50),
  name: entityNameSchema,
  description: optionalString,
  isActive: z.boolean().optional().default(true),
})

export const documentSequenceSchema = z.object({
  id: z.number().int().positive().optional(),
  documentType: z.string().max(50).optional().default(''),
  prefix: z.string().max(10).optional().default(''),
  nextNumber: z.number().int().min(1).optional().default(1),
  padding: z.number().int().min(0).max(10).optional().default(0),
  version: z.number().int().optional(),
})
