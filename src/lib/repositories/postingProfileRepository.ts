import { db } from '../db';

function mapRow(r: any) {
  return { ...r, isActive: r.isActive === 1, isDefault: r.isDefault === 1, entryCategoryId: r.entryCategoryId || null };
}

export const postingProfileRepository = {
  findAll: () => (db.prepare('SELECT * FROM posting_profile WHERE isActive = 1 ORDER BY name ASC').all() as any[]).map(mapRow),
  findAllIncludingInactive: () => (db.prepare('SELECT * FROM posting_profile ORDER BY name ASC').all() as any[]).map(mapRow),
  findById: (id: number) => { const r = db.prepare('SELECT * FROM posting_profile WHERE id = ?').get(id) as any; return r ? mapRow(r) : null; },
  create: (data: any) => { const now = new Date().toISOString(); return db.prepare('INSERT INTO posting_profile (name, invoiceType, accountsReceivableCode, accountsPayableCode, cashAccountCode, discountAccountCode, inventoryAccountCode, cogsAccountCode, isDefault, isActive, entryCategoryId, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').run(data.name, data.invoiceType, data.accountsReceivableCode, data.accountsPayableCode, data.cashAccountCode, data.discountAccountCode, data.inventoryAccountCode, data.cogsAccountCode, data.isDefault ? 1 : 0, data.isActive !== false ? 1 : 0, data.entryCategoryId || null, now, now).lastInsertRowid as number; },
  update: (id: number, data: any, version: number) => {
    const now = new Date().toISOString();
    const current = postingProfileRepository.findById(id);
    if (!current) return false;
    const next = { ...current, ...data };
    return db.prepare('UPDATE posting_profile SET name=?, invoiceType=?, accountsReceivableCode=?, accountsPayableCode=?, cashAccountCode=?, discountAccountCode=?, inventoryAccountCode=?, cogsAccountCode=?, isDefault=?, isActive=?, entryCategoryId=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(next.name, next.invoiceType, next.accountsReceivableCode, next.accountsPayableCode, next.cashAccountCode, next.discountAccountCode, next.inventoryAccountCode, next.cogsAccountCode, next.isDefault ? 1 : 0, next.isActive !== false ? 1 : 0, next.entryCategoryId || null, now, id, version).changes > 0;
  },
  /** Unmark other profiles of the same invoiceType when this one is set as default (§7 default uniqueness). */
  clearOtherDefaults: (id: number, invoiceType: string): void => {
    db.prepare('UPDATE posting_profile SET isDefault=0, updatedAt=? WHERE invoiceType = ? AND id != ?').run(new Date().toISOString(), invoiceType, id);
  },
  softDelete: (id: number, version: number) => db.prepare('UPDATE posting_profile SET isActive=0, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(new Date().toISOString(), id, version).changes > 0,
};
