import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/middleware'
import { replaceDatabase } from '@/lib/db'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { ValidationError, handleApiError } from '@/lib/utils/errors'

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const auth = await requirePermission(request, 'settings.manage')
    if (auth instanceof NextResponse) return auth
    const contentLength = Number(request.headers.get('content-length'))
    if (contentLength && contentLength > MAX_UPLOAD_BYTES) {
      throw new ValidationError('Uploaded backup exceeds the 500 MB size limit')
    }
    const buffer = await request.arrayBuffer()
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new ValidationError('Uploaded backup exceeds the 500 MB size limit')
    }
    await replaceDatabase(new Uint8Array(buffer))
    try {
      auditLogRepository.log({
        userId: auth.userId,
        action: 'restore',
        entityType: 'account',
        entityId: 0,
        changes: { restored: true },
      })
    } catch (err) {
      console.error('Failed to write restore audit log:', err)
    }
    return NextResponse.json({ success: true, data: { restored: true } })
  } catch (error) {
    return handleApiError(error)
  }
}
