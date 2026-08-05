import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { productRepository } from '@/lib/repositories/productRepository'
import { inventoryRepository } from '@/lib/repositories/inventoryRepository'
import { handleApiError, NotFoundError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(_request)
    if (auth instanceof NextResponse) return auth
    await ensureInitialized()
    const { id } = await params
    const productId = Number(id)
    const product = productRepository.findById(productId)
    if (!product) throw new NotFoundError('Product', id)
    const stock = inventoryRepository.getAllStock(productId)
    return NextResponse.json({ success: true, data: stock })
  } catch (error) {
    return handleApiError(error)
  }
}
