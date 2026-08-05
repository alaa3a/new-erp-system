import { NextRequest, NextResponse } from 'next/server'
import { entryCategoryRepository } from '@/lib/repositories/entryCategoryRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { validate, entryCategorySchema } from '@/lib/validators'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized()
    const { id } = await params
    const category = entryCategoryRepository.findById(Number(id))
    if (!category) {
      return NextResponse.json({ success: false, error: 'Entry category not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: category })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized()
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const { id } = await params
    const body = await request.json()
    validate(entryCategorySchema, body)
    const { code, name, description, isActive, version } = body

    if (!version) {
      return NextResponse.json({ success: false, error: 'Version is required for optimistic locking' }, { status: 400 })
    }

    const updated = entryCategoryRepository.update(Number(id), {
      code: code.trim(),
      name: name.trim(),
      description: description?.trim() || '',
      isActive,
    }, version)

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Update failed — record may have been modified' }, { status: 409 })
    }

    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'entry_category', entityId: Number(id) })
    const category = entryCategoryRepository.findById(Number(id))
    return NextResponse.json({ success: true, data: category })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized()
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const version = searchParams.get('version') ? Number(searchParams.get('version')) : undefined

    if (!version) {
      return NextResponse.json({ success: false, error: 'Version is required for optimistic locking' }, { status: 400 })
    }

    const deleted = entryCategoryRepository.softDelete(Number(id), version)
    if (deleted === 'in_use') {
      const inUse = entryCategoryRepository.entryCount(Number(id))
      return NextResponse.json({
        success: false,
        error: `Cannot delete — category is used by ${inUse} journal entr${inUse === 1 ? 'y' : 'ies'}. Reassign or delete those entries first.`,
      }, { status: 409 })
    }
    if (deleted === 'conflict') {
      return NextResponse.json({ success: false, error: 'Delete failed — record may have been modified' }, { status: 409 })
    }

    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'entry_category', entityId: Number(id) })
    return NextResponse.json({ success: true, message: 'Entry category deleted' })
  } catch (error) {
    return handleApiError(error)
  }
}
