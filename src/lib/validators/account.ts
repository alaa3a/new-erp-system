import { z } from 'zod'
import { entityCodeSchema, entityNameSchema, optionalString } from './common'

export const accountTypeEnum = z.enum(['asset', 'liability', 'equity', 'revenue', 'expense'])
export const accountLinkTypeEnum = z.enum(['cost_center', 'partner', 'employee'])
export const accountPartnerFilterEnum = z.enum(['customer', 'vendor', 'both'])

export const createAccountSchema = z.object({
  code: entityCodeSchema,
  name: entityNameSchema,
  type: accountTypeEnum,
  parentId: z.number().int().positive().nullable().optional().default(null),
  linkType: accountLinkTypeEnum.nullable().optional().default(null),
  linkId: z.number().int().positive().nullable().optional().default(null),
  linkPartnerFilter: accountPartnerFilterEnum.nullable().optional().default(null),
  description: optionalString,
})

export const updateAccountSchema = createAccountSchema.partial().extend({
  action: z.enum(['toggleActive', 'linkCostCenter', 'link']).optional(),
  isActive: z.boolean().optional(),
  cascade: z.boolean().optional(),
  costCenterId: z.number().int().positive().nullable().optional(),
})
