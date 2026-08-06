import { db } from '../db';
import { Task } from '@/types/erp';

function mapRow(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    status: row.status,
    priority: row.priority,
    assignedTo: row.assignedTo || null,
    assignedToName: row.assignedToName || null,
    createdBy: row.createdBy || null,
    createdByName: row.createdByName || null,
    dueDate: row.dueDate || null,
    completedAt: row.completedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const taskRepository = {
  findAll(filters?: { status?: string; priority?: string; assignedTo?: number; search?: string }): Task[] {
    let sql = `
      SELECT t.*,
             au.firstName || ' ' || au.lastName AS assignedToName,
             cu.firstName || ' ' || cu.lastName AS createdByName
      FROM task t
      LEFT JOIN users au ON t.assignedTo = au.id
      LEFT JOIN users cu ON t.createdBy = cu.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (filters?.status) { sql += ' AND t.status = ?'; params.push(filters.status); }
    if (filters?.priority) { sql += ' AND t.priority = ?'; params.push(filters.priority); }
    if (filters?.assignedTo) { sql += ' AND t.assignedTo = ?'; params.push(filters.assignedTo); }
    if (filters?.search) { sql += ' AND (t.title LIKE ? OR t.description LIKE ?)'; params.push(`%${filters.search}%`, `%${filters.search}%`); }
    sql += ` ORDER BY
      CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      t.dueDate ASC NULLS LAST,
      t.createdAt DESC`;
    return (db.prepare(sql).all(...params) as any[]).map(mapRow);
  },

  findById(id: number): Task | null {
    const row = db.prepare(`
      SELECT t.*,
             au.firstName || ' ' || au.lastName AS assignedToName,
             cu.firstName || ' ' || cu.lastName AS createdByName
      FROM task t
      LEFT JOIN users au ON t.assignedTo = au.id
      LEFT JOIN users cu ON t.createdBy = cu.id
      WHERE t.id = ?
    `).get(id) as any;
    return row ? mapRow(row) : null;
  },

  create(data: { title: string; description?: string; status?: string; priority?: string; assignedTo?: number | null; createdBy?: number | null; dueDate?: string | null }): number {
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO task (title, description, status, priority, assignedTo, createdBy, dueDate, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.title, data.description || '', data.status || 'todo', data.priority || 'medium',
      data.assignedTo || null, data.createdBy || null, data.dueDate || null, now, now,
    );
    return result.lastInsertRowid as number;
  },

  update(id: number, data: Partial<{ title: string; description: string; status: string; priority: string; assignedTo: number | null; dueDate: string | null }>): void {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];
    if (data.title !== undefined) { fields.push('title=?'); values.push(data.title); }
    if (data.description !== undefined) { fields.push('description=?'); values.push(data.description); }
    if (data.status !== undefined) {
      fields.push('status=?'); values.push(data.status);
      if (data.status === 'done') { fields.push('completedAt=?'); values.push(now); }
      else { fields.push('completedAt=NULL'); }
    }
    if (data.priority !== undefined) { fields.push('priority=?'); values.push(data.priority); }
    if (data.assignedTo !== undefined) { fields.push('assignedTo=?'); values.push(data.assignedTo); }
    if (data.dueDate !== undefined) { fields.push('dueDate=?'); values.push(data.dueDate); }
    if (fields.length === 0) return;
    fields.push('updatedAt=?');
    values.push(now);
    values.push(id);
    db.prepare(`UPDATE task SET ${fields.join(', ')} WHERE id=?`).run(...values);
  },

  delete(id: number): void {
    db.prepare('DELETE FROM task WHERE id = ?').run(id);
  },
};
