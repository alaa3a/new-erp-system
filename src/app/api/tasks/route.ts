import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { taskRepository } from '@/lib/repositories/taskRepository';
import { auditLogRepository, notificationRepository } from '@/lib/repositories/userRepository';
import { handleApiError, ValidationError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { validate, createTaskSchema } from '@/lib/validators';

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const priority = searchParams.get('priority') || undefined;
    const assignedTo = searchParams.get('assignedTo') ? Number(searchParams.get('assignedTo')) : undefined;
    const search = searchParams.get('search') || undefined;

    const data = taskRepository.findAll({ status, priority, assignedTo, search });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const body = validate(createTaskSchema, await request.json());

    const id = taskRepository.create({
      title: body.title,
      description: body.description || '',
      status: body.status,
      priority: body.priority,
      assignedTo: body.assignedTo || null,
      createdBy: auth.userId,
      dueDate: body.dueDate || null,
    });
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'task', entityId: id });
    if (body.assignedTo) {
      notificationRepository.create({
        userId: body.assignedTo,
        type: 'info',
        title: 'New Task Assigned',
        message: `You have been assigned a task: "${body.title}"`,
        entityType: 'task',
        entityId: id,
      });
    }
    return NextResponse.json({ success: true, data: taskRepository.findById(id) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
