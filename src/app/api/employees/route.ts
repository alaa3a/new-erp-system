import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { employeeRepository } from '@/lib/repositories/employeeRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError, ValidationError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { validate, createEmployeeSchema } from '@/lib/validators';

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const all = searchParams.get('all') === '1';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)));

    if (searchParams.has('pageSize') || searchParams.has('page')) {
      const result = employeeRepository.paginate(page, pageSize, search);
      return NextResponse.json({ success: true, data: result.data, total: result.total, page, pageSize });
    }
    const data = employeeRepository.findAll(search, all);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const body = validate(createEmployeeSchema, await request.json());

    if (body.code && body.code.trim()) {
      const existing = employeeRepository.findByCode(body.code.trim());
      if (existing) throw new ValidationError(`Employee with code "${body.code.trim()}" already exists`);
    }

    const id = employeeRepository.create({
      code: body.code || '',
      name: body.name,
      jobTitle: body.jobTitle || '',
      department: body.department || '',
      email: body.email || '',
      phone: body.phone || '',
      isActive: body.isActive !== false,
    });
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'employee', entityId: id });
    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
