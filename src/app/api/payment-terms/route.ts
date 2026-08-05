import { NextRequest, NextResponse } from 'next/server';
import { paymentTermRepository } from '@/lib/repositories/paymentTermRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { validate, paymentTermSchema } from '@/lib/validators';

export async function GET() {
  try {
    await ensureInitialized();
    const terms = paymentTermRepository.findAll();
    return NextResponse.json({ success: true, data: terms });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const body = await request.json();
    validate(paymentTermSchema, body);

    const id = paymentTermRepository.create(body);
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'payment_term', entityId: id });
    const term = paymentTermRepository.findById(id);
    return NextResponse.json({ success: true, data: term }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
