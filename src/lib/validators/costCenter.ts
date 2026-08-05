import { z } from 'zod'
import { entityCodeSchema, entityNameSchema, optionalString } from './common'

export const createCostCenterSchema = z.object({
  code: entityCodeSchema,
  name: entityNameSchema,
  parentId: z.number().int().positive().nullable().optional().default(null),
  responsiblePerson: z.string().max(200).optional().default(''),
  description: optionalString,
})

export const updateCostCenterSchema = createCostCenterSchema.partial()
