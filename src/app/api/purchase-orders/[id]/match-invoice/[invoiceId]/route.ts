import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { purchaseOrderService } from '@/lib/services/purchaseOrderService';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invoiceId: string }> },
) {
  try {
    await ensureInitialized();
    const { id, invoiceId } = await params;
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    purchaseOrderService.matchInvoice(Number(id), Number(invoiceId));
    auditLogRepository.log({
      userId: auth.userId, action: 'match_invoice',
      entityType: 'purchase_order', entityId: Number(id),
    });
    return NextResponse.json({ success: true, data: { message: 'Invoice matched to purchase order successfully' } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invoiceId: string }> },
) {
  try {
    await ensureInitialized();
    const { id, invoiceId } = await params;
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    purchaseOrderService.unlinkInvoice(Number(id), Number(invoiceId));
    auditLogRepository.log({
      userId: auth.userId, action: 'unlink_invoice',
      entityType: 'purchase_order', entityId: Number(id),
    });
    return NextResponse.json({ success: true, data: { message: 'Invoice unlinked from purchase order successfully' } });
  } catch (error) {
    return handleApiError(error);
  }
}
