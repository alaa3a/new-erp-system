import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/middleware'
import { inventoryService } from '@/lib/services/inventoryService'
import { inventoryRepository } from '@/lib/repositories/inventoryRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError } from '@/lib/utils/errors'
import { validate } from '@/lib/validators'
import { ensureInitialized, db } from '@/lib/db'
import { notificationRepository } from '@/lib/repositories/userRepository'

const stockAdjustmentSchema = z.object({
  productId: z.number().int().positive(),
  warehouseId: z.number().int().positive(),
  newQuantity: z.number().min(0),
  reason: z.string().optional().default('Stock Adjustment'),
  // Server-authoritative: the acting user is always taken from the session,
  // never from the request body (audit integrity).
})

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized()
    const body = validate(stockAdjustmentSchema, await request.json())
    const auth = await requirePermission(request, 'inventory.adjust')
    if (auth instanceof NextResponse) return auth
    const { productId, warehouseId, newQuantity, reason } = body

    // Task 42 — service items carry no stock and must be rejected outright.
    const productRow = db.prepare('SELECT itemType FROM product WHERE id = ?').get(productId) as any
    if (productRow?.itemType === 'service') {
      return NextResponse.json({ success: false, error: 'Cannot adjust stock for service item' }, { status: 422 })
    }

    // Get current stock before adjustment
    const current = inventoryRepository.getStock(productId, warehouseId)

    inventoryService.adjustStock(productId, warehouseId, newQuantity, String(auth.userId), reason)

    // Return the new state
    const updated = inventoryRepository.getStock(productId, warehouseId)

    // Create notifications for all active users
    const product = db.prepare('SELECT name, code FROM product WHERE id = ?').get(productId) as any
    const productName = product?.name || `Product #${productId}`
    const warehouseName = db.prepare('SELECT name FROM warehouse WHERE id = ?').get(warehouseId) as any
    const whName = warehouseName?.name || `Warehouse #${warehouseId}`
    const delta = newQuantity - (current?.quantity || 0)
    const direction = delta > 0 ? 'increased' : delta < 0 ? 'decreased' : 'unchanged'

    const allUsers = db.prepare('SELECT id FROM users WHERE isActive = 1').all() as { id: number }[]
    for (const user of allUsers) {
      notificationRepository.create({
        userId: user.id,
        type: delta > 0 ? 'success' : delta < 0 ? 'warning' : 'info',
        title: 'Stock Adjusted',
        message: `${productName} (${product?.code || ''}) ${direction} by ${Math.abs(delta)} units in ${whName}. ${reason ? `Reason: ${reason}` : ''}`,
        entityType: 'inventory',
        entityId: productId,
      })
    }

    auditLogRepository.log({ userId: auth.userId, action: 'adjust_stock', entityType: 'inventory', entityId: productId });

    return NextResponse.json({
      success: true,
      data: {
        message: 'Stock adjusted successfully',
        previous: current ? { quantity: current.quantity, averageCost: current.averageCost } : null,
        current: updated ? { quantity: updated.quantity, averageCost: updated.averageCost } : null,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
