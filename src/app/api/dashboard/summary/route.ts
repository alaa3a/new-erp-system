import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { invoiceRepository } from '@/lib/repositories/invoiceRepository';
import { partnerRepository } from '@/lib/repositories/partnerRepository';
import { productRepository } from '@/lib/repositories/productRepository';
import { agingService } from '@/lib/services/agingService';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function GET(_request: NextRequest) {
  try {
    const auth = await requireAuth(_request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();

    const invoices = invoiceRepository.findAll();
    const totalSales = invoices
      .filter((i) => i.type === 'sales' && i.status !== 'draft')
      .reduce((sum, i) => sum + (i.totalAmount || 0), 0);
    const totalPurchases = invoices
      .filter((i) => i.type === 'purchase' && i.status !== 'draft')
      .reduce((sum, i) => sum + (i.totalAmount || 0), 0);

    const overdueReceivables = agingService.getOverdueReceivables();
    const totalOverdue = overdueReceivables.reduce(
      (sum: number, r: any) => sum + (r.balance || 0),
      0,
    );

    const partners = partnerRepository.findAll();
    const products = productRepository.findAll();

    return NextResponse.json({
      success: true,
      data: {
        totalSales,
        totalPurchases,
        totalOverdue,
        invoiceCount: invoices.length,
        partnerCount: partners.filter((p) => p.status === 'active').length,
        productCount: products.length,
        overdueInvoices: overdueReceivables.length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
