import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { partnerRepository } from '@/lib/repositories/partnerRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, ValidationError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { validate, createPartnerSchema } from '@/lib/validators'

export async function GET(request: Request) {
  try {
    await ensureInitialized()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || undefined
    const type = searchParams.get('type') || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)))
    const result = partnerRepository.paginate(page, pageSize, search, type)
    return NextResponse.json({ success: true, data: result.data, total: result.total, page, pageSize })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    await ensureInitialized()
    const body = validate(createPartnerSchema, await request.json())
    const id = partnerRepository.create({
      name: body.name,
      type: body.type,
      contactPerson: body.contactPerson || '',
      email: body.email,
      phone: body.phone,
      address: body.address,
      city: body.city,
      country: body.country,
      taxRegistrationNumber: body.taxId,
      defaultVatCodeId: null,
      paymentTermId: body.paymentTermId,
      creditLimit: body.creditLimit,
      status: body.status || 'active',
      tags: body.tags || [],
    })
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'partner', entityId: id })
    return NextResponse.json({ success: true, data: { id } }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
