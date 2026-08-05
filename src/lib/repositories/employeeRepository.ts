import { db } from '../db';
import { Employee } from '@/types/erp';
import { generateEmployeeCode } from '../utils/idGenerator';

function mapRow(row: any): Employee {
  return {
    ...row,
    isActive: row.isActive === 1,
  };
}

export const employeeRepository = {
  findAll(search?: string, includeInactive = false): Employee[] {
    let sql = 'SELECT * FROM employee';
    const params: any[] = [];
    if (!includeInactive) {
      sql += ' WHERE isActive = 1';
    } else {
      sql += ' WHERE 1=1';
    }
    if (search) {
      sql += ' AND (name LIKE ? OR code LIKE ? OR email LIKE ? OR department LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY name ASC';
    return (db.prepare(sql).all(...params) as any[]).map(mapRow);
  },

  paginate(page: number, pageSize: number, search?: string): { data: Employee[]; total: number } {
    const offset = (page - 1) * pageSize;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (search) { where += ' AND (name LIKE ? OR code LIKE ? OR email LIKE ? OR department LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
    const total = (db.prepare(`SELECT count(1) AS count FROM employee ${where}`).get(...params) as any).count;
    const data = (db.prepare(`SELECT * FROM employee ${where} ORDER BY name ASC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]).map(mapRow);
    return { data, total };
  },

  findById(id: number): Employee | null {
    const row = db.prepare('SELECT * FROM employee WHERE id = ?').get(id) as any;
    return row ? mapRow(row) : null;
  },

  findByCode(code: string): Employee | null {
    const row = db.prepare('SELECT * FROM employee WHERE code = ?').get(code) as any;
    return row ? mapRow(row) : null;
  },

  create(data: { code?: string; name: string; jobTitle?: string; department?: string; email?: string; phone?: string; isActive?: boolean }): number {
    const now = new Date().toISOString();
    const code = data.code?.trim() || generateEmployeeCode();
    const result = db.prepare(`
      INSERT INTO employee (code, name, jobTitle, department, email, phone, isActive, createdAt, updatedAt, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      code, data.name, data.jobTitle || '', data.department || '',
      data.email || '', data.phone || '', data.isActive !== false ? 1 : 0, now, now,
    );
    return result.lastInsertRowid as number;
  },

  update(id: number, data: Partial<Employee>, version: number): boolean {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];
    if (data.code !== undefined) { fields.push('code=?'); values.push(data.code); }
    if (data.name !== undefined) { fields.push('name=?'); values.push(data.name); }
    if (data.jobTitle !== undefined) { fields.push('jobTitle=?'); values.push(data.jobTitle); }
    if (data.department !== undefined) { fields.push('department=?'); values.push(data.department); }
    if (data.email !== undefined) { fields.push('email=?'); values.push(data.email); }
    if (data.phone !== undefined) { fields.push('phone=?'); values.push(data.phone); }
    if (data.isActive !== undefined) { fields.push('isActive=?'); values.push(data.isActive ? 1 : 0); }
    if (fields.length === 0) return false;
    fields.push('updatedAt=?');
    values.push(now);
    fields.push('version=version+1');
    values.push(id, version);
    const result = db.prepare(`UPDATE employee SET ${fields.join(', ')} WHERE id=? AND version=?`).run(...values);
    return result.changes > 0;
  },

  softDelete(id: number, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE employee SET isActive=0, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(now, id, version);
    return result.changes > 0;
  },

  count(): number {
    return (db.prepare('SELECT count(1) AS count FROM employee WHERE isActive = 1').get() as any).count;
  },
};
