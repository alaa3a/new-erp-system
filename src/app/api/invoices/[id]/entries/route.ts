import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { invoiceRepository } from '@/lib/repositories/invoiceRepository';
import { entryRepository } from '@/lib/repositories/entryRepository';
import { handleApiError, NotFoundError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(_request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const { id } = await params;
    const invoiceId = Number(id);
    const invoice = invoiceRepository.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', id);

    const entries = entryRepository.findByLinkedInvoice(invoiceId);
    const entriesWithLines = entries.map(entry => ({ ...entry, lines: entryRepository.findLines(entry.id) }));
    return NextResponse.json({ success: true, data: entriesWithLines });
  } catch (error) {
    return handleApiError(error);
  }
}
