import { NextRequest, NextResponse } from 'next/server';
import { userRepository } from '@/lib/repositories/userRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { NotFoundError, ValidationError, ConflictError, UnauthorizedError, handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { validate, updateUserSchema } from '@/lib/validators';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const { id } = await params;
    const userId = parseInt(id, 10);
    const user = userRepository.findById(userId);
    if (!user) throw new NotFoundError('User', userId);
    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const { id } = await params;
    const userId = parseInt(id, 10);
    const existing = userRepository.findById(userId);
    if (!existing) throw new NotFoundError('User', userId);

    const body = validate(updateUserSchema, await request.json());

    // If currentPassword is provided, verify it for sensitive changes (password change)
    if (body.currentPassword && body.password) {
      if (!verifyPassword(body.currentPassword, existing.passwordHash)) {
        throw new UnauthorizedError('Current password is incorrect');
      }
    }

    // Verify currentPassword when email is also being changed
    if (body.currentPassword && body.email && body.email !== existing.email) {
      if (!verifyPassword(body.currentPassword, existing.passwordHash)) {
        throw new UnauthorizedError('Current password is incorrect');
      }
    }

    // Handle permission update
    if (body.action === 'updatePermissions') {
      userRepository.updatePermissions(userId, body.permissionIds || []);
      auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'user', entityId: userId });
      const updated = userRepository.findById(userId);
      return NextResponse.json({ success: true, data: updated });
    }

    // Handle toggle active
    if (body.action === 'toggleActive') {
      const success = userRepository.update(userId, {
        ...existing,
        isActive: body.isActive !== false,
      }, existing.version);
      if (!success) throw new ConflictError('User was modified by another user. Please refresh.');
      auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'user', entityId: userId });
      const updated = userRepository.findById(userId);
      return NextResponse.json({ success: true, data: updated });
    }

    // Normal update
    const updateData: any = {
      firstName: body.firstName || existing.firstName,
      lastName: body.lastName || existing.lastName,
      isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
      permissionIds: body.permissionIds || existing.permissionIds,
    };

    if (body.email && body.email !== existing.email) {
      const emailExists = userRepository.findByEmail(body.email);
      if (emailExists) throw new ConflictError(`Email "${body.email}" is already in use`);
      updateData.email = body.email;
    }

    if (body.password) {
      updateData.passwordHash = hashPassword(body.password);
    }

    const success = userRepository.update(userId, updateData, existing.version);
    if (!success) throw new ConflictError('User was modified by another user. Please refresh.');

    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'user', entityId: userId });
    const updated = userRepository.findById(userId);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(_request); if (auth instanceof NextResponse) return auth
    const { id } = await params;
    const userId = parseInt(id, 10);
    const existing = userRepository.findById(userId);
    if (!existing) throw new NotFoundError('User', userId);

    const deleted = userRepository.softDelete(userId, existing.version);
    if (!deleted) throw new ConflictError('User was modified by another user. Please refresh.');
    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'user', entityId: userId });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
