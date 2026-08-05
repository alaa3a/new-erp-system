import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { productRepository } from '@/lib/repositories/productRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, NotFoundError, ConflictError } from '@/lib/utils/errors'
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

    const updated = productRepository.update(productId, {
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
    productRepository.softDelete(productId, existing.version)
    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'product', entityId: productId })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
