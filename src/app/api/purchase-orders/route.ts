import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { purchaseOrderRepository } from '@/lib/repositories/purchaseOrderRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { validate, createPurchaseOrderSchema } from '@/lib/validators';

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const paginated = purchaseOrderRepository.paginate(page, pageSize, status, search);
    const data = paginated.data.map(po => ({
      ...po,
      lines: purchaseOrderRepository.findLines(po.id),
    }));
    return NextResponse.json({ success: true, data, total: paginated.total, page, pageSize });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized();
    const body = await request.json();
    validate(createPurchaseOrderSchema, body);
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { businessPartnerId, partnerName, orderDate, expectedDate, warehouseId, referenceNumber, notes, lines } = body;

    const poId = purchaseOrderRepository.create({
      businessPartnerId, partnerName, orderDate, expectedDate,
      warehouseId, referenceNumber, notes,
      createdBy: 'system',
    });

    if (lines && Array.isArray(lines)) {
      let subtotal = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineTotal = line.quantity * line.unitPrice * (1 - (line.discountPercent || 0) / 100);

        purchaseOrderRepository.addLine({
          poId, lineNumber: i + 1,
          productId: line.productId,
          description: line.description || '',
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          receivedQuantity: 0, invoicedQuantity: 0,
          discountPercent: line.discountPercent || 0,
          lineTotal,
          lineType: line.lineType || 'stock',
          warehouseId: line.warehouseId ?? warehouseId ?? null,
          costCenterId: line.costCenterId || null,
          accountCode: line.accountCode || '',
        });

        subtotal += lineTotal;
      }

      purchaseOrderRepository.updateTotals(poId, subtotal, subtotal);
    }

    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'purchase_order', entityId: poId });
    const po = purchaseOrderRepository.findById(poId);
    const linesResult = purchaseOrderRepository.findLines(poId);
    return NextResponse.json({ success: true, data: { ...po, lines: linesResult } }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
