import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { taskRepository } from '@/lib/repositories/taskRepository';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError, NotFoundError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';
import { validate, updateTaskSchema } from '@/lib/validators';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const { id } = await params;
    const task = taskRepository.findById(Number(id));
    if (!task) throw new NotFoundError('Task', id);
    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    const taskId = Number(id);
    const existing = taskRepository.findById(taskId);
    if (!existing) throw new NotFoundError('Task', id);
    const body = validate(updateTaskSchema, await request.json());

    taskRepository.update(taskId, {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.assignedTo !== undefined && { assignedTo: body.assignedTo }),
      ...(body.dueDate !== undefined && { dueDate: body.dueDate }),
    });
    auditLogRepository.log({ userId: auth.userId, action: 'update', entityType: 'task', entityId: taskId });
    return NextResponse.json({ success: true, data: taskRepository.findById(taskId) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized();
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    const taskId = Number(id);
    const existing = taskRepository.findById(taskId);
    if (!existing) throw new NotFoundError('Task', id);
    taskRepository.delete(taskId);
    auditLogRepository.log({ userId: auth.userId, action: 'delete', entityType: 'task', entityId: taskId });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
