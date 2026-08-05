import { NextRequest, NextResponse } from 'next/server';
import { paymentTermRepository } from '@/lib/repositories/paymentTermRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { NotFoundError, handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { validate, paymentTermSchema } from '@/lib/validators';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const { id } = await params;
    const termId = parseInt(id, 10);
    const existing = paymentTermRepository.findById(termId);
    if (!existing) throw new NotFoundError('PaymentTerm', termId);

    const body = await request.json();
    validate(paymentTermSchema, body);
    const success = paymentTermRepository.update(termId, body, body.version || existing.version);
    if (!success) {
      return NextResponse.json({ success: false, error: 'Conflict: record was modified by another user' }, { status: 409 });
    }

    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'payment_term', entityId: termId });
    const updated = paymentTermRepository.findById(termId);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const { id } = await params;
    const termId = parseInt(id, 10);
    const existing = paymentTermRepository.findById(termId);
    if (!existing) throw new NotFoundError('PaymentTerm', termId);

    paymentTermRepository.softDelete(termId, existing.version);
    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'payment_term', entityId: termId });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
