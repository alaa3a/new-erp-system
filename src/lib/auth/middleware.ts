import { getCurrentUser } from './session'
import { ensureInitialized } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function requireAuth(request: Request): Promise<{ userId: number } | NextResponse> {
  // Auth reads the users table, so the DB must be loaded first. In the dev
  // server each route module has its own db state, so callers cannot rely on
  // a previous request having initialized it.
  await ensureInitialized()
  const user = getCurrentUser(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
  }
  return { userId: user.id }
}
