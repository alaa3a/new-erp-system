import { db } from '../db';
import { InventoryCount, InventoryCountLine, ProductWarehouseStock } from '@/types/erp';

function mapCount(row: any): InventoryCount {
  return {
    ...row,
    countedBy: row.countedBy,
    notes: row.notes || '',
    countedAt: row.countedAt || null,
    status: row.status,
  };
}

function mapLine(row: any): InventoryCountLine {
  return {
    ...row,
    productName: row.productName || '',
    productCode: row.productCode || '',
    systemQuantity: row.systemQuantity || 0,
    countedQuantity: row.countedQuantity || 0,
    variance: row.variance || 0,
  };
}

export const inventoryCountRepository = {
  findAll(status?: string): Array<InventoryCount & { warehouseName: string; countedByName: string }> {
    let sql = `
      SELECT ic.*, w.name AS warehouseName, u.firstName || ' ' || u.lastName AS countedByName
      FROM inventory_count ic
      JOIN warehouse w ON w.id = ic.warehouseId
      JOIN users u ON u.id = ic.countedBy
      WHERE 1=1
    `;
    const params: any[] = [];
    if (status) { sql += ' AND ic.status = ?'; params.push(status); }
    sql += ' ORDER BY ic.createdAt DESC';
    return (db.prepare(sql).all(...params) as any[]).map(row => ({
      ...mapCount(row),
      warehouseName: row.warehouseName,
      countedByName: row.countedByName,
    }));
  },

  findById(id: number): InventoryCount | null {
    const row = db.prepare('SELECT * FROM inventory_count WHERE id = ?').get(id) as any;
    return row ? mapCount(row) : null;
  },

  create(data: { warehouseId: number; countedBy: number; notes?: string }): number {
    const now = new Date().toISOString();
    const countNumber = `IC-${String(data.countedBy).padStart(2, '0')}-${Date.now().toString().slice(-6)}`;
    const result = db.prepare(`
      INSERT INTO inventory_count (countNumber, warehouseId, countedBy, status, notes, createdAt, updatedAt)
      VALUES (?, ?, ?, 'draft', ?, ?, ?)
    `).run(countNumber, data.warehouseId, data.countedBy, data.notes || '', now, now);
    return result.lastInsertRowid as number;
  },

  /** Seeds the count sheet with every stock-keeping unit in the warehouse (system quantities). */
  addLinesForWarehouse(countId: number, warehouseId: number): void {
    const rows = db.prepare(`
      SELECT pws.productId, pws.quantity
      FROM product_warehouse_stock pws
      JOIN product p ON p.id = pws.productId
      WHERE pws.warehouseId = ? AND p.itemType = 'stock'
      ORDER BY p.name
    `).all(warehouseId) as { productId: number; quantity: number }[];
    const stmt = db.prepare(`
      INSERT INTO inventory_count_line (countId, productId, systemQuantity, countedQuantity, variance)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const row of rows) {
      stmt.run(countId, row.productId, row.quantity, row.quantity, 0);
    }
  },

  findLines(countId: number): InventoryCountLine[] {
    return (db.prepare(`
      SELECT icl.*, p.name AS productName, p.code AS productCode
      FROM inventory_count_line icl
      JOIN product p ON p.id = icl.productId
      WHERE icl.countId = ?
      ORDER BY p.name ASC
    `).all(countId) as any[]).map(mapLine);
  },

  getWarehouseStock(warehouseId: number): Array<ProductWarehouseStock & { productName: string; productCode: string }> {
    return (db.prepare(`
      SELECT pws.*, p.name AS productName, p.code AS productCode
      FROM product_warehouse_stock pws
      JOIN product p ON p.id = pws.productId
      WHERE pws.warehouseId = ? AND p.itemType = 'stock'
      ORDER BY p.name
    `).all(warehouseId) as any[]).map((row: any) => ({ ...row, reservedQuantity: row.reservedQuantity || 0, available: (row.quantity || 0) - (row.reservedQuantity || 0) }));
  },

  /** Sets a counted quantity and recomputes the variance vs system quantity. */
  setCountedQuantity(lineId: number, countedQuantity: number): void {
    const line = db.prepare('SELECT * FROM inventory_count_line WHERE id = ?').get(lineId) as any;
    if (!line) return;
    const variance = countedQuantity - line.systemQuantity;
    db.prepare('UPDATE inventory_count_line SET countedQuantity=?, variance=? WHERE id=?').run(countedQuantity, variance, lineId);
  },

  updateStatus(id: number, status: InventoryCount['status'], countedAt?: string): void {
    const now = new Date().toISOString();
    if (countedAt) {
      db.prepare('UPDATE inventory_count SET status=?, countedAt=?, updatedAt=? WHERE id=?').run(status, countedAt, now, id);
    } else {
      db.prepare('UPDATE inventory_count SET status=?, updatedAt=? WHERE id=?').run(status, now, id);
    }
  },
};
