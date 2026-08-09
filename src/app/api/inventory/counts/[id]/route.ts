import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/middleware'
import { inventoryCountRepository } from '@/lib/repositories/inventoryCountRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, NotFoundError } from '@/lib/utils/errors'
import { validate } from '@/lib/validators'
import { ensureInitialized } from '@/lib/db'

const updateCountLineSchema = z.object({
  lines: z.array(z.object({
    id: z.number().int().positive(),
    countedQuantity: z.number().int().min(0),
  })),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized()
    const auth = await requirePermission(request, 'inventory.adjust')
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    const count = inventoryCountRepository.findById(Number(id))
    if (!count) throw new NotFoundError('InventoryCount', id)
    const lines = inventoryCountRepository.findLines(Number(id))
    return NextResponse.json({ success: true, data: { ...count, lines } })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized()
    const auth = await requirePermission(request, 'inventory.adjust')
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    const count = inventoryCountRepository.findById(Number(id))
    if (!count) throw new NotFoundError('InventoryCount', id)
    if (count.status !== 'draft') {
      return NextResponse.json({ success: false, error: 'Only draft counts can be edited' }, { status: 422 })
    }

    const body = validate(updateCountLineSchema, await request.json())
    for (const line of body.lines) {
      inventoryCountRepository.setCountedQuantity(line.id, line.countedQuantity)
    }

    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'inventory_count', entityId: Number(id) })
    const lines = inventoryCountRepository.findLines(Number(id))
    return NextResponse.json({ success: true, data: lines })
  } catch (error) {
    return handleApiError(error)
  }
}
