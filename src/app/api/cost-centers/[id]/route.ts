import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { costCenterRepository } from '@/lib/repositories/costCenterRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, NotFoundError, ConflictError, ValidationError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { validate, updateCostCenterSchema } from '@/lib/validators'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const { id } = await params
    const costCenter = costCenterRepository.findById(Number(id))
    if (!costCenter) throw new NotFoundError('CostCenter', id)
    return NextResponse.json({ success: true, data: costCenter })
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
    const body = validate(updateCostCenterSchema, await request.json())
    const ccId = Number(id)

    const existing = costCenterRepository.findById(ccId)
    if (!existing) throw new NotFoundError('CostCenter', id)

    // Prevent circular reference
    if (body.parentId && Number(body.parentId) === ccId) {
      throw new ValidationError('A cost center cannot be its own parent')
    }
    if (body.parentId) {
      const parent = costCenterRepository.findById(Number(body.parentId))
      if (!parent) throw new NotFoundError('CostCenter', String(body.parentId))
    }

    const updated = costCenterRepository.update(ccId, {
      code: body.code || existing.code,
      name: body.name || existing.name,
      parentId: body.parentId !== undefined ? body.parentId : existing.parentId,
      isActive: existing.isActive,
      responsiblePerson: body.responsiblePerson !== undefined ? body.responsiblePerson : existing.responsiblePerson,
      description: body.description !== undefined ? body.description : existing.description,
    }, existing.version)

    if (!updated) throw new ConflictError('Cost center was modified by another user. Please refresh.')
    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'cost_center', entityId: ccId })
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
    const ccId = Number(id)
    const { searchParams } = new URL(request.url)
    const version = searchParams.get('version') ? Number(searchParams.get('version')) : undefined

    const existing = costCenterRepository.findById(ccId)
    if (!existing) throw new NotFoundError('CostCenter', id)

    if (costCenterRepository.hasChildren(ccId)) {
      return NextResponse.json({ success: false, error: 'Cannot delete: cost center has child cost centers' }, { status: 422 })
    }
    if (costCenterRepository.isUsedInEntries(ccId)) {
      return NextResponse.json({ success: false, error: 'Cannot delete: cost center is used in journal entries' }, { status: 422 })
    }
    if (costCenterRepository.isUsedInInvoiceLines(ccId)) {
      return NextResponse.json({ success: false, error: 'Cannot delete: cost center is referenced in invoices' }, { status: 422 })
    }
    if (costCenterRepository.isUsedInAccounts(ccId)) {
      return NextResponse.json({ success: false, error: 'Cannot delete: cost center is linked to accounts' }, { status: 422 })
    }
    if (costCenterRepository.isUsedInPurchaseOrderLines(ccId)) {
      return NextResponse.json({ success: false, error: 'Cannot delete: cost center is used in purchase order lines' }, { status: 422 })
    }

    const deleted = costCenterRepository.hardDelete(ccId, version || existing.version)
    if (!deleted) throw new ConflictError('Cost center was modified by another user. Please refresh.')
    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'cost_center', entityId: ccId })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}