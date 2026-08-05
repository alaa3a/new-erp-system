import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { purchaseOrderService } from '@/lib/services/purchaseOrderService';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized();
    const { id } = await params;
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    purchaseOrderService.closePO(Number(id), 'system');
    auditLogRepository.log({ userId: auth.userId, action: 'close', entityType: 'purchase_order', entityId: Number(id) });
    return NextResponse.json({ success: true, data: { message: 'Purchase order closed successfully' } });
  } catch (error) {
    return handleApiError(error);
  }
}
