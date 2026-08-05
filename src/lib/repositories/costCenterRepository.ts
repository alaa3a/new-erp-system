import { db } from '../db';
import { CostCenter } from '@/types/erp';

function mapRow(row: any): CostCenter {
  return { ...row, isActive: row.isActive === 1, parentId: row.parentId || null, responsiblePerson: row.responsiblePerson || '', description: row.description || '' };
}

export const costCenterRepository = {
  findAll(): CostCenter[] {
    return (db.prepare('SELECT * FROM cost_center ORDER BY code ASC').all() as any[]).map(mapRow);
  },

  findById(id: number): CostCenter | null {
    const row = db.prepare('SELECT * FROM cost_center WHERE id = ?').get(id) as any;
    return row ? mapRow(row) : null;
  },

  create(data: Omit<CostCenter, 'id' | 'createdAt' | 'updatedAt' | 'version'>): number {
    const now = new Date().toISOString();
    const result = db.prepare('INSERT INTO cost_center (code, name, parentId, isActive, responsiblePerson, description, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)').run(
      data.code, data.name, data.parentId, data.isActive !== false ? 1 : 0, data.responsiblePerson || '', data.description || '', now, now,
    );
    return result.lastInsertRowid as number;
  },

  update(id: number, data: Partial<CostCenter>, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE cost_center SET code=?, name=?, parentId=?, isActive=?, responsiblePerson=?, description=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(
      data.code, data.name, data.parentId, data.isActive !== false ? 1 : 0, data.responsiblePerson, data.description, now, id, version,
    );
    return result.changes > 0;
  },

  hardDelete(id: number, version: number): boolean {
    const result = db.prepare('DELETE FROM cost_center WHERE id = ? AND version = ?').run(id, version);
    return result.changes > 0;
  },

  hasChildren(id: number): boolean {
    return (db.prepare('SELECT count(1) AS count FROM cost_center WHERE parentId = ?').get(id) as any).count > 0;
  },

  isUsedInEntries(id: number): boolean {
    return (db.prepare('SELECT count(1) AS count FROM entry_line WHERE costCenterId = ?').get(id) as any).count > 0 ||
      (db.prepare('SELECT count(1) AS count FROM entry WHERE costCenterId = ?').get(id) as any).count > 0;
  },

  isUsedInInvoiceLines(id: number): boolean {
    return (db.prepare('SELECT count(1) AS count FROM invoice_line WHERE costCenterId = ?').get(id) as any).count > 0;
  },

  isUsedInAccounts(id: number): boolean {
    return (db.prepare('SELECT count(1) AS count FROM account WHERE costCenterId = ?').get(id) as any).count > 0;
  },

  isUsedInPurchaseOrderLines(id: number): boolean {
    return (db.prepare('SELECT count(1) AS count FROM purchase_order_line WHERE costCenterId = ?').get(id) as any).count > 0;
  },
};
