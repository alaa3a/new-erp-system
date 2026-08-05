import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { notificationRepository } from '@/lib/repositories/userRepository'
import { handleApiError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized()
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    notificationRepository.markRead(Number(id))
    return NextResponse.json({ success: true, message: 'Notification marked as read' })
  } catch (error) {
    return handleApiError(error)
  }
}
