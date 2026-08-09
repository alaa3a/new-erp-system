import { db } from '../db';
import { PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine } from '@/types/erp';
import { generatePONumber, generateReceiptNumber } from '../utils/idGenerator';

function mapPO(row: any): PurchaseOrder {
  return {
    ...row,
    businessPartnerId: row.businessPartnerId || null,
    warehouseId: row.warehouseId || null,
    referenceNumber: row.referenceNumber || '',
    notes: row.notes || '',
    approvedBy: row.approvedBy || null,
    approvedAt: row.approvedAt || null,
    closedBy: row.closedBy || null,
    closedAt: row.closedAt || null,
    status: row.status as PurchaseOrder['status'],
  };
}

function mapPOLine(row: any): PurchaseOrderLine {
  return {
    ...row,
    warehouseId: row.warehouseId || null,
    costCenterId: row.costCenterId || null,
    accountCode: row.accountCode || '',
  };
}

export const purchaseOrderRepository = {
  findAll(status?: string, search?: string): PurchaseOrder[] {
    let sql = 'SELECT * FROM purchase_order WHERE 1=1';
    const params: any[] = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (search) { sql += ' AND (poNumber LIKE ? OR partnerName LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY createdAt DESC';
    return (db.prepare(sql).all(...params) as any[]).map(mapPO);
  },

  paginate(page: number, pageSize: number, status?: string, search?: string): { data: PurchaseOrder[]; total: number } {
    const offset = (page - 1) * pageSize;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (status) { where += ' AND status = ?'; params.push(status); }
    if (search) { where += ' AND (poNumber LIKE ? OR partnerName LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    const total = (db.prepare(`SELECT count(1) AS count FROM purchase_order ${where}`).get(...params) as any).count;
    const data = (db.prepare(`SELECT * FROM purchase_order ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]).map(mapPO);
    return { data, total };
  },

  findById(id: number): PurchaseOrder | null {
    const row = db.prepare('SELECT * FROM purchase_order WHERE id = ?').get(id) as any;
    return row ? mapPO(row) : null;
  },

  findLines(poId: number): PurchaseOrderLine[] {
    return (db.prepare('SELECT * FROM purchase_order_line WHERE poId = ? ORDER BY lineNumber ASC').all(poId) as any[]).map(mapPOLine);
  },

  create(data: {
    partnerName: string; businessPartnerId?: number; orderDate: string; expectedDate: string;
    warehouseId?: number; referenceNumber?: string; notes?: string; createdBy: string;
  }): number {
    const now = new Date().toISOString();
    const poNumber = generatePONumber();
    const result = db.prepare(`
      INSERT INTO purchase_order (poNumber, status, businessPartnerId, partnerName, orderDate, expectedDate, warehouseId, referenceNumber, notes, createdBy, createdAt, updatedAt, version)
      VALUES (?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      poNumber, data.businessPartnerId || null, data.partnerName,
      data.orderDate, data.expectedDate, data.warehouseId || null,
      data.referenceNumber || '', data.notes || '', data.createdBy, now, now,
    );
    return result.lastInsertRowid as number;
  },

  // VAT fields are optional at line creation (defaults 0 / null in the schema).
  addLine(line: Omit<PurchaseOrderLine, 'id' | 'createdAt' | 'updatedAt' | 'vatCodeId' | 'vatRate' | 'vatAmount'> & { vatCodeId?: number | null; vatRate?: number; vatAmount?: number }): number {
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO purchase_order_line (poId, lineNumber, productId, description, quantity, unitPrice, receivedQuantity, invoicedQuantity, discountPercent, vatCodeId, vatRate, vatAmount, lineTotal, lineType, warehouseId, costCenterId, accountCode, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      line.poId, line.lineNumber, line.productId, line.description, line.quantity,
      line.unitPrice, line.receivedQuantity || 0, line.invoicedQuantity || 0,
      line.discountPercent || 0, line.vatCodeId ?? null, line.vatRate || 0, line.vatAmount || 0,
      line.lineTotal, line.lineType || 'stock', line.warehouseId,
      line.costCenterId, line.accountCode, now, now,
    );
    return result.lastInsertRowid as number;
  },

  updateTotals(id: number, subtotal: number, totalAmount: number): void {
    const now = new Date().toISOString();
    db.prepare('UPDATE purchase_order SET subtotal=?, vatAmount=0, totalAmount=?, updatedAt=? WHERE id=?').run(subtotal, totalAmount, now, id);
  },

  updateStatus(id: number, status: PurchaseOrder['status'], userId?: string): void {
    const now = new Date().toISOString();
    if (status === 'approved') {
      db.prepare('UPDATE purchase_order SET status=?, approvedBy=?, approvedAt=?, updatedAt=?, version=version+1 WHERE id=?').run(status, userId, now, now, id);
    } else if (status === 'closed') {
      db.prepare('UPDATE purchase_order SET status=?, closedBy=?, closedAt=?, updatedAt=?, version=version+1 WHERE id=?').run(status, userId, now, now, id);
    } else {
      db.prepare('UPDATE purchase_order SET status=?, updatedAt=?, version=version+1 WHERE id=?').run(status, now, id);
    }
  },

  deleteLines(poId: number): void {
    db.prepare('DELETE FROM purchase_order_line WHERE poId = ?').run(poId);
  },

  // ─── Goods Receipt ──────────────────────────────────────────────────

  createReceipt(data: { poId: number; receiptDate: string; warehouseId: number; notes?: string; createdBy: string }): number {
    const now = new Date().toISOString();
    const receiptNumber = generateReceiptNumber();
    const result = db.prepare(`
      INSERT INTO goods_receipt (receiptNumber, poId, status, receiptDate, warehouseId, notes, createdBy, createdAt, updatedAt)
      VALUES (?, ?, 'full', ?, ?, ?, ?, ?, ?)
    `).run(receiptNumber, data.poId, data.receiptDate, data.warehouseId, data.notes || '', data.createdBy, now, now);
    return result.lastInsertRowid as number;
  },

  addReceiptLine(line: Omit<GoodsReceiptLine, 'id' | 'createdAt'>): number {
    const result = db.prepare(`
      INSERT INTO goods_receipt_line (receiptId, poLineId, productId, description, quantity, unitCost, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(line.receiptId, line.poLineId, line.productId, line.description || '', line.quantity, line.unitCost, new Date().toISOString());
    return result.lastInsertRowid as number;
  },

  updatePOReceivedQuantity(poLineId: number, totalReceived: number): void {
    db.prepare('UPDATE purchase_order_line SET receivedQuantity = ? WHERE id = ?').run(totalReceived, poLineId);
  },

  findReceiptsByPO(poId: number): GoodsReceipt[] {
    return db.prepare('SELECT * FROM goods_receipt WHERE poId = ? ORDER BY createdAt DESC').all(poId) as any[];
  },

  findReceiptLines(receiptId: number): GoodsReceiptLine[] {
    return db.prepare('SELECT * FROM goods_receipt_line WHERE receiptId = ? ORDER BY createdAt ASC').all(receiptId) as any[];
  },

  getReceiptsWithLines(poId: number): Array<GoodsReceipt & { lines: GoodsReceiptLine[] }> {
    const receipts = this.findReceiptsByPO(poId);
    return receipts.map(r => ({ ...r, lines: this.findReceiptLines(r.id) }));
  },

  // ─── Three-way Matching ─────────────────────────────────────────────

  updatePOInvoicedQuantity(poLineId: number, totalInvoiced: number): void {
    db.prepare('UPDATE purchase_order_line SET invoicedQuantity = ? WHERE id = ?').run(totalInvoiced, poLineId);
  },

  getMatchingStatus(poId: number): Array<{
    lineId: number; productId: number; description: string;
    orderedQty: number; receivedQty: number; invoicedQty: number;
    unitPrice: number; status: 'under_received' | 'over_received' | 'matched' | 'under_invoiced' | 'over_invoiced';
  }> {
    const lines = this.findLines(poId);
    return lines.map(l => {
      let status: string;
      if (l.receivedQuantity < l.quantity) status = 'under_received';
      else if (l.receivedQuantity === l.quantity) status = 'matched';
      else status = 'over_received';

      if (status === 'matched' && l.invoicedQuantity < l.quantity) status = 'under_invoiced';
      else if (status === 'matched' && l.invoicedQuantity > l.quantity) status = 'over_invoiced';

      return {
        lineId: l.id, productId: l.productId, description: l.description,
        orderedQty: l.quantity, receivedQty: l.receivedQuantity,
        invoicedQty: l.invoicedQuantity, unitPrice: l.unitPrice,
        status: status as any,
      };
    });
  },
};
