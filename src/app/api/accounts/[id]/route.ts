import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { accountRepository } from '@/lib/repositories/accountRepository'
import { costCenterRepository } from '@/lib/repositories/costCenterRepository'
import { partnerRepository } from '@/lib/repositories/partnerRepository'
import { employeeRepository } from '@/lib/repositories/employeeRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, NotFoundError, ValidationError, ConflictError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { validate, updateAccountSchema } from '@/lib/validators'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const { id } = await params
    const account = accountRepository.findById(Number(id))
    if (!account) throw new NotFoundError('Account', id)
    return NextResponse.json({ success: true, data: account })
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
    const body = validate(updateAccountSchema, await request.json())
    const accountId = Number(id)
    const existing = accountRepository.findById(accountId)
    if (!existing) throw new NotFoundError('Account', id)

    // Handle toggle active with cascade
    if (body.action === 'toggleActive') {
      const active = body.isActive === true
      const updated = accountRepository.toggleActive(accountId, active, existing.version)
      if (!updated) throw new ConflictError('Account was modified by another user. Please refresh.')
      if (body.cascade) {
        accountRepository.cascadeToggleActive(accountId, active)
      }
      auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'account', entityId: accountId, changes: { isActive: { from: !active, to: active } } })
      return NextResponse.json({ success: true })
    }

    // Handle link cost center
    if (body.action === 'linkCostCenter') {
      const updated = accountRepository.linkCostCenter(accountId, body.costCenterId ?? null, existing.version)
      if (!updated) throw new ConflictError('Account was modified by another user. Please refresh.')
      // Cascade the same cost center to all descendants (all levels)
      if (body.cascade) {
        const affectedSubAccounts = accountRepository.cascadeLinkCostCenter(accountId, body.costCenterId ?? null)
        if (affectedSubAccounts > 0) {
          auditLogRepository.log({
            userId: auth.userId,
            action: 'update',
            entityType: 'account',
            entityId: accountId,
            changes: {
              cascadeScope: { from: 'current_account_only', to: 'all_sub_accounts' },
              affectedSubAccounts: { from: 0, to: affectedSubAccounts },
              costCenterId: { from: existing.costCenterId, to: body.costCenterId ?? null },
            },
          })
        }
      }
      auditLogRepository.log({
        userId: auth.userId,
        action: 'update',
        entityType: 'account',
        entityId: accountId,
        changes: {
          costCenterId: { from: existing.costCenterId, to: body.costCenterId ?? null },
          linkType: { from: existing.linkType || null, to: body.costCenterId ? 'cost_center' : null },
          linkId: { from: existing.linkId || null, to: body.costCenterId ?? null },
        },
      })
      return NextResponse.json({ success: true })
    }

    // Handle dynamic link (Phase 1): cost_center | partner | employee
    if (body.action === 'link') {
      const linkType = body.linkType ?? null
      const linkId = body.linkId ?? null
      const linkPartnerFilter = body.linkPartnerFilter ?? null

      // Validate the target entity exists — the polymorphic link has no FK enforcement.
      // Partner links are dimension-level: only the type filter (customer / vendor / both)
      // is required; employee links are dimension-level with no specific employee. A
      // legacy linkId is still validated when provided.
      if (linkType) {
        if (linkType === 'cost_center') {
          if (!linkId) throw new ValidationError('Select a cost center to link')
          const cc = costCenterRepository.findById(linkId)
          if (!cc) throw new ValidationError(`Cost center #${linkId} does not exist`)
        } else if (linkType === 'partner') {
          if (!linkPartnerFilter) throw new ValidationError('Partner type (customers / vendors / both) is required for partner links')
          if (linkId) {
            const partner = partnerRepository.findById(linkId)
            if (!partner || partner.status !== 'active') throw new ValidationError(`Partner #${linkId} does not exist or is inactive`)
          }
        } else if (linkType === 'employee') {
          if (linkId) {
            const employee = employeeRepository.findById(linkId)
            if (!employee || !employee.isActive) throw new ValidationError(`Employee #${linkId} does not exist or is inactive`)
          }
        }
      }

      const updated = accountRepository.linkAccount(accountId, { type: linkType, linkId, partnerFilter: linkPartnerFilter }, existing.version)
      if (!updated) throw new ConflictError('Account was modified by another user. Please refresh.')

      let affectedSubAccounts = 0
      if (body.cascade) {
        affectedSubAccounts = accountRepository.cascadeLink(accountId, { type: linkType, linkId, partnerFilter: linkPartnerFilter })
      }
      auditLogRepository.log({
        userId: auth.userId,
        action: 'update',
        entityType: 'account',
        entityId: accountId,
        changes: {
          linkType: { from: existing.linkType || null, to: linkType },
          linkId: { from: existing.linkId || null, to: linkId },
          linkPartnerFilter: { from: existing.linkPartnerFilter || null, to: linkPartnerFilter },
          ...(affectedSubAccounts > 0 ? { affectedSubAccounts: { from: 0, to: affectedSubAccounts } } : {}),
        },
      })
      return NextResponse.json({ success: true })
    }

    // Normal update
    if (body.code && body.code !== existing.code) {
      const codeExists = accountRepository.findByCode(body.code)
      if (codeExists && codeExists.id !== accountId) {
        throw new ValidationError(`Account with code "${body.code}" already exists`)
      }
    }
    const updated = accountRepository.update(accountId, {
      code: body.code || existing.code,
      name: body.name || existing.name,
      type: body.type || existing.type,
      parentId: body.parentId !== undefined ? body.parentId : existing.parentId,
      isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
      description: body.description !== undefined ? body.description : existing.description,
    }, existing.version)
    if (!updated) throw new ConflictError('Account was modified by another user. Please refresh.')
    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'account', entityId: accountId })
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
    const accountId = Number(id)
    const existing = accountRepository.findById(accountId)
    if (!existing) throw new NotFoundError('Account', id)
    if (existing.isSystemAccount) throw new ValidationError('Cannot delete a system account')
    if (accountRepository.hasChildren(accountId)) throw new ValidationError('Remove all child accounts first')
    if (accountRepository.isUsedInEntries(existing.code)) throw new ValidationError('Account has posted transactions')
    if (accountRepository.isUsedInInvoiceLines(existing.code)) throw new ValidationError('Account is referenced in invoices')
    if (accountRepository.isUsedInPostingProfiles(existing.code)) throw new ValidationError('Account is used in posting profiles')
    const deleted = accountRepository.hardDelete(accountId, existing.version)
    if (!deleted) throw new ConflictError('Account was modified by another user. Please refresh.')
    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'account', entityId: accountId })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
