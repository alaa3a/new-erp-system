import { NextResponse } from 'next/server'
import { inventoryRepository } from '@/lib/repositories/inventoryRepository'
import { handleApiError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'

export async function GET() {
  try {
    await ensureInitialized()
    const stock = inventoryRepository.getStockAcrossWarehouses()
    return NextResponse.json({ success: true, data: stock })
  } catch (error) {
    return handleApiError(error)
  }
}
