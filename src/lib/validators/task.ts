import { z } from 'zod'
import { optionalString } from './common'

export const taskStatusSchema = z.enum(['todo', 'in_progress', 'done', 'cancelled'])
export const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').max(200),
  description: optionalString,
  status: taskStatusSchema.optional().default('todo'),
  priority: taskPrioritySchema.optional().default('medium'),
  assignedTo: z.coerce.number().int().positive().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').nullable().optional(),
})

export const updateTaskSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').max(200).optional(),
  description: z.string().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assignedTo: z.coerce.number().int().positive().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').nullable().optional(),
})
