import { z } from 'zod'
import { ValidationError } from '@/lib/utils/errors'

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const fields: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const path = issue.path.join('.')
      if (!fields[path]) fields[path] = issue.message
    }
    throw new ValidationError('Validation failed', fields)
  }
  return result.data
}
