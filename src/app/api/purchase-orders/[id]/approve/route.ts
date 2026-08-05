import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/middleware';
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
    const auth = await requirePermission(request, 'purchaseOrder.approve');
    if (auth instanceof NextResponse) return auth;
    purchaseOrderService.approvePO(Number(id), String(auth.userId));
    auditLogRepository.log({ userId: auth.userId, action: 'approve', entityType: 'purchase_order', entityId: Number(id) });
    return NextResponse.json({ success: true, data: { message: 'Purchase order approved successfully' } });
  } catch (error) {
    return handleApiError(error);
  }
}
