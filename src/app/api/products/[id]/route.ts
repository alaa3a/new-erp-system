import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { productRepository } from '@/lib/repositories/productRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, NotFoundError, ConflictError, ValidationError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { validate, updateProductSchema } from '@/lib/validators'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const { id } = await params
    const product = productRepository.findById(Number(id))
    if (!product) throw new NotFoundError('Product', id)
    return NextResponse.json({ success: true, data: product })
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
    const body = validate(updateProductSchema, await request.json())
    const productId = Number(id)
    const existing = productRepository.findById(productId)
    if (!existing) throw new NotFoundError('Product', id)

    // Parent rules: must be a group, must not be self, must not create a cycle.
    if (body.parentId !== undefined && body.parentId !== existing.parentId) {
      if (body.parentId === productId) throw new ValidationError('A product cannot be its own parent')
      if (body.parentId != null) {
        const parent = productRepository.findById(body.parentId)
        if (!parent) throw new ValidationError(`Parent product #${body.parentId} does not exist`)
        if (!parent.isCategory) throw new ValidationError('Only product groups can have sub-items — "' + parent.name + '" is a sellable item')
        if (productRepository.isAncestor(productId, body.parentId)) {
          throw new ValidationError('Cannot move a product under one of its own sub-items (would create a loop)')
        }
      }
    }

    // Node type rules: a group that still contains sub-items cannot be
    // converted into a sellable item (only groups can be parents).
    if (body.isCategory === false && existing.isCategory) {
      const childCount = productRepository.getChildCount(productId)
      if (childCount > 0) {
        throw new ValidationError(`Cannot convert group "${existing.name}" to a sellable item: it contains ${childCount} sub-item${childCount > 1 ? 's' : ''}. Move or delete them first.`)
      }
    }

    // Code uniqueness (ignoring self)
    if (body.code?.trim() && body.code.trim() !== existing.code) {
      const dup = productRepository.findByCode(body.code.trim())
      if (dup && dup.id !== productId) throw new ValidationError(`Product code "${body.code}" is already in use`)
    }

    const updated = productRepository.update(productId, {
      ...(body.code !== undefined && { code: body.code }),
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.itemType !== undefined && { itemType: body.itemType }),
      ...(body.unit !== undefined && { unitOfMeasure: body.unit }),
      ...(body.price !== undefined && { salesPrice: body.price }),
      ...(body.cost !== undefined && { purchasePrice: body.cost }),
      ...(body.taxCodeId !== undefined && { vatCodeId: body.taxCodeId }),
      ...(body.purchaseVatCodeId !== undefined && { purchaseVatCodeId: body.purchaseVatCodeId }),
      ...(body.warehouseId !== undefined && { defaultWarehouseId: body.warehouseId }),
      ...(body.minStock !== undefined && { reorderPoint: body.minStock }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.parentId !== undefined && { parentId: body.parentId }),
      ...(body.isCategory !== undefined && { isCategory: body.isCategory }),
      ...(body.profileId !== undefined && { profileId: body.profileId }),
    }, existing.version)
    if (!updated) throw new ConflictError('Product was modified by another user. Please refresh.')
    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'product', entityId: productId })
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
    const productId = Number(id)
    const existing = productRepository.findById(productId)
    if (!existing) throw new NotFoundError('Product', id)

    // Groups cannot be deleted while they still contain sub-items.
    if (existing.isCategory) {
      const childCount = productRepository.getChildCount(productId)
      if (childCount > 0) {
        return NextResponse.json({
          success: false,
          error: `Cannot delete group "${existing.name}": it contains ${childCount} sub-item${childCount > 1 ? 's' : ''}. Move or delete them first.`,
        }, { status: 422 })
      }
    }

    // Task 37 — delete validation: block when stock exists or the product is
    // referenced by invoices / purchase orders.
    const { totalQuantity, warehouseCount } = productRepository.getStockSummary(productId)
    if (totalQuantity > 0) {
      return NextResponse.json({ success: false, error: `Cannot delete product: ${totalQuantity} units in stock across ${warehouseCount} warehouses` }, { status: 422 })
    }
    if (productRepository.isReferencedByInvoice(productId)) {
      return NextResponse.json({ success: false, error: 'Cannot delete product: it is referenced by invoices' }, { status: 422 })
    }
    if (productRepository.isReferencedByPurchaseOrder(productId)) {
      return NextResponse.json({ success: false, error: 'Cannot delete product: it is referenced by purchase orders' }, { status: 422 })
    }

    productRepository.softDelete(productId, existing.version)
    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'product', entityId: productId })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
