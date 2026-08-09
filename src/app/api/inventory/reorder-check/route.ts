import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { inventoryService } from '@/lib/services/inventoryService'
import { handleApiError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized()
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const alerts = inventoryService.getReorderAlerts()
    return NextResponse.json({ success: true, data: alerts })
  } catch (error) {
    return handleApiError(error)
  }
}
