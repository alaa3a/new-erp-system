import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { ensureInitialized } from '@/lib/db'
import { getUserPermissions } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized()
    const user = getCurrentUser(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 },
      )
    }

    // Return user data without passwordHash, include permission keys
    const { passwordHash, ...safeUser } = user
    void passwordHash

    return NextResponse.json({
      success: true,
      user: {
        ...safeUser,
        permissions: getUserPermissions(user),
      },
    })
  } catch {
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 },
    )
  }
}
