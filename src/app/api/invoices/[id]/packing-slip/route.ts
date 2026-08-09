import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/middleware';
import { invoiceRepository } from '@/lib/repositories/invoiceRepository';
import { handleApiError, NotFoundError, BusinessRuleError } from '@/lib/utils/errors';
import { ensureInitialized, db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInitialized();
    const auth = await requirePermission(request, 'invoice.view');
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;

    const invoice = invoiceRepository.findById(Number(id));
    if (!invoice) throw new NotFoundError('Invoice', id);
    if (invoice.status !== 'posted' && invoice.status !== 'partial_paid' && invoice.status !== 'paid') {
      throw new BusinessRuleError('Packing slips can only be generated for posted invoices');
    }

    const lines = invoiceRepository.findLines(Number(id)).filter(l => l.lineType !== 'service');
    const company = db.prepare('SELECT * FROM company LIMIT 1').get() as any;

    return NextResponse.json({
      success: true,
      data: {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        partnerName: invoice.partnerName,
        warehouseId: invoice.warehouseId,
        warehouseName: invoice.warehouseId
          ? (db.prepare('SELECT name FROM warehouse WHERE id = ?').get(invoice.warehouseId) as any)?.name || null
          : null,
        company: company || null,
        lines: lines.map(l => ({
          productId: l.productId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          warehouseId: l.warehouseId,
          productName: l.productId ? (db.prepare('SELECT name, code FROM product WHERE id = ?').get(l.productId) as any)?.name || '' : '',
          productCode: l.productId ? (db.prepare('SELECT code FROM product WHERE id = ?').get(l.productId) as any)?.code || '' : '',
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
