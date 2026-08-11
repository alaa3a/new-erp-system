import { db } from '../db';
import { Product } from '@/types/erp';
import { generateProductCode } from '../utils/idGenerator';

function mapRow(row: any): Product {
  return {
    ...row,
    itemType: row.itemType as Product['itemType'],
    isActive: row.isActive === 1,
    isCategory: row.isCategory === 1,
    parentId: row.parentId || null,
    salesPrice: row.salesPrice || 0,
    purchasePrice: row.purchasePrice || 0,
    reorderPoint: row.reorderPoint || 0,
    defaultWarehouseId: row.defaultWarehouseId || null,
    vatCodeId: row.vatCodeId || null,
    purchaseVatCodeId: row.purchaseVatCodeId || null,
    description: row.description || '',
    unitOfMeasure: row.unitOfMeasure || 'pcs',
    profileId: row.profileId || null,
  };
}

function buildWhere(search?: string, itemType?: string, opts?: { includeGroups?: boolean; parentId?: number | null }) {
  let where = 'WHERE deletedAt IS NULL';
  const params: any[] = [];
  // Groups (folders) are never sellable — most consumers want items only.
  if (!opts?.includeGroups) where += ' AND isCategory = 0';
  if (search) { where += ' AND (name LIKE ? OR code LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (itemType) { where += ' AND itemType = ?'; params.push(itemType); }
  if (opts?.parentId !== undefined) {
    if (opts.parentId === null) where += ' AND parentId IS NULL';
    else { where += ' AND parentId = ?'; params.push(opts.parentId); }
  }
  return { where, params };
}

export const productRepository = {
  /** Sellable products only (excludes group nodes). */
  findAll(search?: string, itemType?: string): Product[] {
    const { where, params } = buildWhere(search, itemType);
    return (db.prepare(`SELECT * FROM product ${where} ORDER BY name ASC`).all(...params) as any[]).map(mapRow);
  },

  /** All nodes (groups + items) — used to build the product tree. */
  findAllIncludingGroups(search?: string, itemType?: string): Product[] {
    const { where, params } = buildWhere(search, itemType, { includeGroups: true });
    return (db.prepare(`SELECT * FROM product ${where} ORDER BY name ASC`).all(...params) as any[]).map(mapRow);
  },

  /** Sellable products under a specific parent (parentId null = top-level). */
  paginate(page: number, pageSize: number, search?: string, itemType?: string, parentId?: number | null): { data: Product[]; total: number } {
    const offset = (page - 1) * pageSize;
    const { where, params } = buildWhere(search, itemType, { parentId });
    const total = (db.prepare(`SELECT count(1) AS count FROM product ${where}`).get(...params) as any).count;
    const data = (db.prepare(`SELECT * FROM product ${where} ORDER BY name ASC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]).map(mapRow);
    return { data, total };
  },

  findById(id: number): Product | null {
    const row = db.prepare('SELECT * FROM product WHERE id = ?').get(id) as any;
    return row ? mapRow(row) : null;
  },

  findByCode(code: string): Product | null {
    // No deletedAt filter — soft-deleted rows still hold the UNIQUE code, so
    // the create/update pre-checks must see them to return a clean 400.
    const row = db.prepare('SELECT * FROM product WHERE code = ?').get(code) as any;
    return row ? mapRow(row) : null;
  },

  /** True when the node has non-deleted children (groups cannot be deleted while they do). */
  getChildCount(id: number): number {
    return (db.prepare('SELECT count(1) AS count FROM product WHERE parentId = ? AND deletedAt IS NULL').get(id) as any)?.count || 0;
  },

  /** True when `ancestorId` is an ancestor of `nodeId` — used to block cycles. */
  isAncestor(ancestorId: number, nodeId: number): boolean {
    let current = db.prepare('SELECT parentId FROM product WHERE id = ?').get(nodeId) as any;
    let guard = 0;
    while (current && current.parentId && guard < 100) {
      if (current.parentId === ancestorId) return true;
      current = db.prepare('SELECT parentId FROM product WHERE id = ?').get(current.parentId) as any;
      guard++;
    }
    return false;
  },

  /** Total number of descendants across all levels (groups + items). */
  countDescendants(id: number): number {
    let count = 0;
    const children = db.prepare('SELECT id FROM product WHERE parentId = ? AND deletedAt IS NULL').all(id) as any[];
    for (const child of children) {
      count += 1 + this.countDescendants(child.id);
    }
    return count;
  },

  /** Toggles active state for the node and all descendants at every level. */
  cascadeToggleActive(id: number, active: boolean): void {
    const now = new Date().toISOString();
    const updateChildren = (parentId: number) => {
      const children = db.prepare('SELECT id FROM product WHERE parentId = ? AND deletedAt IS NULL').all(parentId) as any[];
      for (const child of children) {
        db.prepare('UPDATE product SET isActive=?, updatedAt=?, version=version+1 WHERE id=?').run(active ? 1 : 0, now, child.id);
        updateChildren(child.id);
      }
    };
    updateChildren(id);
  },

  create(data: Omit<Product, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'version'> & { code?: string }): number {
    const now = new Date().toISOString();
    const code = data.code?.trim() || generateProductCode();
    const result = db.prepare(`
      INSERT INTO product (code, name, description, itemType, unitOfMeasure, salesPrice, purchasePrice, vatCodeId, purchaseVatCodeId, defaultWarehouseId, reorderPoint, isActive, parentId, isCategory, createdAt, updatedAt, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      code, data.name, data.description || '', data.itemType, data.unitOfMeasure || 'pcs',
      data.salesPrice || 0, data.purchasePrice || 0, data.vatCodeId, data.purchaseVatCodeId,
      data.defaultWarehouseId, data.reorderPoint || 0, data.isActive !== false ? 1 : 0,
      data.parentId ?? null, data.isCategory ? 1 : 0, now, now,
    );
    return result.lastInsertRowid as number;
  },

  update(id: number, data: Partial<Product>, version: number): boolean {
    // Dynamic SET — only the fields present in `data` are written, so partial
    // updates (toggle active, restore, single-field edits) never clobber the
    // rest of the row (mirrors accountRepository.update).
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];
    const push = (col: string, val: unknown) => { fields.push(`${col}=?`); values.push(val); };
    if (data.code !== undefined) push('code', data.code);
    if (data.name !== undefined) push('name', data.name);
    if (data.description !== undefined) push('description', data.description);
    if (data.itemType !== undefined) push('itemType', data.itemType);
    if (data.unitOfMeasure !== undefined) push('unitOfMeasure', data.unitOfMeasure);
    if (data.salesPrice !== undefined) push('salesPrice', data.salesPrice);
    if (data.purchasePrice !== undefined) push('purchasePrice', data.purchasePrice);
    if (data.vatCodeId !== undefined) push('vatCodeId', data.vatCodeId);
    if (data.purchaseVatCodeId !== undefined) push('purchaseVatCodeId', data.purchaseVatCodeId);
    if (data.defaultWarehouseId !== undefined) push('defaultWarehouseId', data.defaultWarehouseId);
    if (data.reorderPoint !== undefined) push('reorderPoint', data.reorderPoint);
    if (data.isActive !== undefined) push('isActive', data.isActive ? 1 : 0);
    if (data.parentId !== undefined) push('parentId', data.parentId);
    if (data.isCategory !== undefined) push('isCategory', data.isCategory ? 1 : 0);
    if (data.profileId !== undefined) push('profileId', data.profileId);
    if (fields.length === 0) return true;
    fields.push('updatedAt=?'); values.push(now);
    fields.push('version=version+1');
    values.push(id, version);
    const result = db.prepare(`UPDATE product SET ${fields.join(', ')} WHERE id=? AND version=?`).run(...values);
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
