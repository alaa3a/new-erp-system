import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/middleware';
import { invoiceService } from '@/lib/services/invoiceService';
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
    const auth = await requirePermission(request, 'invoice.approve');
    if (auth instanceof NextResponse) return auth;
    invoiceService.approveInvoice(Number(id), String(auth.userId));
    auditLogRepository.log({ userId: auth.userId, action: 'approve', entityType: 'invoice', entityId: Number(id) });
    return NextResponse.json({ success: true, data: { message: 'Invoice approved successfully' } });
  } catch (error) {
    return handleApiError(error);
  }
}
