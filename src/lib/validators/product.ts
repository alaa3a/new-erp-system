import { z } from 'zod'
import { entityCodeSchema, entityNameSchema, optionalString } from './common'

export const createProductSchema = z.object({
  // Optional: the repository auto-generates the product code (generateProductCode)
  code: entityCodeSchema.optional(),
  name: entityNameSchema,
  description: optionalString,
  itemType: z.enum(['stock', 'service']).optional().default('stock'),
  unit: z.string().max(50).optional().default(''),
  price: z.number().int().min(0, 'Price must be non-negative'),
  cost: z.number().int().min(0).optional().default(0),
  category: z.string().max(100).optional().default(''),
  taxCodeId: z.number().int().positive().nullable().optional().default(null),
  purchaseVatCodeId: z.number().int().positive().nullable().optional().default(null),
  warehouseId: z.number().int().positive().nullable().optional().default(null),
  minStock: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true),
  parentId: z.number().int().positive().nullable().optional().default(null),
  isCategory: z.boolean().optional().default(false),
  profileId: z.number().int().positive().nullable().optional().default(null),
  categoryId: z.number().int().positive().nullable().optional().default(null),
  salesAccountId: z.number().int().positive().nullable().optional().default(null),
  purchaseAccountId: z.number().int().positive().nullable().optional().default(null),
  inventoryAccountId: z.number().int().positive().nullable().optional().default(null),
  cogsAccountId: z.number().int().positive().nullable().optional().default(null),
  defaultCostCenterId: z.number().int().positive().nullable().optional().default(null),
})

export const updateProductSchema = createProductSchema.partial()

export const stockAdjustmentSchema = z.object({
  productId: z.number().int().positive(),
  warehouseId: z.number().int().positive(),
  quantity: z.number().int(),
  reason: z.string().min(1, 'Reason is required').max(500),
})
