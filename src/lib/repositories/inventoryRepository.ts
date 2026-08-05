import { db } from '../db';
import { ProductWarehouseStock } from '@/types/erp';
import { generateMovementNumber } from '../utils/idGenerator';
import { BusinessRuleError } from '../utils/errors';

export const inventoryRepository = {
  getStock(productId: number, warehouseId: number): ProductWarehouseStock | null {
    const row = db.prepare('SELECT * FROM product_warehouse_stock WHERE productId = ? AND warehouseId = ?').get(productId, warehouseId) as any;
    return row || null;
  },

  getAllStock(productId: number): ProductWarehouseStock[] {
    return db.prepare('SELECT * FROM product_warehouse_stock WHERE productId = ?').all(productId) as any[];
  },

  getStockAcrossWarehouses(): Array<ProductWarehouseStock & { productName: string; warehouseName: string }> {
    return db.prepare(`
      SELECT pws.*, p.code, p.name AS productName, p.itemType, w.name AS warehouseName
      FROM product_warehouse_stock pws
      JOIN product p ON p.id = pws.productId
      JOIN warehouse w ON w.id = pws.warehouseId
      ORDER BY p.name, w.name
    `).all() as any[];
  },

  upsertStock(productId: number, warehouseId: number, quantityDelta: number, unitCost: number): void {
    const now = new Date().toISOString();
    const existing = db.prepare('SELECT * FROM product_warehouse_stock WHERE productId = ? AND warehouseId = ?').get(productId, warehouseId) as any;
    if (existing) {
      // Never let stock go negative (Critical Bug Fix #5).
      const newQty = existing.quantity + quantityDelta;
      if (newQty < 0) {
        throw new BusinessRuleError(`Insufficient stock: cannot reduce by ${Math.abs(quantityDelta)} (available: ${existing.quantity})`);
      }
      const newValue = existing.quantity * existing.averageCost + quantityDelta * unitCost;
      const newAvg = newQty > 0 ? Math.round(newValue / newQty) : 0;
      db.prepare('UPDATE product_warehouse_stock SET quantity=?, averageCost=?, lastUpdated=?, version=version+1 WHERE id=?').run(newQty, newAvg, now, existing.id);
    } else {
      if (quantityDelta < 0) {
        throw new BusinessRuleError(`Insufficient stock: cannot reduce by ${Math.abs(quantityDelta)} (available: 0)`);
      }
      db.prepare('INSERT INTO product_warehouse_stock (productId, warehouseId, quantity, averageCost, lastUpdated, version) VALUES (?, ?, ?, ?, ?, 1)').run(
        productId, warehouseId, quantityDelta, unitCost, now,
      );
    }
  },

  recordMovement(data: { type: string; productId: number; warehouseId: number; quantity: number; unitCost: number; referenceType: string; referenceId: number; referenceNumber: string; postedBy: string }): number {
    const now = new Date().toISOString();
    const totalCost = Math.abs(data.quantity) * data.unitCost;
    // Use the shared (transactional) generator instead of inline sequence logic
    // — one source of truth for movement numbers (Critical Bug Fix #8).
    const movementNumber = generateMovementNumber(data.type);
    const result = db.prepare('INSERT INTO inventory_movement (movementNumber, type, productId, warehouseId, quantity, unitCost, totalCost, referenceType, referenceId, referenceNumber, postedBy, postedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      movementNumber, data.type, data.productId, data.warehouseId, data.quantity,
      data.unitCost, totalCost, data.referenceType, data.referenceId,
      data.referenceNumber, data.postedBy, now, now,
    );
    return result.lastInsertRowid as number;
  },

  getMovements(productId?: number, warehouseId?: number): any[] {
    let sql = 'SELECT im.*, p.name AS productName, w.name AS warehouseName FROM inventory_movement im JOIN product p ON p.id = im.productId JOIN warehouse w ON w.id = im.warehouseId WHERE 1=1';
    const params: any[] = [];
    if (productId) { sql += ' AND im.productId = ?'; params.push(productId); }
    if (warehouseId) { sql += ' AND im.warehouseId = ?'; params.push(warehouseId); }
    sql += ' ORDER BY im.createdAt DESC';
    return db.prepare(sql).all(...params);
  },

  getValuation(): any[] {
    return db.prepare(`
      SELECT p.id, p.code, p.name, p.itemType, w.id AS warehouseId, w.code AS warehouseCode, w.name AS warehouseName,
        pws.quantity, pws.averageCost, (pws.quantity * pws.averageCost) AS totalValue
      FROM product_warehouse_stock pws
      JOIN product p ON p.id = pws.productId
      JOIN warehouse w ON w.id = pws.warehouseId
      WHERE p.itemType = 'stock' AND pws.quantity > 0
      ORDER BY p.name, w.name
    `).all();
  },
};
