import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { accountRepository } from '@/lib/repositories/accountRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, ValidationError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { validate, createAccountSchema } from '@/lib/validators'

export async function GET() {
  try {
    await ensureInitialized()
    const accounts = accountRepository.findHierarchy()
    const usage = accountRepository.getUsageMap()
    return NextResponse.json({ success: true, data: accounts, usage })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    await ensureInitialized()
    const body = validate(createAccountSchema, await request.json())
    const existing = accountRepository.findByCode(body.code)
    if (existing) {
      throw new ValidationError(`Account with code "${body.code}" already exists`)
    }
    const id = accountRepository.create({
      code: body.code,
      name: body.name,
      type: body.type,
      parentId: body.parentId,
      costCenterId: null,
      linkType: body.linkType,
      linkId: body.linkId,
      linkPartnerFilter: body.linkPartnerFilter,
      isActive: true,
      isSystemAccount: false,
      description: body.description,
    })
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'account', entityId: id })
    return NextResponse.json({ success: true, data: { id } }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
