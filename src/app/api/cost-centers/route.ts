import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { costCenterRepository } from '@/lib/repositories/costCenterRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, ValidationError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { validate, createCostCenterSchema } from '@/lib/validators'

export async function GET() {
  try {
    await ensureInitialized()
    const costCenters = costCenterRepository.findAll()
    return NextResponse.json({ success: true, data: costCenters })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    await ensureInitialized()
    const body = validate(createCostCenterSchema, await request.json())
    const id = costCenterRepository.create({
      code: body.code,
      name: body.name,
      parentId: body.parentId,
      isActive: true,
      responsiblePerson: body.responsiblePerson,
      description: body.description,
    })
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'cost_center', entityId: id })
    return NextResponse.json({ success: true, data: { id } }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
