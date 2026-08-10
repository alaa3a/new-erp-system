import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/middleware'
import { replaceDatabase } from '@/lib/db'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError } from '@/lib/utils/errors'

export async function POST(request: Request) {
  try {
    const auth = await requirePermission(request, 'settings.manage')
    if (auth instanceof NextResponse) return auth
    const buffer = await request.arrayBuffer()
    await replaceDatabase(new Uint8Array(buffer))
    auditLogRepository.log({
      userId: auth.userId,
      action: 'restore',
      entityType: 'account',
      entityId: 0,
      changes: { restored: true },
    })
    return NextResponse.json({ success: true, data: { restored: true } })
  } catch (error) {
    return handleApiError(error)
  }
}
