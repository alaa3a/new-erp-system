import { z } from 'zod'
import { entityCodeSchema, entityNameSchema, optionalString } from './common'

export const createWarehouseSchema = z.object({
  code: entityCodeSchema,
  name: entityNameSchema,
  location: z.string().max(200).optional().default(''),
  description: optionalString,
  isActive: z.boolean().optional().default(true),
})

export const updateWarehouseSchema = createWarehouseSchema.partial()
