import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/middleware';
import { invoiceRepository } from '@/lib/repositories/invoiceRepository';
import { purchaseOrderRepository } from '@/lib/repositories/purchaseOrderRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError, NotFoundError, BusinessRuleError } from '@/lib/utils/errors';
import { validate } from '@/lib/validators';
import { ensureInitialized, db } from '@/lib/db';
import { calculateLineTotal, calculateVatAmount } from '@/lib/formatters/money';

const fromPoSchema = z.object({
  purchaseOrderId: z.number().int().positive(),
})

/**
 * Task 47 — three-way matching: create a purchase invoice from a received PO.
 * Lines are pre-filled from the received quantities (only stock lines with
 * receivedQuantity > 0 and not fully invoiced are included).
 */
export async function POST(request: NextRequest) {
  try {
    await ensureInitialized();
    const body = validate(fromPoSchema, await request.json());
    const auth = await requirePermission(request, 'invoice.create');
    if (auth instanceof NextResponse) return auth;
    const { purchaseOrderId } = body;

    const po = purchaseOrderRepository.findById(purchaseOrderId);
    if (!po) throw new NotFoundError('PurchaseOrder', purchaseOrderId);
    if (po.status !== 'fully_received' && po.status !== 'partially_received') {
      throw new BusinessRuleError('Only received purchase orders can create invoices');
    }

    const poLines = purchaseOrderRepository.findLines(purchaseOrderId);
    const linesToInvoice = poLines.filter(l =>
      l.receivedQuantity > 0 && l.invoicedQuantity < l.receivedQuantity,
    );
    if (linesToInvoice.length === 0) {
      throw new BusinessRuleError('Nothing left to invoice — all received lines are fully invoiced');
    }

    const transaction = db.transaction(() => {
      const invoiceId = invoiceRepository.create({
        type: 'purchase',
        businessPartnerId: po.businessPartnerId || undefined,
        partnerName: po.partnerName,
        invoiceDate: new Date().toISOString().split('T')[0],
        dueDate: new Date().toISOString().split('T')[0],
        warehouseId: po.warehouseId || undefined,
        referenceNumber: po.poNumber,
        notes: `Invoice from PO ${po.poNumber}`,
        createdBy: String(auth.userId),
      });

      let subtotal = 0;
      let vatAmount = 0;

      for (let i = 0; i < linesToInvoice.length; i++) {
        const pl = linesToInvoice[i];
        const quantity = pl.receivedQuantity - pl.invoicedQuantity;
        const lineTotal = calculateLineTotal(quantity, pl.unitPrice, pl.discountPercent || 0);
        const lineVat = calculateVatAmount(lineTotal, pl.vatRate || 0);

        invoiceRepository.addLine({
          invoiceId,
          lineNumber: i + 1,
          productId: pl.productId,
          description: pl.description,
          quantity,
          unitPrice: pl.unitPrice,
          discountPercent: pl.discountPercent || 0,
          vatCodeId: pl.vatCodeId || null,
          vatRate: pl.vatRate || 0,
          vatAmount: lineVat,
          lineTotal,
          warehouseId: pl.warehouseId || po.warehouseId || null,
          costCenterId: pl.costCenterId || null,
          accountCode: pl.accountCode || '',
          lineType: pl.lineType || 'stock',
        });

        subtotal += lineTotal;
        vatAmount += lineVat;
        purchaseOrderRepository.updatePOInvoicedQuantity(pl.id, pl.receivedQuantity);
      }

      invoiceRepository.updateTotals(invoiceId, subtotal, vatAmount, subtotal + vatAmount);
      db.prepare('UPDATE invoice SET purchaseOrderId = ? WHERE id = ?').run(purchaseOrderId, invoiceId);
      return invoiceId;
    });

    const invoiceId = transaction();
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'invoice', entityId: invoiceId });
    const invoice = invoiceRepository.findById(invoiceId);
    return NextResponse.json({ success: true, data: { ...invoice, lines: invoiceRepository.findLines(invoiceId) } }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
