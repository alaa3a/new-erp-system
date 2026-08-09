import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/middleware';
import { invoiceRepository } from '@/lib/repositories/invoiceRepository';
import { inventoryRepository } from '@/lib/repositories/inventoryRepository';
import { inventoryService } from '@/lib/services/inventoryService';
import { notificationRepository } from '@/lib/repositories/userRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError, NotFoundError, BusinessRuleError } from '@/lib/utils/errors';
import { validate } from '@/lib/validators';
import { ensureInitialized, db } from '@/lib/db';

const returnSchema = z.object({
  lines: z.array(z.object({
    lineId: z.number().int().positive(),
    quantity: z.number().int().min(1, 'Return quantity must be at least 1'),
  })).min(1, 'At least one line is required'),
  reason: z.string().optional().default(''),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized();
    const { id } = await params;
    const auth = await requirePermission(request, 'invoice.create');
    if (auth instanceof NextResponse) return auth;
    const body = validate(returnSchema, await request.json());
    const { lines, reason } = body;

    const invoice = invoiceRepository.findById(Number(id));
    if (!invoice) throw new NotFoundError('Invoice', id);
    if (invoice.status !== 'posted' && invoice.status !== 'partial_paid' && invoice.status !== 'paid') {
      throw new BusinessRuleError('Only posted invoices can be returned');
    }

    const transaction = db.transaction(() => {
      const invoiceLines = invoiceRepository.findLines(Number(id));
      const returnedQtyByLine: Record<number, number> = {};

      // Validate return quantities against the invoiced quantities
      for (const r of lines) {
        const line = invoiceLines.find(l => l.id === r.lineId);
        if (!line) throw new NotFoundError('InvoiceLine', r.lineId);
        // Sum up quantities already returned for THIS line across linked
        // credit notes — match product + description so multi-line invoices
        // with the same product are tracked per line, not over-blocked.
        const alreadyReturned = (db.prepare(`
          SELECT COALESCE(SUM(il.quantity), 0) AS qty
          FROM invoice il
          JOIN invoice_line il2 ON il2.invoiceId = il.id
          WHERE il.linkedInvoiceId = ? AND il2.productId = ? AND il2.description = ? AND il.status != 'cancelled'
        `).get(Number(id), line.productId, line.description) as any)?.qty ?? 0;
        if (r.quantity > line.quantity - alreadyReturned) {
          throw new BusinessRuleError(`Return quantity (${r.quantity}) exceeds the remaining invoiced quantity (${line.quantity - alreadyReturned}) for ${line.description}`);
        }
        returnedQtyByLine[r.lineId] = r.quantity;
      }

      // Create the credit note invoice
      const isSalesReturn = invoice.type === 'sales' || invoice.type === 'debit_note';
      const creditNoteId = invoiceRepository.create({
        type: isSalesReturn ? 'credit_note' : 'debit_note',
        businessPartnerId: invoice.businessPartnerId || undefined,
        partnerName: invoice.partnerName,
        postingProfileId: invoice.postingProfileId || undefined,
        invoiceDate: new Date().toISOString().split('T')[0],
        dueDate: new Date().toISOString().split('T')[0],
        warehouseId: invoice.warehouseId || undefined,
        referenceNumber: invoice.invoiceNumber,
        notes: reason ? `Return from ${invoice.invoiceNumber}: ${reason}` : `Return from ${invoice.invoiceNumber}`,
        createdBy: String(auth.userId),
      });

      // Link the credit note back to the original invoice
      db.prepare('UPDATE invoice SET linkedInvoiceId = ? WHERE id = ?').run(Number(id), creditNoteId);

      let subtotal = 0;
      let vatAmount = 0;
      let lineNum = 1;

      for (const r of lines) {
        const line = invoiceLines.find(l => l.id === r.lineId)!;
        const qty = r.quantity;
        const lineTotal = Math.round(line.lineTotal / line.quantity * qty);
        const lineVat = Math.round((line.vatAmount || 0) / line.quantity * qty);

        invoiceRepository.addLine({
          invoiceId: creditNoteId,
          lineNumber: lineNum++,
          productId: line.productId,
          description: `RETURN: ${line.description}`,
          quantity: qty,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          vatCodeId: line.vatCodeId,
          vatRate: line.vatRate,
          vatAmount: lineVat,
          lineTotal,
          warehouseId: line.warehouseId,
          costCenterId: line.costCenterId,
          accountCode: line.accountCode,
          lineType: line.lineType,
        });
        subtotal += lineTotal;
        vatAmount += lineVat;

        // Reverse stock movement: a sales/debit return puts units back into the
        // warehouse (receipt); a purchase/credit return removes units (issue).
        if (line.lineType !== 'service' && line.warehouseId) {
          const reversalQty = isSalesReturn ? qty : -qty;
          inventoryRepository.upsertStock(line.productId, line.warehouseId, reversalQty, line.unitPrice);
          inventoryRepository.recordMovement({
            type: 'return', productId: line.productId, warehouseId: line.warehouseId,
            quantity: reversalQty, unitCost: line.unitPrice,
            referenceType: 'invoice', referenceId: creditNoteId,
            referenceNumber: `RETURN-${invoice.invoiceNumber}`, postedBy: String(auth.userId),
          });
        }
      }

      invoiceRepository.updateTotals(creditNoteId, subtotal, vatAmount, subtotal + vatAmount);
      inventoryService.checkReorderPoints();

      // Notify admins
      const allUsers = db.prepare('SELECT id FROM users WHERE isActive = 1').all() as { id: number }[];
      for (const user of allUsers) {
        notificationRepository.create({
          userId: user.id, type: 'info',
          title: 'Invoice Returned',
          message: `Return created for ${invoice.invoiceNumber} — ${invoice.partnerName}.`,
          entityType: 'invoice', entityId: creditNoteId,
        });
      }

      return creditNoteId;
    });

    const creditNoteId = transaction();
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'invoice', entityId: creditNoteId });
    const creditNote = invoiceRepository.findById(creditNoteId);
    return NextResponse.json({ success: true, data: { ...creditNote, message: 'Return processed — credit note created and stock reversed' } }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
