import { z } from 'zod'
import { entityNameSchema, optionalString } from './common'

export const createEmployeeSchema = z.object({
  code: z.string().max(20).optional().default(''),
  name: entityNameSchema,
  jobTitle: optionalString,
  department: optionalString,
  email: z.string().email('Invalid email').max(120).optional().default(''),
  phone: z.string().max(40).optional().default(''),
  isActive: z.boolean().optional().default(true),
})

export const updateEmployeeSchema = createEmployeeSchema.partial()
