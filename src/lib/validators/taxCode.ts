import { z } from 'zod'
import { entityNameSchema, optionalString } from './common'

const detailFieldSchema = z.object({
  key: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  inputType: z.enum(['text', 'date', 'number']),
})

const base = z.object({
  code: z.string('Code is required').min(1).max(20),
  name: entityNameSchema,
  isGroup: z.boolean().optional().default(false),
  filingPeriod: z.enum(['monthly', 'quarterly', 'annually']).optional().default('monthly'),
  rate: z.number().min(0).max(100, 'Rate must be 0-100').optional().default(0),
  type: z.enum(['output', 'input']).optional().default('output'),
  parentId: z.number().int().positive().nullable().optional().default(null),
  accountCode: z.string().max(50).optional().default(''),
  description: optionalString,
  effectiveFrom: z.string().max(20).optional().default(''),
  effectiveTo: z.string().max(20).nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
  /** Dynamic detail-field definitions (Phase 4) — only meaningful for tax types (not groups). */
  detailsConfig: z.array(detailFieldSchema).max(10).optional().default([]),
})

/** Keys must be unique within a single detailsConfig (zod v4: superRefine must come after .partial()). */
function checkUniqueDetailKeys(data: { detailsConfig?: { key: string }[] }, ctx: z.RefinementCtx): void {
  const config = data.detailsConfig
  if (config && config.length > 0) {
    const keys = config.map(d => d.key)
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: 'custom', path: ['detailsConfig'], message: 'Detail field keys must be unique' })
    }
  }
}

export const createTaxCodeSchema = base.superRefine((data, ctx) => {
  checkUniqueDetailKeys(data, ctx)
  if (data.isGroup) {
    // Sub-groups are not supported — groups must be top-level
    if (data.parentId != null) {
      ctx.addIssue({ code: 'custom', path: ['parentId'], message: 'Sub-groups are not supported. Tax groups must be top-level; add tax types under a group.' })
    }
    return
  }
  // Tax type rules
  if (data.rate === undefined) {
    ctx.addIssue({ code: 'custom', path: ['rate'], message: 'Rate is required for tax types' })
  }
  if (data.type === undefined) {
    ctx.addIssue({ code: 'custom', path: ['type'], message: 'Type is required for tax types' })
  }
  if (data.accountCode === '' || data.accountCode === undefined) {
    ctx.addIssue({ code: 'custom', path: ['accountCode'], message: 'Posting account is required for tax types' })
  }
  if (data.parentId === null || data.parentId === undefined) {
    ctx.addIssue({ code: 'custom', path: ['parentId'], message: 'Tax types must belong to a tax group' })
  }
})

export const updateTaxCodeSchema = base.partial().superRefine((data, ctx) => {
  checkUniqueDetailKeys(data, ctx)
})
