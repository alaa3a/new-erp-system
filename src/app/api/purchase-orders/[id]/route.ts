import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { purchaseOrderRepository } from '@/lib/repositories/purchaseOrderRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { validate, updatePurchaseOrderSchema } from '@/lib/validators';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized();
    const { id } = await params;
    const po = purchaseOrderRepository.findById(Number(id));
    if (!po) {
      return NextResponse.json({ success: false, error: `Purchase order with id ${id} not found` }, { status: 404 });
    }
    const lines = purchaseOrderRepository.findLines(Number(id));
    const matching = purchaseOrderRepository.getMatchingStatus(Number(id));
    const receipts = purchaseOrderRepository.getReceiptsWithLines(Number(id));
    return NextResponse.json({ success: true, data: { ...po, lines, matching, receipts } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized();
    const { id } = await params;
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const po = purchaseOrderRepository.findById(Number(id));
    if (!po) {
      return NextResponse.json({ success: false, error: `Purchase order with id ${id} not found` }, { status: 404 });
    }
    if (po.status !== 'draft') {
      return NextResponse.json({ success: false, error: 'Only draft purchase orders can be updated' }, { status: 422 });
    }

    const body = await request.json();
    validate(updatePurchaseOrderSchema, body);
    const { businessPartnerId, partnerName, orderDate, expectedDate, warehouseId, referenceNumber, notes, lines } = body;

    const db = (await import('@/lib/db')).db;
    db.prepare(`
      UPDATE purchase_order SET
        businessPartnerId=?, partnerName=?, orderDate=?, expectedDate=?,
        warehouseId=?, referenceNumber=?, notes=?, updatedAt=?, version=version+1
      WHERE id=?
    `).run(
      businessPartnerId ?? po.businessPartnerId,
      partnerName ?? po.partnerName,
      orderDate ?? po.orderDate,
      expectedDate ?? po.expectedDate,
      warehouseId ?? po.warehouseId,
      referenceNumber ?? po.referenceNumber,
      notes ?? po.notes,
      new Date().toISOString(),
      Number(id),
    );

    if (lines && Array.isArray(lines)) {
      purchaseOrderRepository.deleteLines(Number(id));
      let subtotal = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineTotal = line.quantity * line.unitPrice * (1 - (line.discountPercent || 0) / 100);

        purchaseOrderRepository.addLine({
          poId: Number(id), lineNumber: i + 1,
          productId: line.productId, description: line.description || '',
          quantity: line.quantity, unitPrice: line.unitPrice,
          receivedQuantity: 0, invoicedQuantity: 0,
          discountPercent: line.discountPercent || 0,
          lineTotal, lineType: line.lineType || 'stock',
          warehouseId: line.warehouseId ?? warehouseId ?? null,
          costCenterId: line.costCenterId || null, accountCode: line.accountCode || '',
        });

        subtotal += lineTotal;
      }

      purchaseOrderRepository.updateTotals(Number(id), subtotal, subtotal);
    }

    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'purchase_order', entityId: Number(id) });
    const updated = purchaseOrderRepository.findById(Number(id));
    const updatedLines = purchaseOrderRepository.findLines(Number(id));
    return NextResponse.json({ success: true, data: { ...updated, lines: updatedLines } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized();
    const { id } = await params;
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const po = purchaseOrderRepository.findById(Number(id));
    if (!po) {
      return NextResponse.json({ success: false, error: `Purchase order with id ${id} not found` }, { status: 404 });
    }
    if (po.status !== 'draft') {
      return NextResponse.json({ success: false, error: 'Only draft purchase orders can be cancelled' }, { status: 422 });
    }

    purchaseOrderRepository.updateStatus(Number(id), 'cancelled');
    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'purchase_order', entityId: Number(id) });
    return NextResponse.json({ success: true, data: { message: 'Purchase order cancelled successfully' } });
  } catch (error) {
    return handleApiError(error);
  }
}
