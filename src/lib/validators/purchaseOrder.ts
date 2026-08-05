import { z } from 'zod'
import { moneySchema, optionalString, dateStringSchema } from './common'

const poLineSchema = z.object({
  description: z.string().min(1, 'Line description is required').max(500),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unitPrice: moneySchema,
  taxRate: z.number().min(0).max(100).optional().default(0),
  accountCode: z.string().max(50).optional().default(''),
  productId: z.number().int().positive().nullable().optional().default(null),
  warehouseId: z.number().int().positive().nullable().optional().default(null),
})

export const createPurchaseOrderSchema = z.object({
  orderDate: dateStringSchema,
  expectedDate: dateStringSchema.optional(),
  businessPartnerId: z.number().int().positive('Partner is required'),
  partnerName: z.string().max(200).optional().default(''),
  notes: optionalString,
  lines: z.array(poLineSchema).min(1, 'At least one line is required'),
})

export const updatePurchaseOrderSchema = createPurchaseOrderSchema.partial()

const receiveLineSchema = z.object({
  poLineId: z.number().int().positive(),
  productId: z.number().int().positive().nullable().optional(),
  description: z.string().optional().default(''),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unitCost: z.number().min(0, 'Unit cost must be non-negative'),
})

export const receivePurchaseOrderSchema = z.object({
  lines: z.array(receiveLineSchema).min(1, 'At least one receipt line is required'),
  warehouseId: z.number().int().positive('Warehouse is required'),
})
