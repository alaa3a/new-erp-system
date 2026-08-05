import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { userRepository } from '@/lib/repositories/userRepository';
import { NotFoundError, ValidationError, handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    const userId = parseInt(id, 10);

    const user = userRepository.findById(userId);
    if (!user) throw new NotFoundError('User', userId);

    const body = await request.json();
    if (!Array.isArray(body.permissionIds)) {
      throw new ValidationError('permissionIds must be an array');
    }

    userRepository.updatePermissions(userId, body.permissionIds);
    const updated = userRepository.findById(userId);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
