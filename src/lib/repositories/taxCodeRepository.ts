import { db } from '../db';
import { TaxCode, TaxGroup } from '@/types/erp';

function mapRow(row: any): TaxCode {
  let detailsConfig: TaxCode['detailsConfig'] = [];
  try {
    const parsed = JSON.parse(row.detailsConfig || '[]');
    if (Array.isArray(parsed)) detailsConfig = parsed;
  } catch { /* invalid JSON — treat as empty */ }
  return {
    ...row,
    isActive: row.isActive === 1,
    isSystemCode: row.isSystemCode === 1,
    parentId: row.parentId || null,
    effectiveTo: row.effectiveTo || null,
    isGroup: row.isGroup === 1,
    filingPeriod: row.filingPeriod || 'monthly',
    detailsConfig,
  };
}

export const taxCodeRepository = {
  findAll(): TaxCode[] {
    return (db.prepare('SELECT * FROM tax_code ORDER BY code ASC').all() as any[]).map(mapRow);
  },
  findGroups(): TaxGroup[] {
    return (db.prepare('SELECT * FROM tax_code WHERE isGroup = 1 ORDER BY code ASC').all() as any[]).map(mapRow) as TaxGroup[];
  },
  findById(id: number): TaxCode | null {
    const row = db.prepare('SELECT * FROM tax_code WHERE id = ?').get(id) as any;
    return row ? mapRow(row) : null;
  },
  create(data: Omit<TaxCode, 'id' | 'createdAt' | 'updatedAt' | 'version'>): number {
    const now = new Date().toISOString();
    const result = db.prepare(
      'INSERT INTO tax_code (code, name, rate, type, parentId, accountCode, isActive, isSystemCode, effectiveFrom, effectiveTo, isGroup, filingPeriod, detailsConfig, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    ).run(
      data.code, data.name, data.rate ?? 0, data.type ?? 'output', data.parentId ?? null, data.accountCode ?? '',
      data.isActive !== false ? 1 : 0, data.isSystemCode ? 1 : 0, data.effectiveFrom, data.effectiveTo ?? null,
      data.isGroup ? 1 : 0, data.filingPeriod || 'monthly',
      JSON.stringify(data.detailsConfig || []), now, now,
    );
    return result.lastInsertRowid as number;
  },
  update(id: number, data: Partial<TaxCode>, version: number): boolean {
    const now = new Date().toISOString();
    const current = taxCodeRepository.findById(id);
    if (!current) return false;
    const next = { ...current, ...data };
    const result = db.prepare(
      'UPDATE tax_code SET code=?, name=?, rate=?, type=?, parentId=?, accountCode=?, isActive=?, effectiveFrom=?, effectiveTo=?, isGroup=?, filingPeriod=?, detailsConfig=?, updatedAt=?, version=version+1 WHERE id=? AND version=?'
    ).run(
      next.code, next.name, next.rate, next.type, next.parentId, next.accountCode,
      next.isActive ? 1 : 0, next.effectiveFrom, next.effectiveTo, next.isGroup ? 1 : 0, next.filingPeriod,
      JSON.stringify(next.detailsConfig || []), now, id, version,
    );
    return result.changes > 0;
  },
  softDelete(id: number, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE tax_code SET isActive=0, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(now, id, version);
    return result.changes > 0;
  },
  hasChildren(id: number): boolean {
    return (db.prepare('SELECT count(1) AS count FROM tax_code WHERE parentId = ?').get(id) as any).count > 0;
  },
  isInUse(id: number): boolean {
    const count = (sql: string, ...params: any[]) => (db.prepare(sql).get(...params) as any)?.count ?? 0;
    return (
      count('SELECT count(1) AS count FROM invoice_line WHERE vatCodeId = ?', id) > 0 ||
      count('SELECT count(1) AS count FROM entry_line WHERE vatCodeId = ?', id) > 0 ||
      count('SELECT count(1) AS count FROM product WHERE vatCodeId = ? OR purchaseVatCodeId = ?', id, id) > 0 ||
      count('SELECT count(1) AS count FROM business_partner WHERE defaultVatCodeId = ?', id) > 0
    );
  },
};

export const paymentTermRepository = {
  findAll: () => (db.prepare('SELECT * FROM payment_term WHERE isActive = 1 ORDER BY code ASC').all() as any[]).map(r => ({ ...r, isActive: r.isActive === 1 })),
  findById: (id: number) => { const r = db.prepare('SELECT * FROM payment_term WHERE id = ?').get(id) as any; return r ? { ...r, isActive: r.isActive === 1 } : null; },
  create: (data: any) => { const now = new Date().toISOString(); return db.prepare('INSERT INTO payment_term (code, name, daysUntilDue, discountPercent, discountDays, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)').run(data.code, data.name, data.daysUntilDue, data.discountPercent || 0, data.discountDays || 0, data.isActive !== false ? 1 : 0, now, now).lastInsertRowid as number; },
  update: (id: number, data: any, version: number) => { const now = new Date().toISOString(); return db.prepare('UPDATE payment_term SET code=?, name=?, daysUntilDue=?, discountPercent=?, discountDays=?, isActive=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(data.code, data.name, data.daysUntilDue, data.discountPercent, data.discountDays, data.isActive !== false ? 1 : 0, now, id, version).changes > 0; },
  softDelete: (id: number, version: number) => db.prepare('UPDATE payment_term SET isActive=0, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(new Date().toISOString(), id, version).changes > 0,
};
