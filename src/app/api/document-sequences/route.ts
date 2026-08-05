import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { sequenceRepository } from '@/lib/repositories/sequenceRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { validate, documentSequenceSchema } from '@/lib/validators';

export async function GET() {
  try {
    await ensureInitialized();
    const sequences = sequenceRepository.findAll();
    return Response.json({ success: true, data: sequences });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const body = await request.json();
    validate(documentSequenceSchema, body);

    const success = sequenceRepository.update(body.id, body, body.version);
    if (!success) {
      return Response.json({ success: false, error: 'Conflict: record was modified by another user' }, { status: 409 });
    }

    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'document_sequence', entityId: body.id });
    const sequences = sequenceRepository.findAll();
    return Response.json({ success: true, data: sequences });
  } catch (error) {
    return handleApiError(error);
  }
}
