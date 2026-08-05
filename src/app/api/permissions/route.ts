import { NextResponse } from 'next/server';
import { getAllPermissions } from '@/lib/auth/permissions';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function GET() {
  try {
    await ensureInitialized();
    const permissions = getAllPermissions();
    return NextResponse.json({ success: true, data: permissions });
  } catch (error) {
    return handleApiError(error);
  }
}
