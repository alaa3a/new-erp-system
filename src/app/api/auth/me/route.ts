import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { ensureInitialized } from '@/lib/db'

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

    // Return user data without passwordHash
    const { passwordHash, ...safeUser } = user

    return NextResponse.json({ success: true, user: safeUser })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 },
    )
  }
}
