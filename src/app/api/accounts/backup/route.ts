import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { ensureInitialized, getDbBytes } from '@/lib/db'
import { handleApiError } from '@/lib/utils/errors'

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    await ensureInitialized()
    const bytes = getDbBytes()
    const payload = new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength)
    const date = new Date().toISOString().slice(0, 10)
    return new Response(payload, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="erp-backup-${date}.sqlite"`,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
