import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { notificationRepository } from '@/lib/repositories/userRepository'
import { handleApiError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized()
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const userId = auth.userId

    const notifications = notificationRepository.findByUser(userId)
    const unreadCount = notificationRepository.getUnreadCount(userId)

    return NextResponse.json({ success: true, data: { notifications, unreadCount } })
  } catch (error) {
    return handleApiError(error)
  }
}
