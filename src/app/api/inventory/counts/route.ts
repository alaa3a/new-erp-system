import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/middleware'
import { inventoryCountRepository } from '@/lib/repositories/inventoryCountRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError } from '@/lib/utils/errors'
import { validate } from '@/lib/validators'
import { ensureInitialized } from '@/lib/db'

const createCountSchema = z.object({
  warehouseId: z.number().int().positive(),
  notes: z.string().optional().default(''),
})

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized()
    const auth = await requirePermission(request, 'inventory.adjust')
    if (auth instanceof NextResponse) return auth
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined
    const counts = inventoryCountRepository.findAll(status)
    return NextResponse.json({ success: true, data: counts })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized()
    const body = validate(createCountSchema, await request.json())
    const auth = await requirePermission(request, 'inventory.adjust')
    if (auth instanceof NextResponse) return auth
    const { warehouseId, notes } = body

    const countId = inventoryCountRepository.create({ warehouseId, countedBy: auth.userId, notes })
    inventoryCountRepository.addLinesForWarehouse(countId, warehouseId)
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'inventory_count', entityId: countId })

    const count = inventoryCountRepository.findById(countId)
    const lines = inventoryCountRepository.findLines(countId)
    return NextResponse.json({ success: true, data: { ...count, lines } }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
