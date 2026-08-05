import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { entryRepository } from '@/lib/repositories/entryRepository';
import { entryService } from '@/lib/services/entryService';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { NotFoundError, ValidationError, handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const { id } = await params;
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const entryId = parseInt(id, 10);
    const entry = entryRepository.findById(entryId);
    if (!entry) throw new NotFoundError('Entry', entryId);

    const body = await request.json().catch(() => ({}));
    const action = body.action || 'post';

    if (action === 'post') {
      entryService.postEntry(entryId, body.userId || 'system');
    } else if (action === 'cancel') {
      if (entry.status !== 'draft') throw new ValidationError('Only draft entries can be cancelled');
      entryRepository.updateStatus(entryId, 'cancelled');
    } else {
      throw new ValidationError(`Invalid action: ${action}`);
    }

    auditLogRepository.log({ userId: auth.userId, action, entityType: 'entry', entityId: entryId });
    const updated = entryRepository.findById(entryId);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
