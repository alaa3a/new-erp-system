import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { entryRepository } from '@/lib/repositories/entryRepository';
import { entryService } from '@/lib/services/entryService';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError, ValidationError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { validate, createEntrySchema } from '@/lib/validators';

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;
    // categoryId: optional numeric id filters to that category; absent means no filter.
    const rawCategory = searchParams.get('categoryId');
    let categoryId: number | undefined;
    if (rawCategory) {
      const parsed = parseInt(rawCategory, 10);
      if (!Number.isNaN(parsed)) categoryId = parsed;
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const result = entryRepository.paginate(page, pageSize, status, search, categoryId);
    return NextResponse.json({ success: true, data: result.data, total: result.total, page, pageSize });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized();
    const body = await request.json();
    validate(createEntrySchema, body);
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    const lines = body.lines || [];
    if (lines.length === 0) {
      throw new ValidationError('At least one line is required');
    }

    // Validate balanced + payment allocation sums + references
    entryService.validateBalanced(lines);
    entryService.validateLineAllocations(lines);
    entryService.validateReferences(lines);

    const entryId = entryRepository.create({
      entryDate: body.entryDate,
      description: body.description,
      referenceNumber: body.referenceNumber || '',
      linkedInvoiceId: body.linkedInvoiceId || null,
      periodId: body.periodId || null,
      costCenterId: body.costCenterId || null,
      categoryId: body.entryCategoryId || null,
      createdBy: String(auth.userId),
    });

    let totalDebit = 0;
    let totalCredit = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      totalDebit += line.debitAmount || 0;
      totalCredit += line.creditAmount || 0;

      const lineId = entryRepository.addLine({
        entryId,
        lineNumber: i + 1,
        accountCode: line.accountCode,
        description: line.description || body.description,
        debitAmount: line.debitAmount || 0,
        creditAmount: line.creditAmount || 0,
        businessPartnerId: line.businessPartnerId || null,
        costCenterId: line.costCenterId || null,
        employeeId: line.employeeId || null,
        vatCodeId: line.vatCodeId || null,
        vatAmount: line.vatAmount || 0,
        lineType: line.lineType || 'normal',
        supplierName: line.supplierName || null,
        supplierTaxId: line.supplierTaxId || null,
        invoiceNumber: line.invoiceNumber || null,
        invoiceDate: line.invoiceDate || null,
        taxDetailsJson: line.taxDetailsJson || null,
      });

      if (line.allocations && line.allocations.length > 0) {
        entryRepository.replaceAllocations(lineId, line.allocations);
      }
    }

    entryRepository.updateTotals(entryId, totalDebit, totalCredit);

    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'entry', entityId: entryId });
    const entry = entryRepository.findById(entryId);
    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
