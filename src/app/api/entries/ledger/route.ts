import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { entryRepository } from '@/lib/repositories/entryRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();

    const { searchParams } = new URL(request.url);
    const accountCode = searchParams.get('accountCode');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let entries = entryRepository.findAll();

    if (startDate) {
      entries = entries.filter(e => e.entryDate >= startDate);
    }
    if (endDate) {
      entries = entries.filter(e => e.entryDate <= endDate);
    }

    const result = entries.map(e => ({
      ...e,
      lines: entryRepository.findLines(e.id),
    }));

    if (accountCode) {
      const filtered = result.filter(e =>
        e.lines.some(line => line.accountCode === accountCode)
      );
      return NextResponse.json({ success: true, data: filtered });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
