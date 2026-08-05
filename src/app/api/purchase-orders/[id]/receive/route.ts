import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/middleware';
import { purchaseOrderService } from '@/lib/services/purchaseOrderService';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { validate, receivePurchaseOrderSchema } from '@/lib/validators';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized();
    const { id } = await params;
    const auth = await requirePermission(request, 'purchaseOrder.receive');
    if (auth instanceof NextResponse) return auth;
    const body = await request.json();
    validate(receivePurchaseOrderSchema, body);
    const { lines, warehouseId } = body;



    purchaseOrderService.receiveGoods(Number(id), lines, warehouseId, String(auth.userId));
    auditLogRepository.log({ userId: auth.userId, action: 'receive', entityType: 'purchase_order', entityId: Number(id) });
    return NextResponse.json({ success: true, data: { message: 'Goods received successfully' } });
  } catch (error) {
    return handleApiError(error);
  }
}
