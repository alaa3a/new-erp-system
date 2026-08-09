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
    categoryId: row.categoryId || null,
    profileId: row.profileId || null,
  };
}

export const productRepository = {
  findAll(search?: string, itemType?: string, categoryId?: number | null): Product[] {
    let sql = 'SELECT * FROM product WHERE deletedAt IS NULL';
    const params: any[] = [];
    if (search) {
      sql += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (itemType) {
      sql += ' AND itemType = ?';
      params.push(itemType);
    }
    if (categoryId !== undefined) {
      if (categoryId === null) {
        sql += ' AND categoryId IS NULL';
      } else {
        sql += ' AND categoryId = ?';
        params.push(categoryId);
      }
    }
    sql += ' ORDER BY name ASC';
    return (db.prepare(sql).all(...params) as any[]).map(mapRow);
  },

  paginate(page: number, pageSize: number, search?: string, itemType?: string, categoryId?: number | null): { data: Product[]; total: number } {
    const offset = (page - 1) * pageSize;
    let where = 'WHERE deletedAt IS NULL';
    const params: any[] = [];
    if (search) { where += ' AND (name LIKE ? OR code LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (itemType) { where += ' AND itemType = ?'; params.push(itemType); }
    if (categoryId !== undefined) {
      if (categoryId === null) { where += ' AND categoryId IS NULL'; }
      else { where += ' AND categoryId = ?'; params.push(categoryId); }
    }
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
      INSERT INTO product (code, name, description, itemType, unitOfMeasure, salesPrice, purchasePrice, vatCodeId, purchaseVatCodeId, defaultWarehouseId, reorderPoint, isActive, categoryId, createdAt, updatedAt, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      code, data.name, data.description || '', data.itemType, data.unitOfMeasure || 'pcs',
      data.salesPrice || 0, data.purchasePrice || 0, data.vatCodeId, data.purchaseVatCodeId,
      data.defaultWarehouseId, data.reorderPoint || 0, data.isActive !== false ? 1 : 0,
      data.categoryId ?? null, now, now,
    );
    return result.lastInsertRowid as number;
  },

  update(id: number, data: Partial<Product>, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE product SET name=?, description=?, itemType=?, unitOfMeasure=?, salesPrice=?, purchasePrice=?,
      vatCodeId=?, purchaseVatCodeId=?, defaultWarehouseId=?, reorderPoint=?, isActive=?, categoryId=?, updatedAt=?, version=version+1
      WHERE id=? AND version=?
    `).run(
      data.name, data.description, data.itemType, data.unitOfMeasure, data.salesPrice,
      data.purchasePrice, data.vatCodeId, data.purchaseVatCodeId, data.defaultWarehouseId,
      data.reorderPoint, data.isActive !== false ? 1 : 0,
      data.categoryId ?? null, now, id, version,
    );
    return result.changes > 0;
  },

  softDelete(id: number, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE product SET isActive=0, deletedAt=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(now, now, id, version);
    return result.changes > 0;
  },

  restore(id: number, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE product SET isActive=1, deletedAt=NULL, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(now, id, version);
    return result.changes > 0;
  },

  /** Task 37 — stock on hand across all warehouses (blocks deletion when > 0). */
  getStockSummary(productId: number): { totalQuantity: number; warehouseCount: number } {
    const row = db.prepare('SELECT COALESCE(SUM(quantity), 0) AS totalQuantity, COUNT(*) AS warehouseCount FROM product_warehouse_stock WHERE productId = ? AND quantity > 0').get(productId) as any;
    return { totalQuantity: row?.totalQuantity ?? 0, warehouseCount: row?.warehouseCount ?? 0 };
  },

  /** Task 37 — true when any invoice line references this product. */
  isReferencedByInvoice(productId: number): boolean {
    const row = db.prepare('SELECT count(1) AS count FROM invoice_line WHERE productId = ?').get(productId) as any;
    return (row?.count ?? 0) > 0;
  },

  /** Task 37 — true when any purchase order line references this product. */
  isReferencedByPurchaseOrder(productId: number): boolean {
    const row = db.prepare('SELECT count(1) AS count FROM purchase_order_line WHERE productId = ?').get(productId) as any;
    return (row?.count ?? 0) > 0;
  },
};
