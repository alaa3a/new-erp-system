import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/middleware'
import { inventoryService } from '@/lib/services/inventoryService'
import { inventoryRepository } from '@/lib/repositories/inventoryRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError } from '@/lib/utils/errors'
import { validate } from '@/lib/validators'
import { ensureInitialized } from '@/lib/db'

const transferSchema = z.object({
  productId: z.number().int().positive(),
  fromWarehouseId: z.number().int().positive(),
  toWarehouseId: z.number().int().positive(),
  quantity: z.number().int().positive('Quantity must be positive'),
  reason: z.string().optional().default(''),
})

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized()
    const body = validate(transferSchema, await request.json())
    const auth = await requirePermission(request, 'inventory.adjust')
    if (auth instanceof NextResponse) return auth
    const { productId, fromWarehouseId, toWarehouseId, quantity, reason } = body

    inventoryService.transferStock(productId, fromWarehouseId, toWarehouseId, quantity, String(auth.userId))

    const source = inventoryRepository.getStock(productId, fromWarehouseId)
    const dest = inventoryRepository.getStock(productId, toWarehouseId)
    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'inventory', entityId: productId })

    return NextResponse.json({
      success: true,
      data: {
        message: reason ? `Stock transferred: ${reason}` : 'Stock transferred successfully',
        source: source ? { quantity: source.quantity, available: source.available } : null,
        destination: dest ? { quantity: dest.quantity, available: dest.available } : null,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
