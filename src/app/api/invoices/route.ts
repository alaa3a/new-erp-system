import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { invoiceRepository } from '@/lib/repositories/invoiceRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { validate, createInvoiceSchema } from '@/lib/validators';
import { calculateLineTotal, calculateVatAmount } from '@/lib/formatters/money';

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;
    const rawPartner = searchParams.get('businessPartnerId');
    const businessPartnerId = rawPartner && !Number.isNaN(parseInt(rawPartner, 10)) ? parseInt(rawPartner, 10) : undefined;
    const openOnly = searchParams.get('open') === '1';

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const result = invoiceRepository.paginate(page, pageSize, type, status, search, businessPartnerId, openOnly);
    return NextResponse.json({ success: true, data: result.data, total: result.total, page, pageSize });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized();
    const body = await request.json();
    validate(createInvoiceSchema, body);
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const {
      type, businessPartnerId, partnerName, postingProfileId,
      invoiceDate, dueDate, paymentTermId, warehouseId,
      referenceNumber, notes, lines,
    } = body;

    const invoiceId = invoiceRepository.create({
      type,
      businessPartnerId,
      partnerName,
      postingProfileId,
      invoiceDate,
      dueDate,
      paymentTermId,
      warehouseId,
      referenceNumber,
      notes,
      createdBy: String(auth.userId),
    });

    if (lines && Array.isArray(lines)) {
      let subtotal = 0;
      let vatAmount = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Integer-cents math — no float truncation (Critical Bug Fix #6)
        const lineTotal = calculateLineTotal(line.quantity, line.unitPrice, line.discountPercent || 0);
        const vatAmt = calculateVatAmount(lineTotal, line.vatRate || 0);

        invoiceRepository.addLine({
          invoiceId,
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

      invoiceRepository.updateTotals(invoiceId, subtotal, vatAmount, subtotal + vatAmount);
    }

    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'invoice', entityId: invoiceId });
    const invoice = invoiceRepository.findById(invoiceId);
    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
