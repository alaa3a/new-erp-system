import { z } from 'zod'

export const idSchema = z.coerce.number().int().positive('ID must be a positive integer')

export const moneySchema = z.number().int().min(0, 'Amount must be non-negative')

export const optionalString = z.string().optional().default('')

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format')

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
})

export const entityNameSchema = z.string('Name is required').min(1, 'Name cannot be empty').max(200)

export const entityCodeSchema = z.string('Code is required').min(1, 'Code cannot be empty').max(50)
