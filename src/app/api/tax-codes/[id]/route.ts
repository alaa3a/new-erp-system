import { NextResponse } from 'next/server'
import { taxCodeRepository } from '@/lib/repositories/taxCodeRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, NotFoundError, ConflictError, ValidationError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { validate, updateTaxCodeSchema } from '@/lib/validators'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const { id } = await params
    const code = taxCodeRepository.findById(Number(id))
    if (!code) throw new NotFoundError('TaxCode', id)
    return NextResponse.json({ success: true, data: code })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const { id } = await params
    const body = validate(updateTaxCodeSchema, await request.json())
    const codeId = Number(id)
    const existing = taxCodeRepository.findById(codeId)
    if (!existing) throw new NotFoundError('TaxCode', id)

    // Sub-groups are not supported — a group must stay top-level (check the effective state,
    // since isGroup itself is updatable and could otherwise convert a type into a sub-group)
    const isGroup = body.isGroup !== undefined ? body.isGroup : existing.isGroup
    if (isGroup && body.parentId != null) {
      throw new ValidationError('Sub-groups are not supported. Tax groups must be top-level; add tax types under a group.')
    }

    if (body.parentId) {
      const parent = taxCodeRepository.findById(body.parentId)
      if (!parent || !parent.isGroup) throw new ValidationError('Parent must be a tax group')
    }

    // Rate is locked once a tax type is used (invoices, entries, products, partners)
    if (
      body.rate !== undefined &&
      body.rate !== existing.rate &&
      !existing.isGroup &&
      taxCodeRepository.isInUse(codeId)
    ) {
      throw new ValidationError('Rate cannot be changed because this tax type is in use. Create a new tax type with the new rate.')
    }

    const updated = taxCodeRepository.update(codeId, {
      ...(body.code !== undefined && { code: body.code }),
      ...(body.name !== undefined && { name: body.name }),
      ...(body.rate !== undefined && { rate: body.rate }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.parentId !== undefined && { parentId: body.parentId }),
      ...(body.accountCode !== undefined && { accountCode: body.accountCode }),
      ...(body.effectiveFrom !== undefined && { effectiveFrom: body.effectiveFrom }),
      ...(body.effectiveTo !== undefined && { effectiveTo: body.effectiveTo }),
      ...(body.isGroup !== undefined && { isGroup: body.isGroup }),
      ...(body.filingPeriod !== undefined && { filingPeriod: body.filingPeriod }),
      ...(body.detailsConfig !== undefined && { detailsConfig: isGroup ? [] : body.detailsConfig }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    }, existing.version)
    if (!updated) throw new ConflictError('Tax code was modified by another user. Please refresh.')
    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'tax_code', entityId: codeId })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const auth = await requireAuth(_request); if (auth instanceof NextResponse) return auth
    const { id } = await params
    const codeId = Number(id)
    const existing = taxCodeRepository.findById(codeId)
    if (!existing) throw new NotFoundError('TaxCode', id)
    if (existing.isSystemCode) throw new ValidationError('System tax codes cannot be deleted')
    if (taxCodeRepository.hasChildren(codeId)) throw new ValidationError('Tax code has children and cannot be deleted')
    if (taxCodeRepository.isInUse(codeId)) throw new ValidationError('Tax code is in use and cannot be deleted')
    const deleted = taxCodeRepository.softDelete(codeId, existing.version)
    if (!deleted) throw new ConflictError('Tax code was modified by another user. Please refresh.')
    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'tax_code', entityId: codeId })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
