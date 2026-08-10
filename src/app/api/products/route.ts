import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { productRepository } from '@/lib/repositories/productRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, ValidationError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { validate, createProductSchema } from '@/lib/validators'

/** Parent must exist and be a group node — sellable items are always leaves. */
function assertValidParent(parentId: number | null | undefined): void {
  if (parentId == null) return
  const parent = productRepository.findById(parentId)
  if (!parent) throw new ValidationError(`Parent product #${parentId} does not exist`)
  if (!parent.isCategory) throw new ValidationError('Only product groups can have sub-items — "' + parent.name + '" is a sellable item')
}

export async function GET(request: Request) {
  try {
    await ensureInitialized()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || undefined
    const itemType = searchParams.get('itemType') || undefined

    // all=true returns every node (groups + items) flat, so the client can build
    // the tree. The default response stays sellable-only for pickers elsewhere.
    if (searchParams.get('all') === 'true') {
      const data = productRepository.findAllIncludingGroups(search, itemType)
      return NextResponse.json({ success: true, data, total: data.length })
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)))
    const parentIdParam = searchParams.get('parentId')
    const parentId = parentIdParam === 'null' ? null : (parentIdParam ? Number(parentIdParam) : undefined)

    const result = productRepository.paginate(page, pageSize, search, itemType, parentId)
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
    const body = validate(createProductSchema, await request.json())

    if (body.code?.trim()) {
      const existing = productRepository.findByCode(body.code.trim())
      if (existing) throw new ValidationError(`Product code "${body.code}" is already in use`)
    }
    assertValidParent(body.parentId)

    const id = productRepository.create({
      code: body.code,
      name: body.name,
      description: body.description,
      itemType: body.itemType,
      unitOfMeasure: body.unit,
      salesPrice: body.price,
      purchasePrice: body.cost,
      vatCodeId: body.taxCodeId,
      purchaseVatCodeId: body.purchaseVatCodeId ?? null,
      defaultWarehouseId: body.warehouseId,
      reorderPoint: body.minStock,
      isActive: body.isActive !== false,
      parentId: body.parentId ?? null,
      isCategory: body.isCategory === true,
      profileId: body.profileId ?? null,
    })
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'product', entityId: id })
    return NextResponse.json({ success: true, data: { id } }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
