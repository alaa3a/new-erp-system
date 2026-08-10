import { z } from 'zod'
import { entityCodeSchema, entityNameSchema, optionalString } from './common'

export const createProductSchema = z.object({
  // Optional: the repository auto-generates the product code (generateProductCode)
  code: entityCodeSchema.optional(),
  name: entityNameSchema,
  description: optionalString,
  itemType: z.enum(['stock', 'service']).optional().default('stock'),
  unit: z.string().max(50).optional().default(''),
  price: z.number().int().min(0, 'Price must be non-negative').optional().default(0),
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
  salesAccountId: z.number().int().positive().nullable().optional().default(null),
  purchaseAccountId: z.number().int().positive().nullable().optional().default(null),
  inventoryAccountId: z.number().int().positive().nullable().optional().default(null),
  cogsAccountId: z.number().int().positive().nullable().optional().default(null),
  defaultCostCenterId: z.number().int().positive().nullable().optional().default(null),
})

export const updateProductSchema = z.object({
  code: entityCodeSchema.optional(),
  name: entityNameSchema.optional(),
  // plain optional — NOT optionalString (its .default('') would clobber the
  // current description on a partial PUT like toggle-active).
  description: z.string().max(2000).optional(),
  itemType: z.enum(['stock', 'service']).optional(),
  unit: z.string().max(50).optional(),
  price: z.number().int().min(0, 'Price must be non-negative').optional(),
  cost: z.number().int().min(0).optional(),
  category: z.string().max(100).optional(),
  taxCodeId: z.number().int().positive().nullable().optional(),
  purchaseVatCodeId: z.number().int().positive().nullable().optional(),
  warehouseId: z.number().int().positive().nullable().optional(),
  minStock: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  // NOTE: no `.default()` here — a partial PUT (e.g. toggle active) must NOT
  // inject `null` for omitted keys, or it would wipe parent/warehouse/profile.
  parentId: z.number().int().positive().nullable().optional(),
  isCategory: z.boolean().optional(),
  profileId: z.number().int().positive().nullable().optional(),
  salesAccountId: z.number().int().positive().nullable().optional(),
  purchaseAccountId: z.number().int().positive().nullable().optional(),
  inventoryAccountId: z.number().int().positive().nullable().optional(),
  cogsAccountId: z.number().int().positive().nullable().optional(),
  defaultCostCenterId: z.number().int().positive().nullable().optional(),
})

export const stockAdjustmentSchema = z.object({
  productId: z.number().int().positive(),
  warehouseId: z.number().int().positive(),
  quantity: z.number().int(),
  reason: z.string().min(1, 'Reason is required').max(500),
})
