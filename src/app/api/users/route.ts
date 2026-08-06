import { NextRequest, NextResponse } from 'next/server';
import { userRepository } from '@/lib/repositories/userRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { hashPassword, isValidEmail, validatePasswordStrength } from '@/lib/auth/password';
import { handleApiError, ValidationError, ConflictError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { validate, createUserSchema } from '@/lib/validators';

export async function GET() {
  try {
    await ensureInitialized();
    const users = userRepository.findAll();
    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const body = validate(createUserSchema, await request.json());

    if (!isValidEmail(body.email)) {
      throw new ValidationError('Invalid email format');
    }

    const strength = validatePasswordStrength(body.password);
    if (!strength.valid) {
      throw new ValidationError(strength.errors.join('; '));
    }

    const existing = userRepository.findByEmail(body.email);
    if (existing) {
      throw new ConflictError(`User with email "${body.email}" already exists`);
    }

    const passwordHash = hashPassword(body.password);
    const id = userRepository.create({
      email: body.email,
      passwordHash,
      firstName: body.firstName,
      lastName: body.lastName,
      permissionIds: body.permissionIds,
      isActive: body.isActive,
      status: body.status,
      forcePasswordChange: body.forcePasswordChange,
    });

    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'user', entityId: id });
    const user = userRepository.findById(id);
    return NextResponse.json({ success: true, data: user }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
