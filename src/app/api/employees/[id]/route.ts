import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { employeeRepository } from '@/lib/repositories/employeeRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError, NotFoundError, ConflictError, ValidationError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { validate, updateEmployeeSchema } from '@/lib/validators';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const { id } = await params;
    const employee = employeeRepository.findById(Number(id));
    if (!employee) throw new NotFoundError('Employee', id);
    return NextResponse.json({ success: true, data: employee });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    const employeeId = Number(id);
    const existing = employeeRepository.findById(employeeId);
    if (!existing) throw new NotFoundError('Employee', id);
    const body = validate(updateEmployeeSchema, await request.json());

    if (body.code !== undefined && body.code.trim() && body.code.trim() !== existing.code) {
      const dup = employeeRepository.findByCode(body.code.trim());
      if (dup) throw new ValidationError(`Employee with code "${body.code.trim()}" already exists`);
    }

    const updated = employeeRepository.update(employeeId, {
      ...(body.code !== undefined && { code: body.code.trim() }),
      ...(body.name !== undefined && { name: body.name }),
      ...(body.jobTitle !== undefined && { jobTitle: body.jobTitle || '' }),
      ...(body.department !== undefined && { department: body.department || '' }),
      ...(body.email !== undefined && { email: body.email || '' }),
      ...(body.phone !== undefined && { phone: body.phone || '' }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    }, existing.version);
    if (!updated) throw new ConflictError('Employee was modified by another user. Please refresh.');
    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'employee', entityId: employeeId });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    const employeeId = Number(id);
    const existing = employeeRepository.findById(employeeId);
    if (!existing) throw new NotFoundError('Employee', id);
    const deleted = employeeRepository.softDelete(employeeId, existing.version);
    if (!deleted) throw new ConflictError('Employee was modified by another user. Please refresh.');
    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'employee', entityId: employeeId });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
