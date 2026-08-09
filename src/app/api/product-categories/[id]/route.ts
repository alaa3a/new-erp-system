import { NextRequest, NextResponse } from 'next/server'
import { productCategoryRepository } from '@/lib/repositories/productCategoryRepository'
import { handleApiError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { requirePermission } from '@/lib/auth/middleware'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const { id } = await params
    const category = productCategoryRepository.findById(Number(id))
    if (!category) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: category })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission(request, 'product.update')
    if (auth instanceof NextResponse) return auth
    await ensureInitialized()
    const { id } = await params
    const body = await request.json()
    const categoryId = Number(id)

    const existing = productCategoryRepository.findById(categoryId)
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 })
    }

    // Prevent cycles
    if (body.parentId && body.parentId !== existing.parentId) {
      if (productCategoryRepository.isAncestor(categoryId, body.parentId)) {
        return NextResponse.json({ success: false, error: 'Cannot set a category as its own ancestor' }, { status: 400 })
      }
    }

    const success = productCategoryRepository.update(categoryId, {
      code: body.code,
      name: body.name,
      description: body.description,
      isActive: body.isActive,
      parentId: body.parentId,
    })

    if (!success) {
      return NextResponse.json({ success: false, error: 'Category has been modified by another user. Please refresh.' }, { status: 409 })
    }

    return NextResponse.json({ success: true, data: { id: categoryId } })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission(request, 'product.delete')
    if (auth instanceof NextResponse) return auth
    await ensureInitialized()
    const { id } = await params
    const categoryId = Number(id)

    const existing = productCategoryRepository.findById(categoryId)
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 })
    }

    // Check if category has children
    const childCount = productCategoryRepository.getChildCount(categoryId)
    if (childCount > 0) {
      return NextResponse.json({ success: false, error: 'Cannot delete a category with sub-categories. Move or delete them first.' }, { status: 400 })
    }

    // Check if category has products
    const productCount = productCategoryRepository.getProductCount(categoryId)
    if (productCount > 0) {
      return NextResponse.json({ success: false, error: 'Cannot delete a category with products. Reassign them first.' }, { status: 400 })
    }

    const success = productCategoryRepository.softDelete(categoryId)
    if (!success) {
      return NextResponse.json({ success: false, error: 'Category has been modified by another user. Please refresh.' }, { status: 409 })
    }

    return NextResponse.json({ success: true, data: { id: categoryId } })
  } catch (error) {
    return handleApiError(error)
  }
}
