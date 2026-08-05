import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { partnerRepository } from '@/lib/repositories/partnerRepository'
import { agingService } from '@/lib/services/agingService'
import { handleApiError, NotFoundError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(_request)
    if (auth instanceof NextResponse) return auth
    await ensureInitialized()
    const { id } = await params
    const partnerId = Number(id)
    const partner = partnerRepository.findById(partnerId)
    if (!partner) throw new NotFoundError('Partner', id)
    const aging = agingService.calculatePartnerAging(partnerId)
    return NextResponse.json({ success: true, data: aging })
  } catch (error) {
    return handleApiError(error)
  }
}
