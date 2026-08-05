import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError } from '@/lib/utils/errors';
import { validate } from '@/lib/validators';
import { ensureInitialized } from '@/lib/db';

const auditLogFilterSchema = z.object({
  entityType: z.string().optional(),
  userId: z.coerce.number().int().positive().optional(),
  action: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized();
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const { entityType, userId, action } = validate(auditLogFilterSchema, params);

    const logs = auditLogRepository.findAll({ entityType, userId, action });
    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    return handleApiError(error);
  }
}
