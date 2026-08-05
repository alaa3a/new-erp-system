import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { partnerRepository } from '@/lib/repositories/partnerRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, NotFoundError, ConflictError, ValidationError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { validate, updatePartnerSchema } from '@/lib/validators'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const { id } = await params
    const partner = partnerRepository.findById(Number(id))
    if (!partner) throw new NotFoundError('Partner', id)
    return NextResponse.json({ success: true, data: partner })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    await ensureInitialized()
    const { id } = await params
    const body = validate(updatePartnerSchema, await request.json())
    const partnerId = Number(id)
    const existing = partnerRepository.findById(partnerId)
    if (!existing) throw new NotFoundError('Partner', id)

    const updated = partnerRepository.update(partnerId, {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.contactPerson !== undefined && { contactPerson: body.contactPerson }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.taxId !== undefined && { taxRegistrationNumber: body.taxId }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.city !== undefined && { city: body.city }),
      ...(body.country !== undefined && { country: body.country }),
      ...(body.creditLimit !== undefined && { creditLimit: body.creditLimit }),
      ...(body.paymentTermId !== undefined && { paymentTermId: body.paymentTermId }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.tags !== undefined && { tags: body.tags }),
    }, existing.version)
    if (!updated) throw new ConflictError('Partner was modified by another user. Please refresh.')
    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'partner', entityId: partnerId })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    await ensureInitialized()
    const { id } = await params
    const partnerId = Number(id)
    const existing = partnerRepository.findById(partnerId)
    if (!existing) throw new NotFoundError('Partner', id)
    partnerRepository.softDelete(partnerId, existing.version)
    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'partner', entityId: partnerId })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
