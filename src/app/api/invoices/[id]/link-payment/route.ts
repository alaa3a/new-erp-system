import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { invoiceService } from '@/lib/services/invoiceService';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { validate, linkPaymentSchema } from '@/lib/validators';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized();
    const { id } = await params;
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json();
    validate(linkPaymentSchema, body);
    const { amount } = body;

    invoiceService.applyPaymentAllocation(Number(id), amount);
    auditLogRepository.log({ userId: auth.userId, action: 'link_payment', entityType: 'invoice', entityId: Number(id) });
    return NextResponse.json({ success: true, data: { message: 'Payment linked successfully' } });
  } catch (error) {
    return handleApiError(error);
  }
}
