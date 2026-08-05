import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { warehouseRepository } from '@/lib/repositories/warehouseRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, ValidationError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { validate, createWarehouseSchema } from '@/lib/validators'

export async function GET() {
  try {
    await ensureInitialized()
    const warehouses = warehouseRepository.findAll()
    return NextResponse.json({ success: true, data: warehouses })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    await ensureInitialized()
    const body = validate(createWarehouseSchema, await request.json())
    const id = warehouseRepository.create({
      code: body.code,
      name: body.name,
      address: body.location,
      manager: body.description,
      isActive: body.isActive !== false,
    })
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'warehouse', entityId: id })
    return NextResponse.json({ success: true, data: { id } }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
