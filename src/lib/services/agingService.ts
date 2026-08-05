import { db } from '../db';

export const agingService = {
  calculatePartnerAging(partnerId?: number): any[] {
    let sql = `
      SELECT bp.id, bp.code, bp.name, bp.type,
        SUM(CASE WHEN julianday('now') - julianday(i.dueDate) <= 0 THEN i.totalAmount - i.paidAmount ELSE 0 END) AS current,
        SUM(CASE WHEN julianday('now') - julianday(i.dueDate) BETWEEN 1 AND 30 THEN i.totalAmount - i.paidAmount ELSE 0 END) AS days1_30,
        SUM(CASE WHEN julianday('now') - julianday(i.dueDate) BETWEEN 31 AND 60 THEN i.totalAmount - i.paidAmount ELSE 0 END) AS days31_60,
        SUM(CASE WHEN julianday('now') - julianday(i.dueDate) BETWEEN 61 AND 90 THEN i.totalAmount - i.paidAmount ELSE 0 END) AS days61_90,
        SUM(CASE WHEN julianday('now') - julianday(i.dueDate) BETWEEN 91 AND 180 THEN i.totalAmount - i.paidAmount ELSE 0 END) AS days91_180,
        SUM(CASE WHEN julianday('now') - julianday(i.dueDate) > 180 THEN i.totalAmount - i.paidAmount ELSE 0 END) AS days180_plus,
        SUM(i.totalAmount - i.paidAmount) AS totalDue
      FROM business_partner bp
      JOIN invoice i ON i.businessPartnerId = bp.id
      WHERE i.status IN ('draft', 'posted', 'partial_paid')
        AND bp.status = 'active'
        AND i.totalAmount > i.paidAmount
    `;
    const params: any[] = [];
    if (partnerId) { sql += ' AND bp.id = ?'; params.push(partnerId); }
    sql += ' GROUP BY bp.id ORDER BY bp.name ASC';
    return db.prepare(sql).all(...params);
  },

  getOverdueReceivables(): any[] {
    return db.prepare(`
      SELECT bp.id, bp.code, bp.name, i.id AS invoiceId, i.invoiceNumber, i.invoiceDate, i.dueDate,
        (i.totalAmount - i.paidAmount) AS balance,
        CAST(julianday('now') - julianday(i.dueDate) AS INTEGER) AS daysOverdue
      FROM business_partner bp
      JOIN invoice i ON i.businessPartnerId = bp.id
      WHERE i.type IN ('sales', 'debit_note')
        AND i.status IN ('draft', 'posted', 'partial_paid')
        AND i.totalAmount > i.paidAmount
        AND i.dueDate < date('now')
      ORDER BY i.dueDate ASC
    `).all();
  },

  getOverduePayables(): any[] {
    return db.prepare(`
      SELECT bp.id, bp.code, bp.name, i.id AS invoiceId, i.invoiceNumber, i.invoiceDate, i.dueDate,
        (i.totalAmount - i.paidAmount) AS balance,
        CAST(julianday('now') - julianday(i.dueDate) AS INTEGER) AS daysOverdue
      FROM business_partner bp
      JOIN invoice i ON i.businessPartnerId = bp.id
      WHERE i.type IN ('purchase', 'credit_note')
        AND i.status IN ('draft', 'posted', 'partial_paid')
        AND i.totalAmount > i.paidAmount
        AND i.dueDate < date('now')
      ORDER BY i.dueDate ASC
    `).all();
  },

  getOpenInvoices(): any[] {
    return db.prepare(`
      SELECT i.*, bp.name AS partnerName
      FROM invoice i
      LEFT JOIN business_partner bp ON bp.id = i.businessPartnerId
      WHERE i.status IN ('draft', 'posted', 'partial_paid')
        AND i.totalAmount > i.paidAmount
      ORDER BY i.dueDate ASC
    `).all();
  },
};
