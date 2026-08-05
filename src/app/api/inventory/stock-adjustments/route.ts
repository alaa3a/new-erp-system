import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/middleware'
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
  userId: z.string().optional().default('system'),
})

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized()
    const body = validate(stockAdjustmentSchema, await request.json())
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const { productId, warehouseId, newQuantity, reason, userId } = body

    // Get current stock before adjustment
    const current = inventoryRepository.getStock(productId, warehouseId)

    inventoryService.adjustStock(productId, warehouseId, newQuantity, userId, reason)

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
