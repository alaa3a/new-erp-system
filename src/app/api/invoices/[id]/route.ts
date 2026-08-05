import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { invoiceRepository } from '@/lib/repositories/invoiceRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { validate, updateInvoiceSchema } from '@/lib/validators';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized();
    const { id } = await params;
    const invoice = invoiceRepository.findById(Number(id));
    if (!invoice) {
      return NextResponse.json({ success: false, error: `Invoice with id ${id} not found` }, { status: 404 });
    }

    const lines = invoiceRepository.findLines(Number(id));
    return NextResponse.json({ success: true, data: { ...invoice, lines } });
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
    const invoice = invoiceRepository.findById(Number(id));
    if (!invoice) {
      return NextResponse.json({ success: false, error: `Invoice with id ${id} not found` }, { status: 404 });
    }
    if (invoice.status !== 'draft') {
      return NextResponse.json({ success: false, error: 'Only draft invoices can be updated' }, { status: 422 });
    }

    const body = await request.json();
    validate(updateInvoiceSchema, body);
    const { businessPartnerId, partnerName, postingProfileId, invoiceDate, dueDate, paymentTermId, warehouseId, referenceNumber, notes, lines } = body;

    const now = new Date().toISOString();
    const db = (await import('@/lib/db')).db;
    db.prepare(`
      UPDATE invoice SET
        businessPartnerId=?, partnerName=?, postingProfileId=?,
        invoiceDate=?, dueDate=?, paymentTermId=?, warehouseId=?,
        referenceNumber=?, notes=?, updatedAt=?, version=version+1
      WHERE id=?
    `).run(
      businessPartnerId ?? invoice.businessPartnerId,
      partnerName ?? invoice.partnerName,
      postingProfileId ?? invoice.postingProfileId,
      invoiceDate ?? invoice.invoiceDate,
      dueDate ?? invoice.dueDate,
      paymentTermId ?? invoice.paymentTermId,
      warehouseId ?? invoice.warehouseId,
      referenceNumber ?? invoice.referenceNumber,
      notes ?? invoice.notes,
      now,
      Number(id),
    );

    if (lines && Array.isArray(lines)) {
      invoiceRepository.deleteLines(Number(id));
      let subtotal = 0;
      let vatAmount = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineTotal = line.quantity * line.unitPrice * (1 - (line.discountPercent || 0) / 100);
        const vatAmt = lineTotal * (line.vatRate || 0) / 100;

        invoiceRepository.addLine({
          invoiceId: Number(id),
          lineNumber: i + 1,
          productId: line.productId,
          description: line.description || '',
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent || 0,
          vatCodeId: line.vatCodeId || null,
          vatRate: line.vatRate || 0,
          vatAmount: vatAmt,
          lineTotal,
          warehouseId: line.warehouseId ?? warehouseId ?? null,
          costCenterId: line.costCenterId || null,
          accountCode: line.accountCode || '',
          lineType: line.lineType || 'stock',
        });

        subtotal += lineTotal;
        vatAmount += vatAmt;
      }

      invoiceRepository.updateTotals(Number(id), subtotal, vatAmount, subtotal + vatAmount);
    }

    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'invoice', entityId: Number(id) });
    const updated = invoiceRepository.findById(Number(id));
    return NextResponse.json({ success: true, data: updated });
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
    const invoice = invoiceRepository.findById(Number(id));
    if (!invoice) {
      return NextResponse.json({ success: false, error: `Invoice with id ${id} not found` }, { status: 404 });
    }
    if (invoice.status !== 'draft') {
      return NextResponse.json({ success: false, error: 'Only draft invoices can be cancelled' }, { status: 422 });
    }

    invoiceRepository.updateStatus(Number(id), 'cancelled');
    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'invoice', entityId: Number(id) });
    return NextResponse.json({ success: true, data: { message: 'Invoice cancelled successfully' } });
  } catch (error) {
    return handleApiError(error);
  }
}
