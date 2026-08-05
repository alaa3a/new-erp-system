import { db } from '../db';
import { Warehouse } from '@/types/erp';

function mapRow(row: any): Warehouse {
  return { ...row, isActive: row.isActive === 1 };
}

export const warehouseRepository = {
  findAll(): Warehouse[] {
    return (db.prepare('SELECT * FROM warehouse WHERE isActive = 1 ORDER BY name ASC').all() as any[]).map(mapRow);
  },

  findById(id: number): Warehouse | null {
    const row = db.prepare('SELECT * FROM warehouse WHERE id = ?').get(id) as any;
    return row ? mapRow(row) : null;
  },

  create(data: Omit<Warehouse, 'id' | 'createdAt' | 'updatedAt' | 'version'>): number {
    const now = new Date().toISOString();
    const result = db.prepare('INSERT INTO warehouse (code, name, address, manager, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1)').run(
      data.code, data.name, data.address || '', data.manager || '', data.isActive !== false ? 1 : 0, now, now,
    );
    return result.lastInsertRowid as number;
  },

  update(id: number, data: Partial<Warehouse>, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE warehouse SET code=?, name=?, address=?, manager=?, isActive=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(
      data.code, data.name, data.address, data.manager, data.isActive !== false ? 1 : 0, now, id, version,
    );
    return result.changes > 0;
  },

  softDelete(id: number, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE warehouse SET isActive=0, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(now, id, version);
    return result.changes > 0;
  },
};
