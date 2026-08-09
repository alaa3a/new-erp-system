import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { companyRepository } from '@/lib/repositories/companyRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { validate, companySchema } from '@/lib/validators';

export async function GET() {
  try {
    await ensureInitialized();
    const company = companyRepository.get();
    return Response.json({ success: true, data: company });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const body = validate(companySchema, await request.json());
    const existing = companyRepository.get();

    if (existing) {
      companyRepository.update({ ...existing, ...body, id: existing.id });
      const updated = companyRepository.get();
      return Response.json({ success: true, data: updated });
    } else {
      companyRepository.create(body);
      const created = companyRepository.get();
      return Response.json({ success: true, data: created }, { status: 201 });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
