import { z } from 'zod'
import { entityNameSchema, optionalString } from './common'

export const partnerTypeEnum = z.enum(['customer', 'vendor', 'both'])

export const createPartnerSchema = z.object({
  name: entityNameSchema,
  type: partnerTypeEnum,
  contactPerson: z.string().max(200).optional().default(''),
  email: z.string().email('Invalid email').optional().default(''),
  phone: z.string().max(50).optional().default(''),
  taxId: z.string().max(50).optional().default(''),
  address: optionalString,
  city: z.string().max(100).optional().default(''),
  country: z.string().max(100).optional().default(''),
  creditLimit: z.number().int().min(0).optional().default(0),
  paymentTermId: z.number().int().positive().nullable().optional().default(null),
  status: z.enum(['active', 'inactive']).optional().default('active'),
  tags: z.array(z.string()).optional().default([]),
})

export const updatePartnerSchema = createPartnerSchema.partial()
