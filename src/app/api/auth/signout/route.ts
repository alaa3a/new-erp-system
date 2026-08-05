import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth/session'
import { ensureInitialized } from '@/lib/db'

export async function POST() {
  try {
    await ensureInitialized()
    const cookie = clearSessionCookie()
    return NextResponse.json(
      { success: true, message: 'Signed out successfully' },
      {
        status: 200,
        headers: {
          'Set-Cookie': cookie,
        },
      },
    )
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'An error occurred during sign out' },
      { status: 500 },
    )
  }
}
