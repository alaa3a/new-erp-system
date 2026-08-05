import { NextRequest, NextResponse } from 'next/server'
import { entryCategoryRepository } from '@/lib/repositories/entryCategoryRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { validate, entryCategorySchema } from '@/lib/validators'

export async function GET() {
  try {
    await ensureInitialized()
    const categories = entryCategoryRepository.findAll()
    const usage = entryCategoryRepository.entryCountMap()
    return NextResponse.json({ success: true, data: categories, usage })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized()
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const body = await request.json()
    validate(entryCategorySchema, body)
    const { code, name, description } = body

    const id = entryCategoryRepository.create({
      code: code.trim(),
      name: name.trim(),
      description: description?.trim() || '',
      isActive: body.isActive !== false,
    })

    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'entry_category', entityId: id })
    const created = entryCategoryRepository.findById(id)
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
