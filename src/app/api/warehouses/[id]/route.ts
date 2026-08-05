import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { warehouseRepository } from '@/lib/repositories/warehouseRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, NotFoundError, ConflictError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { validate, updateWarehouseSchema } from '@/lib/validators'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const { id } = await params
    const warehouse = warehouseRepository.findById(Number(id))
    if (!warehouse) throw new NotFoundError('Warehouse', id)
    return NextResponse.json({ success: true, data: warehouse })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    await ensureInitialized()
    const { id } = await params
    const body = validate(updateWarehouseSchema, await request.json())
    const whId = Number(id)
    const existing = warehouseRepository.findById(whId)
    if (!existing) throw new NotFoundError('Warehouse', id)
    const updated = warehouseRepository.update(whId, {
      ...(body.code !== undefined && { code: body.code }),
      ...(body.name !== undefined && { name: body.name }),
      ...(body.location !== undefined && { address: body.location }),
      ...(body.description !== undefined && { manager: body.description }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    }, existing.version)
    if (!updated) throw new ConflictError('Warehouse was modified. Please refresh.')
    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'warehouse', entityId: whId })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    await ensureInitialized()
    const { id } = await params
    const whId = Number(id)
    const existing = warehouseRepository.findById(whId)
    if (!existing) throw new NotFoundError('Warehouse', id)
    warehouseRepository.softDelete(whId, existing.version)
    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'warehouse', entityId: whId })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
