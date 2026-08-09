import { db } from '../db';
import { ProductWarehouseStock, ReorderAlert } from '@/types/erp';
import { generateMovementNumber } from '../utils/idGenerator';
import { BusinessRuleError } from '../utils/errors';

function mapStock(row: any): ProductWarehouseStock {
  return {
    ...row,
    reservedQuantity: row.reservedQuantity || 0,
    available: (row.quantity || 0) - (row.reservedQuantity || 0),
  };
}

export const inventoryRepository = {
  getStock(productId: number, warehouseId: number): ProductWarehouseStock | null {
    const row = db.prepare('SELECT * FROM product_warehouse_stock WHERE productId = ? AND warehouseId = ?').get(productId, warehouseId) as any;
    return row ? mapStock(row) : null;
  },

  getAllStock(productId: number): ProductWarehouseStock[] {
    return (db.prepare('SELECT * FROM product_warehouse_stock WHERE productId = ?').all(productId) as any[]).map(mapStock);
  },

  getStockAcrossWarehouses(): Array<ProductWarehouseStock & { productName: string; warehouseName: string; code: string; itemType: string }> {
    // Task 42 — service items carry no stock; filter them out of stock queries.
    return (db.prepare(`
      SELECT pws.*, p.code, p.name AS productName, p.itemType, w.name AS warehouseName
      FROM product_warehouse_stock pws
      JOIN product p ON p.id = pws.productId
      JOIN warehouse w ON w.id = pws.warehouseId
      WHERE p.itemType = 'stock'
      ORDER BY p.name, w.name
    `).all() as any[]).map((row: any) => ({
      ...mapStock(row),
      productName: row.productName,
      warehouseName: row.warehouseName,
      code: row.code,
      itemType: row.itemType,
    }));
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
      db.prepare('INSERT INTO product_warehouse_stock (productId, warehouseId, quantity, reservedQuantity, averageCost, lastUpdated, version) VALUES (?, ?, ?, 0, ?, ?, 1)').run(
        productId, warehouseId, quantityDelta, unitCost, now,
      );
    }
  },

  // ─── Stock reservation (Task 38) ─────────────────────────────────────

  /** Commits `quantity` units of on-hand stock to an order. Validates availability. */
  reserveStock(productId: number, warehouseId: number, quantity: number, reference?: string): void {
    if (quantity <= 0) throw new BusinessRuleError('Reservation quantity must be positive');
    const stock = this.getStock(productId, warehouseId);
    const available = stock ? stock.available : 0;
    if (available < quantity) {
      throw new BusinessRuleError(`Cannot reserve ${quantity} units — only ${available} available for this product`);
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE product_warehouse_stock SET reservedQuantity=reservedQuantity+?, lastUpdated=?, version=version+1 WHERE productId=? AND warehouseId=?').run(quantity, now, productId, warehouseId);
  },

  /** Releases a previously-held reservation (invoice cancelled / returned). */
  releaseStock(productId: number, warehouseId: number, quantity: number): void {
    if (quantity <= 0) throw new BusinessRuleError('Release quantity must be positive');
    const stock = this.getStock(productId, warehouseId);
    const reserved = stock?.reservedQuantity || 0;
    const release = Math.min(quantity, reserved);
    const now = new Date().toISOString();
    db.prepare('UPDATE product_warehouse_stock SET reservedQuantity=reservedQuantity-?, lastUpdated=?, version=version+1 WHERE productId=? AND warehouseId=?').run(release, now, productId, warehouseId);
  },

  /**
   * Consumes a reservation at posting time: the reserved units leave the
   * warehouse as on-hand stock (quantity down, reservation down) so the
   * available figure stays consistent.
   */
  consumeReservation(productId: number, warehouseId: number, quantity: number): void {
    const stock = this.getStock(productId, warehouseId);
    if (!stock) return;
    const consume = Math.min(quantity, stock.reservedQuantity);
    if (consume <= 0) return;
    const now = new Date().toISOString();
    db.prepare('UPDATE product_warehouse_stock SET reservedQuantity=reservedQuantity-?, lastUpdated=?, version=version+1 WHERE productId=? AND warehouseId=?').run(consume, now, productId, warehouseId);
  },

  // ─── Reorder alerts (Task 39) ────────────────────────────────────────

  getReorderAlerts(): ReorderAlert[] {
    return db.prepare(`
      SELECT p.id AS productId, p.code AS productCode, p.name AS productName,
             w.id AS warehouseId, w.name AS warehouseName,
             pws.quantity, p.reorderPoint
      FROM product_warehouse_stock pws
      JOIN product p ON p.id = pws.productId
      JOIN warehouse w ON w.id = pws.warehouseId
      WHERE p.itemType = 'stock' AND p.reorderPoint > 0 AND pws.quantity <= p.reorderPoint
      ORDER BY (pws.quantity - p.reorderPoint) ASC, p.name
    `).all() as ReorderAlert[];
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
    // Task 42 — service items never generate stock movements; exclude them.
    let sql = 'SELECT im.*, p.name AS productName, w.name AS warehouseName FROM inventory_movement im JOIN product p ON p.id = im.productId JOIN warehouse w ON w.id = im.warehouseId WHERE p.itemType = \'stock\'';
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
