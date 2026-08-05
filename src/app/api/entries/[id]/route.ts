import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { entryRepository } from '@/lib/repositories/entryRepository';
import { entryService } from '@/lib/services/entryService';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { NotFoundError, ValidationError, ConflictError, handleApiError } from '@/lib/utils/errors';
import { db, ensureInitialized } from '@/lib/db';
import { validate, updateEntrySchema } from '@/lib/validators';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const { id } = await params;
    const entryId = parseInt(id, 10);
    const entry = entryRepository.findById(entryId);
    if (!entry) throw new NotFoundError('Entry', entryId);

    const lines = entryRepository.findLines(entryId).map(line => ({
      ...line,
      allocations: entryRepository.findAllocations(line.id),
    }));
    return NextResponse.json({ success: true, data: { ...entry, lines } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    const entryId = parseInt(id, 10);
    const existing = entryRepository.findById(entryId);
    if (!existing) throw new NotFoundError('Entry', entryId);
    if (existing.status !== 'draft') throw new ValidationError('Only draft entries can be modified');

    const body = await request.json();
    const lines = body.lines;

    if (!lines || !Array.isArray(lines) || lines.length < 2) {
      throw new ValidationError('At least two lines are required for a balanced entry');
    }

    validate(updateEntrySchema, body);

    entryService.validateBalanced(lines);
    entryService.validateLineAllocations(lines);
    entryService.validateReferences(lines);

    // Update entry header
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE entry SET entryDate=?, description=?, referenceNumber=?, categoryId=?, updatedAt=? WHERE id=? AND version=?'
    ).run(
      body.entryDate || existing.entryDate,
      body.description || existing.description,
      body.referenceNumber || existing.referenceNumber,
      body.entryCategoryId !== undefined ? (body.entryCategoryId || null) : existing.categoryId,
      now,
      entryId,
      body.version || existing.version,
    );

    // Replace lines
    entryRepository.deleteLines(entryId);

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

    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'entry', entityId: entryId });
    const updated = entryRepository.findById(entryId);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(_request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const { id } = await params;
    const entryId = parseInt(id, 10);
    const entry = entryRepository.findById(entryId);
    if (!entry) throw new NotFoundError('Entry', entryId);
    if (entry.status === 'posted') throw new ConflictError('Cannot delete a posted entry. Reverse it instead.');
    entryRepository.deleteLines(entryId);
    entryRepository.delete(entryId);
    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'entry', entityId: entryId });
    return NextResponse.json({ success: true, data: { id: entryId } });
  } catch (error) {
    return handleApiError(error);
  }
}
