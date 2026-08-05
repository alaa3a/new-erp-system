import { NextRequest, NextResponse } from 'next/server';
import { fiscalPeriodRepository } from '@/lib/repositories/fiscalPeriodRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { validate, fiscalPeriodSchema } from '@/lib/validators';

export async function GET() {
  try {
    await ensureInitialized();
    const periods = fiscalPeriodRepository.findAll();
    return NextResponse.json({ success: true, data: periods });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const body = validate(fiscalPeriodSchema, await request.json());

    // Check for overlapping open periods
    const existing = fiscalPeriodRepository.findAll();
    const overlap = existing.find(p =>
      p.status === 'open' &&
      body.startDate <= p.endDate &&
      body.endDate >= p.startDate
    );
    if (overlap) {
      return NextResponse.json({
        success: false,
        error: `Period overlaps with "${overlap.name}" (${overlap.startDate} — ${overlap.endDate})`,
      }, { status: 409 });
    }

    const id = fiscalPeriodRepository.create(body);
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'fiscal_period', entityId: id });
    const period = fiscalPeriodRepository.findById(id);
    return NextResponse.json({ success: true, data: period }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
