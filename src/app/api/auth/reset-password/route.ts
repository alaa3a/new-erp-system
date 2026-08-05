import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { userRepository } from '@/lib/repositories/userRepository';
import { hashPassword } from '@/lib/auth/password';
import { NotFoundError, ValidationError, handleApiError } from '@/lib/utils/errors';
import { ensureInitialized, db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { email, newPassword } = body;

    if (!email || !newPassword) {
      throw new ValidationError('Email and new password are required');
    }

    if (newPassword.length < 6) {
      throw new ValidationError('Password must be at least 6 characters');
    }

    const user = userRepository.findByEmail(email);
    if (!user) throw new NotFoundError('User with email ' + email);

    const hashed = hashPassword(newPassword);
    db.prepare('UPDATE users SET passwordHash=? WHERE id=?').run(hashed, user.id);

    return NextResponse.json({ success: true, data: { message: 'Password reset successfully' } });
  } catch (error) {
    return handleApiError(error);
  }
}
