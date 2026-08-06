import { z } from 'zod';

export const createProductProfileSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(''),
  itemType: z.enum(['stock', 'service']).optional().default('stock'),
  unitOfMeasure: z.string().max(50).optional().default('pcs'),
  salesVatCodeId: z.number().int().positive().nullable().optional().default(null),
  purchaseVatCodeId: z.number().int().positive().nullable().optional().default(null),
  defaultWarehouseId: z.number().int().positive().nullable().optional().default(null),
  defaultSalesPrice: z.number().int().min(0).optional().default(0),
  defaultPurchasePrice: z.number().int().min(0).optional().default(0),
  reorderPoint: z.number().int().min(0).optional().default(0),
});
