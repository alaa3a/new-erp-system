import { NextRequest, NextResponse } from 'next/server';
import { fiscalPeriodRepository } from '@/lib/repositories/fiscalPeriodRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { AppError, NotFoundError, handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { validate, fiscalPeriodSchema } from '@/lib/validators';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const { id } = await params;
    const periodId = parseInt(id, 10);
    const existing = fiscalPeriodRepository.findById(periodId);
    if (!existing) throw new NotFoundError('FiscalPeriod', periodId);

    const body = await request.json();
    validate(fiscalPeriodSchema, body);
    const now = new Date().toISOString();
    const { db } = await import('@/lib/db');
    db.prepare(
      'UPDATE fiscal_period SET name=?, startDate=?, endDate=?, status=?, updatedAt=?, version=version+1 WHERE id=? AND version=?'
    ).run(body.name, body.startDate, body.endDate, body.status || existing.status, now, periodId, body.version || existing.version);

    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'fiscal_period', entityId: periodId });
    const updated = fiscalPeriodRepository.findById(periodId);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const { id } = await params;
    const periodId = parseInt(id, 10);
    const existing = fiscalPeriodRepository.findById(periodId);
    if (!existing) throw new NotFoundError('FiscalPeriod', periodId);

    const body = await request.json();
    const userId = auth.userId;

    fiscalPeriodRepository.close(periodId, String(userId));
    auditLogRepository.log({ userId: auth.userId, action: 'close', entityType: 'fiscal_period', entityId: periodId });
    const updated = fiscalPeriodRepository.findById(periodId);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
