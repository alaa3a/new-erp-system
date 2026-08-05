import { z } from 'zod'
import { entityNameSchema, optionalString } from './common'

export const createUserSchema = z.object({
  // Optional: users are identified by email + firstName/lastName
  name: entityNameSchema.optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['admin', 'user', 'viewer']).optional().default('user'),
  isActive: z.boolean().optional().default(true),
  permissionIds: z.array(z.number()).optional().default([]),
})

export const updateUserSchema = createUserSchema.partial().extend({
  currentPassword: z.string().optional(),
  action: z.enum(['updatePermissions', 'toggleActive']).optional(),
})
