import { db } from '../db';
import { Product } from '@/types/erp';
import { generateProductCode } from '../utils/idGenerator';

function mapRow(row: any): Product {
  return {
    ...row,
    itemType: row.itemType as Product['itemType'],
    isActive: row.isActive === 1,
    salesPrice: row.salesPrice || 0,
    purchasePrice: row.purchasePrice || 0,
    reorderPoint: row.reorderPoint || 0,
    defaultWarehouseId: row.defaultWarehouseId || null,
    vatCodeId: row.vatCodeId || null,
    purchaseVatCodeId: row.purchaseVatCodeId || null,
    description: row.description || '',
    unitOfMeasure: row.unitOfMeasure || 'pcs',
  };
}

export const productRepository = {
  findAll(search?: string, itemType?: string): Product[] {
    let sql = 'SELECT * FROM product WHERE isActive = 1';
    const params: any[] = [];
    if (search) {
      sql += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (itemType) {
      sql += ' AND itemType = ?';
      params.push(itemType);
    }
    sql += ' ORDER BY name ASC';
    return (db.prepare(sql).all(...params) as any[]).map(mapRow);
  },

  paginate(page: number, pageSize: number, search?: string, itemType?: string): { data: Product[]; total: number } {
    const offset = (page - 1) * pageSize;
    let where = 'WHERE isActive = 1';
    const params: any[] = [];
    if (search) { where += ' AND (name LIKE ? OR code LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (itemType) { where += ' AND itemType = ?'; params.push(itemType); }
    const total = (db.prepare(`SELECT count(1) AS count FROM product ${where}`).get(...params) as any).count;
    const data = (db.prepare(`SELECT * FROM product ${where} ORDER BY name ASC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]).map(mapRow);
    return { data, total };
  },

  findById(id: number): Product | null {
    const row = db.prepare('SELECT * FROM product WHERE id = ?').get(id) as any;
    return row ? mapRow(row) : null;
  },

  create(data: Omit<Product, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'version'>): number {
    const now = new Date().toISOString();
    const code = generateProductCode();
    const result = db.prepare(`
      INSERT INTO product (code, name, description, itemType, unitOfMeasure, salesPrice, purchasePrice, vatCodeId, purchaseVatCodeId, defaultWarehouseId, reorderPoint, isActive, createdAt, updatedAt, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      code, data.name, data.description || '', data.itemType, data.unitOfMeasure || 'pcs',
      data.salesPrice || 0, data.purchasePrice || 0, data.vatCodeId, data.purchaseVatCodeId,
      data.defaultWarehouseId, data.reorderPoint || 0, data.isActive !== false ? 1 : 0, now, now,
    );
    return result.lastInsertRowid as number;
  },

  update(id: number, data: Partial<Product>, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE product SET name=?, description=?, itemType=?, unitOfMeasure=?, salesPrice=?, purchasePrice=?,
      vatCodeId=?, purchaseVatCodeId=?, defaultWarehouseId=?, reorderPoint=?, isActive=?, updatedAt=?, version=version+1
      WHERE id=? AND version=?
    `).run(
      data.name, data.description, data.itemType, data.unitOfMeasure, data.salesPrice,
      data.purchasePrice, data.vatCodeId, data.purchaseVatCodeId, data.defaultWarehouseId,
      data.reorderPoint, data.isActive !== false ? 1 : 0, now, id, version,
    );
    return result.changes > 0;
  },

  softDelete(id: number, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE product SET isActive=0, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(now, id, version);
    return result.changes > 0;
  },
};
