import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { productRepository } from '@/lib/repositories/productRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { validate, createProductSchema } from '@/lib/validators'

export async function GET(request: Request) {
  try {
    await ensureInitialized()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || undefined
    const itemType = searchParams.get('itemType') || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)))
    const parentIdParam = searchParams.get('parentId')
    const parentId = parentIdParam === 'null' ? null : (parentIdParam ? Number(parentIdParam) : undefined)
    const categoriesOnly = searchParams.get('category') === 'true'
    const tree = searchParams.get('tree') === 'true'

    if (tree) {
      const treeData = productRepository.getTree()
      return NextResponse.json({ success: true, data: treeData })
    }

    const result = productRepository.paginate(page, pageSize, search, itemType, parentId, categoriesOnly)
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

    // Validate parent exists
    if (body.parentId) {
      const parent = productRepository.findById(body.parentId)
      if (!parent) {
        return NextResponse.json({ success: false, error: 'Parent product not found' }, { status: 404 })
      }
    }

    const id = productRepository.create({
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
      isCategory: body.isCategory ?? false,
      profileId: body.profileId ?? null,
    })
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'product', entityId: id })
    return NextResponse.json({ success: true, data: { id } }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
