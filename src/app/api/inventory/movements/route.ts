import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { inventoryRepository } from '@/lib/repositories/inventoryRepository'
import { handleApiError } from '@/lib/utils/errors'
import { validate } from '@/lib/validators'
import { dateStringSchema } from '@/lib/validators/common'
import { ensureInitialized } from '@/lib/db'

const movementFilterSchema = z.object({
  productId: z.coerce.number().int().positive().optional(),
  warehouseId: z.coerce.number().int().positive().optional(),
  type: z.string().optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
})

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized()
    const { searchParams } = new URL(request.url)
    const params = Object.fromEntries(searchParams.entries())
    const { productId, warehouseId, type, startDate, endDate } = validate(movementFilterSchema, params)

    let movements = inventoryRepository.getMovements(productId, warehouseId)

    // Filter by movement type
    if (type) {
      movements = movements.filter((m: any) => m.type === type)
    }

    // Filter by date range
    if (startDate) {
      movements = movements.filter((m: any) => m.postedAt >= startDate)
    }
    if (endDate) {
      movements = movements.filter((m: any) => m.postedAt <= endDate + 'T23:59:59.999Z')
    }

    return NextResponse.json({ success: true, data: movements })
  } catch (error) {
    return handleApiError(error)
  }
}
