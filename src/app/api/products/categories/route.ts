import { NextResponse } from 'next/server'
import { ProductCategoryRepository } from '@/lib/repositories/productCategoryRepository'
import { handleApiError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'

const productCategoryRepository = new ProductCategoryRepository()

export async function GET() {
  try {
    await ensureInitialized()
    const categories = await productCategoryRepository.findAll()
    return NextResponse.json({ success: true, data: categories })
  } catch (error) {
    return handleApiError(error)
  }
}
