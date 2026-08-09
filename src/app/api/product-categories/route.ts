import { NextRequest, NextResponse } from 'next/server'
import { productCategoryRepository } from '@/lib/repositories/productCategoryRepository'
import { handleApiError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'
import { requirePermission } from '@/lib/auth/middleware'
import { generateCategoryCode } from '@/lib/utils/idGenerator'

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || undefined
    const tree = searchParams.get('tree') === 'true'

    if (tree) {
      const treeData = productCategoryRepository.getTree()
      return NextResponse.json({ success: true, data: treeData })
    }

    const categories = productCategoryRepository.findAll(search)
    return NextResponse.json({ success: true, data: categories })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'product.create')
    if (auth instanceof NextResponse) return auth
    await ensureInitialized()
    const body = await request.json()

    if (!body.code?.trim() || !body.name?.trim()) {
      return NextResponse.json({ success: false, error: 'Code and name are required' }, { status: 400 })
    }

    // Check for duplicate code
    const existing = productCategoryRepository.findAll(body.code.trim())
    if (existing.length > 0) {
      return NextResponse.json({ success: false, error: 'Category code already exists' }, { status: 409 })
    }

    // Prevent cycles
    if (body.parentId) {
      if (productCategoryRepository.isAncestor(body.parentId, body.parentId)) {
        return NextResponse.json({ success: false, error: 'Cannot set a category as its own parent' }, { status: 400 })
      }
    }

    const id = productCategoryRepository.create({
      code: body.code.trim(),
      name: body.name.trim(),
      description: body.description || '',
      isActive: body.isActive !== false,
      parentId: body.parentId ?? null,
    })

    return NextResponse.json({ success: true, data: { id } }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
