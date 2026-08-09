import { db } from '../db';
import { Invoice, InvoiceLine } from '@/types/erp';
import { generateInvoiceNumber } from '../utils/idGenerator';

function mapInvoice(row: any): Invoice {
  return {
    ...row,
    status: row.status as Invoice['status'],
    type: row.type as Invoice['type'],
    businessPartnerId: row.businessPartnerId || null,
    postingProfileId: row.postingProfileId || null,
    paymentTermId: row.paymentTermId || null,
    linkedInvoiceId: row.linkedInvoiceId || null,
    warehouseId: row.warehouseId || null,
    notes: row.notes || '',
    referenceNumber: row.referenceNumber || '',
    paidAmount: row.paidAmount || 0,
    approvedBy: row.approvedBy || null,
    approvedAt: row.approvedAt || null,
    postedBy: row.postedBy || null,
    postedAt: row.postedAt || null,
    purchaseOrderId: row.purchaseOrderId || null,
  };
}

function mapLine(row: any): InvoiceLine {
  return {
    ...row,
    warehouseId: row.warehouseId || null,
    costCenterId: row.costCenterId || null,
    accountCode: row.accountCode || '',
    discountPercent: row.discountPercent || 0,
    vatCodeId: row.vatCodeId || null,
    lineType: row.lineType || 'stock',
    costAmount: row.costAmount || 0,
  };
}

export const invoiceRepository = {
  findAll(type?: string, status?: string, search?: string): Invoice[] {
    let sql = 'SELECT * FROM invoice WHERE 1=1';
    const params: any[] = [];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (search) { sql += ' AND (invoiceNumber LIKE ? OR partnerName LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY createdAt DESC';
    return (db.prepare(sql).all(...params) as any[]).map(mapInvoice);
  },

  paginate(page: number, pageSize: number, type?: string, status?: string, search?: string, businessPartnerId?: number, openOnly?: boolean): { data: Invoice[]; total: number } {
    const offset = (page - 1) * pageSize;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (type) { where += ' AND type = ?'; params.push(type); }
    if (status) { where += ' AND status = ?'; params.push(status); }
    if (search) { where += ' AND (invoiceNumber LIKE ? OR partnerName LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (businessPartnerId) { where += ' AND businessPartnerId = ?'; params.push(businessPartnerId); }
    if (openOnly) { where += " AND status IN ('posted', 'partial_paid') AND totalAmount > paidAmount"; }
    const total = (db.prepare(`SELECT count(1) AS count FROM invoice ${where}`).get(...params) as any).count;
    const data = (db.prepare(`SELECT * FROM invoice ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]).map(mapInvoice);
    return { data, total };
  },

  findById(id: number): Invoice | null {
    const row = db.prepare('SELECT * FROM invoice WHERE id = ?').get(id) as any;
    return row ? mapInvoice(row) : null;
  },

  findLines(invoiceId: number): InvoiceLine[] {
    return (db.prepare('SELECT * FROM invoice_line WHERE invoiceId = ? ORDER BY lineNumber ASC').all(invoiceId) as any[]).map(mapLine);
  },

  create(data: { type: Invoice['type']; businessPartnerId?: number; partnerName: string; postingProfileId?: number; invoiceDate: string; dueDate: string; paymentTermId?: number; warehouseId?: number; referenceNumber?: string; notes?: string; createdBy: string }): number {
    const now = new Date().toISOString();
    const invoiceNumber = generateInvoiceNumber(data.type);
    const result = db.prepare(`
      INSERT INTO invoice (invoiceNumber, type, status, businessPartnerId, partnerName, postingProfileId, invoiceDate, dueDate, paymentTermId, warehouseId, referenceNumber, notes, createdBy, createdAt, updatedAt, version)
      VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      invoiceNumber, data.type, data.businessPartnerId || null, data.partnerName,
      data.postingProfileId || null, data.invoiceDate, data.dueDate,
      data.paymentTermId || null, data.warehouseId || null,
      data.referenceNumber || '', data.notes || '', data.createdBy, now, now,
    );
    return result.lastInsertRowid as number;
  },

  // costAmount is optional at line creation (defaults to 0); it is captured
  // from the warehouse average cost at posting time (Task 46).
  addLine(line: Omit<InvoiceLine, 'id' | 'createdAt' | 'updatedAt' | 'costAmount'> & { costAmount?: number }): number {
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO invoice_line (invoiceId, lineNumber, productId, description, quantity, unitPrice, discountPercent, vatCodeId, vatRate, vatAmount, lineTotal, lineType, warehouseId, costCenterId, accountCode, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      line.invoiceId, line.lineNumber, line.productId, line.description, line.quantity,
      line.unitPrice, line.discountPercent || 0, line.vatCodeId, line.vatRate,
      line.vatAmount, line.lineTotal, line.lineType || 'stock', line.warehouseId,
      line.costCenterId, line.accountCode, now, now,
    );
    return result.lastInsertRowid as number;
  },

  updateTotals(id: number, subtotal: number, vatAmount: number, totalAmount: number): void {
    const now = new Date().toISOString();
    db.prepare('UPDATE invoice SET subtotal=?, vatAmount=?, totalAmount=?, updatedAt=? WHERE id=?').run(subtotal, vatAmount, totalAmount, now, id);
  },

  approve(id: number, userId: string): void {
    const now = new Date().toISOString();
    db.prepare('UPDATE invoice SET approvedBy=?, approvedAt=?, updatedAt=?, version=version+1 WHERE id=?').run(userId, now, now, id);
  },

  updateStatus(id: number, status: Invoice['status'], userId?: string): void {
    const now = new Date().toISOString();
    if (status === 'posted') {
      db.prepare('UPDATE invoice SET status=?, postedBy=?, postedAt=?, updatedAt=?, version=version+1 WHERE id=?').run(status, userId, now, now, id);
    } else {
      db.prepare('UPDATE invoice SET status=?, updatedAt=?, version=version+1 WHERE id=?').run(status, now, id);
    }
  },

  updatePaidAmount(id: number, paidAmount: number): void {
    const now = new Date().toISOString();
    db.prepare('UPDATE invoice SET paidAmount=?, updatedAt=? WHERE id=?').run(paidAmount, now, id);
  },

  deleteLines(invoiceId: number): void {
    db.prepare('DELETE FROM invoice_line WHERE invoiceId = ?').run(invoiceId);
  },

  /** Task 46 — captures the unit cost of a line at posting time. */
  updateLineCost(lineId: number, costAmount: number): void {
    db.prepare('UPDATE invoice_line SET costAmount = ? WHERE id = ?').run(costAmount, lineId);
  },
};
