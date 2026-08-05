import { NextRequest, NextResponse } from 'next/server'
import { userRepository } from '@/lib/repositories/userRepository'
import { verifyPassword } from '@/lib/auth/password'
import { createSessionCookie, setLastLogin } from '@/lib/auth/session'
import { ensureInitialized } from '@/lib/db'
import { validate, signInSchema } from '@/lib/validators'

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized()
    const { email, password } = validate(signInSchema, await request.json())

    const user = userRepository.findByEmail(email)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 },
      )
    }

    if (!user.isActive) {
      return NextResponse.json(
        { success: false, error: 'Account is deactivated. Contact an administrator.' },
        { status: 403 },
      )
    }

    const valid = verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 },
      )
    }

    // Update last login
    setLastLogin(user.id)

    // Create session cookie
    const cookie = createSessionCookie(user.id)

    // Return user data (without passwordHash)
    const { passwordHash, ...safeUser } = user

    return NextResponse.json(
      { success: true, user: safeUser },
      {
        status: 200,
        headers: {
          'Set-Cookie': cookie,
        },
      },
    )
  } catch (error) {
    console.error('Sign in error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred during sign in';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
