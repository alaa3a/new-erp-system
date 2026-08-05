import { db } from '../db';

export const paymentTermRepository = {
  findAll: () => (db.prepare('SELECT * FROM payment_term WHERE isActive = 1 ORDER BY code ASC').all() as any[]).map(r => ({ ...r, isActive: r.isActive === 1 })),
  findById: (id: number) => { const r = db.prepare('SELECT * FROM payment_term WHERE id = ?').get(id) as any; return r ? { ...r, isActive: r.isActive === 1 } : null; },
  create: (data: any) => { const now = new Date().toISOString(); return db.prepare('INSERT INTO payment_term (code, name, daysUntilDue, discountPercent, discountDays, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)').run(data.code, data.name, data.daysUntilDue, data.discountPercent || 0, data.discountDays || 0, data.isActive !== false ? 1 : 0, now, now).lastInsertRowid as number; },
  update: (id: number, data: any, version: number) => { const now = new Date().toISOString(); return db.prepare('UPDATE payment_term SET code=?, name=?, daysUntilDue=?, discountPercent=?, discountDays=?, isActive=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(data.code, data.name, data.daysUntilDue, data.discountPercent, data.discountDays, data.isActive !== false ? 1 : 0, now, id, version).changes > 0; },
  softDelete: (id: number, version: number) => db.prepare('UPDATE payment_term SET isActive=0, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(new Date().toISOString(), id, version).changes > 0,
};
