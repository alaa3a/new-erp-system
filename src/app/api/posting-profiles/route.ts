import { NextResponse } from 'next/server'
import { postingProfileRepository } from '@/lib/repositories/postingProfileRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { validate, postingProfileSchema } from '@/lib/validators'
import { ensureProfileSequence, validateProfile } from '@/lib/services/postingProfileService'

export async function GET() {
  try {
    await ensureInitialized()
    const profiles = postingProfileRepository.findAll()
    return NextResponse.json({ success: true, data: profiles })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    await ensureInitialized()
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const body = await request.json()
    validate(postingProfileSchema, body)
    const warning = validateProfile(body)
    const id = postingProfileRepository.create(body)
    if (body.isDefault) postingProfileRepository.clearOtherDefaults(id, body.invoiceType)
    ensureProfileSequence(body.invoiceType)
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'posting_profile', entityId: id })
    return NextResponse.json({ success: true, data: { id }, ...(warning ? { warning } : {}) }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
