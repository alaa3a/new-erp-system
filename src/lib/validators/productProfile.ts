import { z } from 'zod';

export const createProductProfileSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(''),
  salesVatCodeId: z.number().int().positive().nullable().optional().default(null),
  purchaseVatCodeId: z.number().int().positive().nullable().optional().default(null),
  salesAccountId: z.number().int().positive().nullable().optional().default(null),
  purchaseAccountId: z.number().int().positive().nullable().optional().default(null),
  inventoryAccountId: z.number().int().positive().nullable().optional().default(null),
  cogsAccountId: z.number().int().positive().nullable().optional().default(null),
  arAccountId: z.number().int().positive().nullable().optional().default(null),
  apAccountId: z.number().int().positive().nullable().optional().default(null),
  cashAccountId: z.number().int().positive().nullable().optional().default(null),
  discountAccountId: z.number().int().positive().nullable().optional().default(null),
});