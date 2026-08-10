import { NextResponse } from 'next/server'
import { statSync } from 'fs'
import { requireAuth } from '@/lib/auth/middleware'
import { ensureInitialized, getDbFilePath } from '@/lib/db'
import { handleApiError } from '@/lib/utils/errors'

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth
    await ensureInitialized()
    let sizeBytes = 0
    let lastModifiedAt: string | null = null
    try {
      const st = statSync(getDbFilePath())
      sizeBytes = st.size
      lastModifiedAt = new Date(st.mtime).toISOString()
    } catch {
      // DB file not yet persisted to disk — return zeros/null.
    }
    return NextResponse.json({ success: true, data: { sizeBytes, lastModifiedAt } })
  } catch (error) {
    return handleApiError(error)
  }
}
