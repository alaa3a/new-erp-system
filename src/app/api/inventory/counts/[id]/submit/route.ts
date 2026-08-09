import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/middleware'
import { inventoryService } from '@/lib/services/inventoryService'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized()
    const { id } = await params
    const auth = await requirePermission(request, 'inventory.adjust')
    if (auth instanceof NextResponse) return auth

    inventoryService.submitCount(Number(id), String(auth.userId))
    auditLogRepository.log({ userId: auth.userId, action: 'post', entityType: 'inventory_count', entityId: Number(id) })
    return NextResponse.json({ success: true, data: { message: 'Cycle count submitted — stock adjusted for all variances' } })
  } catch (error) {
    return handleApiError(error)
  }
}
