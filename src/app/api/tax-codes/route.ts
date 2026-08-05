import { NextResponse } from 'next/server'
import { taxCodeRepository } from '@/lib/repositories/taxCodeRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, ValidationError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { validate, createTaxCodeSchema } from '@/lib/validators'

export async function GET() {
  try {
    await ensureInitialized()
    const codes = taxCodeRepository.findAll().map(c => ({ ...c, inUse: taxCodeRepository.isInUse(c.id) }))
    return NextResponse.json({ success: true, data: codes })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    await ensureInitialized()
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const body = validate(createTaxCodeSchema, await request.json())
    if (body.isGroup) {
      // Sub-groups are not supported — groups must be top-level
      if (body.parentId) throw new ValidationError('Sub-groups are not supported. Tax groups must be top-level; add tax types under a group.')
    } else {
      if (!body.parentId) throw new ValidationError('Tax types must belong to a tax group')
      const parent = taxCodeRepository.findById(body.parentId)
      if (!parent || !parent.isGroup) throw new ValidationError('Parent must be a tax group')
    }
    const now = new Date().toISOString()
    const id = taxCodeRepository.create({
      code: body.code,
      name: body.name,
      rate: body.isGroup ? 0 : body.rate,
      type: body.isGroup ? 'output' : body.type,
      parentId: body.parentId,
      accountCode: body.isGroup ? '' : body.accountCode,
      isActive: body.isActive !== false,
      isSystemCode: false,
      effectiveFrom: body.effectiveFrom || now,
      effectiveTo: body.effectiveTo ?? null,
      isGroup: body.isGroup,
      filingPeriod: body.filingPeriod || 'monthly',
      detailsConfig: body.isGroup ? [] : (body.detailsConfig || []),
    })
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'tax_code', entityId: id })
    return NextResponse.json({ success: true, data: { id } }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
