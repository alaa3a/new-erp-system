import { NextResponse } from 'next/server'
import { postingProfileRepository } from '@/lib/repositories/postingProfileRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, NotFoundError, ConflictError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { validate, postingProfileSchema } from '@/lib/validators'
import { ensureProfileSequence, validateProfile } from '@/lib/services/postingProfileService'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const { id } = await params
    const profile = postingProfileRepository.findById(Number(id))
    if (!profile) throw new NotFoundError('PostingProfile', id)
    return NextResponse.json({ success: true, data: profile })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const { id } = await params
    const raw = await request.json()
    const body = validate(postingProfileSchema, raw)
    const profileId = Number(id)
    const existing = postingProfileRepository.findById(profileId)
    if (!existing) throw new NotFoundError('PostingProfile', id)

    // Only apply the fields the client actually sent — the schema's `.default('')`
    // would otherwise turn a partial PUT into a wipe + a false required-field error.
    const patch: Record<string, unknown> = {}
    const bodyRecord = body as Record<string, unknown>
    for (const key of Object.keys(body)) {
      if (key !== 'version' && raw[key] !== undefined) patch[key] = bodyRecord[key]
    }
    const warning = validateProfile({
      invoiceType: raw.invoiceType !== undefined ? body.invoiceType : existing.invoiceType,
      accountsReceivableCode: raw.accountsReceivableCode !== undefined ? body.accountsReceivableCode : existing.accountsReceivableCode,
      accountsPayableCode: raw.accountsPayableCode !== undefined ? body.accountsPayableCode : existing.accountsPayableCode,
      cashAccountCode: raw.cashAccountCode !== undefined ? body.cashAccountCode : existing.cashAccountCode,
    })
    const updated = postingProfileRepository.update(profileId, patch, existing.version)
    if (!updated) throw new ConflictError('Posting profile was modified by another user. Please refresh.')
    const isDefault = raw.isDefault !== undefined ? body.isDefault : existing.isDefault
    if (isDefault) postingProfileRepository.clearOtherDefaults(profileId, body.invoiceType || existing.invoiceType)
    ensureProfileSequence(body.invoiceType || existing.invoiceType)
    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'posting_profile', entityId: profileId })
    return NextResponse.json({ success: true, ...(warning ? { warning } : {}) })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const auth = await requireAuth(_request); if (auth instanceof NextResponse) return auth
    const { id } = await params
    const profileId = Number(id)
    const existing = postingProfileRepository.findById(profileId)
    if (!existing) throw new NotFoundError('PostingProfile', id)
    postingProfileRepository.softDelete(profileId, existing.version)
    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'posting_profile', entityId: profileId })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
