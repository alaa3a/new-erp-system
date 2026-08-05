import { db } from '../db';
import { BusinessPartner } from '@/types/erp';
import { generatePartnerCode } from '../utils/idGenerator';

function mapRow(row: any): BusinessPartner {
  return {
    ...row,
    creditLimit: row.creditLimit || 0,
    defaultVatCodeId: row.defaultVatCodeId || null,
    paymentTermId: row.paymentTermId || null,
    tags: JSON.parse(row.tags || '[]'),
    status: row.status as BusinessPartner['status'],
    type: row.type as BusinessPartner['type'],
  };
}

export const partnerRepository = {
  findAll(search?: string, type?: string): BusinessPartner[] {
    let sql = 'SELECT * FROM business_partner WHERE deletedAt IS NULL';
    const params: any[] = [];
    if (search) {
      sql += ' AND (name LIKE ? OR code LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    sql += ' ORDER BY name ASC';
    return (db.prepare(sql).all(...params) as any[]).map(mapRow);
  },

  paginate(page: number, pageSize: number, search?: string, type?: string): { data: BusinessPartner[]; total: number } {
    const offset = (page - 1) * pageSize;
    let where = 'WHERE deletedAt IS NULL';
    const params: any[] = [];
    if (search) { where += ' AND (name LIKE ? OR code LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (type) { where += ' AND type = ?'; params.push(type); }
    const total = (db.prepare(`SELECT count(1) AS count FROM business_partner ${where}`).get(...params) as any).count;
    const data = (db.prepare(`SELECT * FROM business_partner ${where} ORDER BY name ASC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]).map(mapRow);
    return { data, total };
  },

  findById(id: number): BusinessPartner | null {
    const row = db.prepare('SELECT * FROM business_partner WHERE id = ?').get(id) as any;
    return row ? mapRow(row) : null;
  },

  findByCode(code: string): BusinessPartner | null {
    const row = db.prepare('SELECT * FROM business_partner WHERE code = ?').get(code) as any;
    return row ? mapRow(row) : null;
  },

  create(data: Omit<BusinessPartner, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'version'>): number {
    const now = new Date().toISOString();
    const code = generatePartnerCode();
    const result = db.prepare(`
      INSERT INTO business_partner (code, name, type, contactPerson, email, phone, address, city, country, taxRegistrationNumber, defaultVatCodeId, paymentTermId, creditLimit, status, tags, createdAt, updatedAt, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      code, data.name, data.type, data.contactPerson || '', data.email || '',
      data.phone || '', data.address || '', data.city || '', data.country || '',
      data.taxRegistrationNumber || '', data.defaultVatCodeId, data.paymentTermId,
      data.creditLimit || 0, data.status || 'active', JSON.stringify(data.tags || []),
      now, now,
    );
    return result.lastInsertRowid as number;
  },

  update(id: number, data: Partial<BusinessPartner>, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE business_partner SET name=?, type=?, contactPerson=?, email=?, phone=?, address=?, city=?, country=?,
      taxRegistrationNumber=?, defaultVatCodeId=?, paymentTermId=?, creditLimit=?, status=?, tags=?, updatedAt=?, version=version+1
      WHERE id=? AND version=?
    `).run(
      data.name, data.type, data.contactPerson, data.email, data.phone,
      data.address, data.city, data.country, data.taxRegistrationNumber,
      data.defaultVatCodeId, data.paymentTermId, data.creditLimit, data.status,
      JSON.stringify(data.tags || []), now, id, version,
    );
    return result.changes > 0;
  },

  softDelete(id: number, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare("UPDATE business_partner SET status='deleted', deletedAt=?, updatedAt=?, version=version+1 WHERE id=? AND version=?").run(now, now, id, version);
    return result.changes > 0;
  },

  restore(id: number, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare("UPDATE business_partner SET status='active', deletedAt=NULL, updatedAt=?, version=version+1 WHERE id=? AND version=?").run(now, id, version);
    return result.changes > 0;
  },

  count(): number {
    return (db.prepare('SELECT count(1) AS count FROM business_partner WHERE deletedAt IS NULL').get() as any).count;
  },
};
