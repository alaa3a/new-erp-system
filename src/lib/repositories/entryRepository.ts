import { db } from '../db';
import { Entry, EntryLine, EntryLinePaymentAllocation } from '@/types/erp';
import { generateEntryNumber } from '../utils/idGenerator';
import { fiscalPeriodRepository } from './fiscalPeriodRepository';
import { entryCategoryRepository } from './entryCategoryRepository';

function mapEntry(row: any): Entry {
  return {
    ...row,
    status: row.status as Entry['status'],
    linkedInvoiceId: row.linkedInvoiceId || null,
    periodId: row.periodId || null,
    costCenterId: row.costCenterId || null,
    categoryId: row.categoryId || null,
    referenceNumber: row.referenceNumber || '',
    postedBy: row.postedBy || null,
    postedAt: row.postedAt || null,
  };
}

function mapLine(row: any): EntryLine {
  return {
    ...row,
    description: row.description || '',
    businessPartnerId: row.businessPartnerId || null,
    costCenterId: row.costCenterId || null,
    vatCodeId: row.vatCodeId || null,
    vatAmount: row.vatAmount || 0,
    lineType: (row.lineType || 'normal') as EntryLine['lineType'],
    supplierName: row.supplierName || null,
    supplierTaxId: row.supplierTaxId || null,
    invoiceNumber: row.invoiceNumber || null,
    invoiceDate: row.invoiceDate || null,
    employeeId: row.employeeId || null,
    taxDetailsJson: row.taxDetailsJson || null,
  };
}

function mapAllocation(row: any): EntryLinePaymentAllocation {
  return {
    ...row,
    notes: row.notes || '',
  };
}

/**
 * Builds the shared WHERE fragment for entry filters.
 * `categoryId` semantics: undefined = no filter, a number = entries in that category.
 */
function buildEntryWhere(status?: string, search?: string, categoryId?: number): { where: string; params: any[] } {
  let where = 'WHERE 1=1';
  const params: any[] = [];
  if (status) { where += ' AND status = ?'; params.push(status); }
  if (search) { where += ' AND (entryNumber LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (categoryId !== undefined) {
    where += ' AND categoryId = ?';
    params.push(categoryId);
  }
  return { where, params };
}

export const entryRepository = {
  findAll(status?: string, search?: string, categoryId?: number): Entry[] {
    const { where, params } = buildEntryWhere(status, search, categoryId);
    const sql = `SELECT * FROM entry ${where} ORDER BY createdAt DESC`;
    return (db.prepare(sql).all(...params) as any[]).map(mapEntry);
  },

  paginate(page: number, pageSize: number, status?: string, search?: string, categoryId?: number): { data: Entry[]; total: number } {
    const offset = (page - 1) * pageSize;
    const { where, params } = buildEntryWhere(status, search, categoryId);
    const total = (db.prepare(`SELECT count(1) AS count FROM entry ${where}`).get(...params) as any).count;
    const data = (db.prepare(`SELECT * FROM entry ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]).map(mapEntry);
    return { data, total };
  },

  findById(id: number): Entry | null {
    const row = db.prepare('SELECT * FROM entry WHERE id = ?').get(id) as any;
    return row ? mapEntry(row) : null;
  },

  findLines(entryId: number): EntryLine[] {
    return (db.prepare('SELECT * FROM entry_line WHERE entryId = ? ORDER BY lineNumber ASC').all(entryId) as any[]).map(mapLine);
  },

  create(data: { entryDate: string; description: string; referenceNumber?: string; linkedInvoiceId?: number; periodId?: number; costCenterId?: number; categoryId?: number | null; createdBy: string }): number {
    const now = new Date().toISOString();
    // Per-category numbering (fallback: journal sequence) + period auto-assign
    const category = data.categoryId ? entryCategoryRepository.findById(data.categoryId) : null;
    const entryNumber = generateEntryNumber(category ? { id: category.id, code: category.code } : null);
    const periodId = data.periodId ?? fiscalPeriodRepository.findOpenPeriod(data.entryDate)?.id ?? null;
    const result = db.prepare(`
      INSERT INTO entry (entryNumber, status, entryDate, description, referenceNumber, categoryId, linkedInvoiceId, periodId, costCenterId, createdBy, createdAt, updatedAt, version)
      VALUES (?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      entryNumber, data.entryDate, data.description,
      data.referenceNumber || '', data.categoryId || null, data.linkedInvoiceId || null,
      periodId, data.costCenterId || null, data.createdBy, now, now,
    );
    return result.lastInsertRowid as number;
  },

  addLine(line: Omit<EntryLine, 'id' | 'createdAt'>): number {
    const result = db.prepare(`
      INSERT INTO entry_line (entryId, lineNumber, accountCode, description, debitAmount, creditAmount, businessPartnerId, costCenterId, employeeId, vatCodeId, vatAmount, lineType, supplierName, supplierTaxId, invoiceNumber, invoiceDate, taxDetailsJson, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      line.entryId, line.lineNumber, line.accountCode, line.description || '',
      line.debitAmount, line.creditAmount, line.businessPartnerId,
      line.costCenterId, line.employeeId, line.vatCodeId, line.vatAmount, line.lineType || 'normal',
      line.supplierName || null, line.supplierTaxId || null,
      line.invoiceNumber || null, line.invoiceDate || null,
      line.taxDetailsJson || null, new Date().toISOString(),
    );
    return result.lastInsertRowid as number;
  },

  // ── Payment allocations ──

  findAllocations(entryLineId: number): EntryLinePaymentAllocation[] {
    return (db.prepare('SELECT * FROM entry_line_payment_allocation WHERE entryLineId = ? ORDER BY id ASC').all(entryLineId) as any[]).map(mapAllocation);
  },

  findAllocationsForEntry(entryId: number): EntryLinePaymentAllocation[] {
    return (db.prepare(`
      SELECT a.* FROM entry_line_payment_allocation a
      JOIN entry_line l ON l.id = a.entryLineId
      WHERE l.entryId = ? ORDER BY a.id ASC
    `).all(entryId) as any[]).map(mapAllocation);
  },

  /** Replaces the allocations of a line (delete + insert). Call inside the entry save path. */
  replaceAllocations(entryLineId: number, allocations: { invoiceId: number; amount: number; notes?: string }[]): void {
    const now = new Date().toISOString();
    db.prepare('DELETE FROM entry_line_payment_allocation WHERE entryLineId = ?').run(entryLineId);
    const stmt = db.prepare('INSERT INTO entry_line_payment_allocation (entryLineId, invoiceId, amount, notes, createdAt) VALUES (?, ?, ?, ?, ?)');
    for (const a of allocations || []) {
      stmt.run(entryLineId, a.invoiceId, a.amount, a.notes || '', now);
    }
  },

  updateTotals(id: number, totalDebit: number, totalCredit: number): void {
    const now = new Date().toISOString();
    db.prepare('UPDATE entry SET totalDebit=?, totalCredit=?, updatedAt=? WHERE id=?').run(totalDebit, totalCredit, now, id);
  },

  updateStatus(id: number, status: Entry['status'], userId?: string): void {
    const now = new Date().toISOString();
    if (status === 'posted') {
      db.prepare('UPDATE entry SET status=?, postedBy=?, postedAt=?, updatedAt=?, version=version+1 WHERE id=?').run(status, userId, now, now, id);
    } else {
      db.prepare('UPDATE entry SET status=?, updatedAt=?, version=version+1 WHERE id=?').run(status, now, id);
    }
  },

  deleteLines(entryId: number): void {
    db.prepare('DELETE FROM entry_line_payment_allocation WHERE entryLineId IN (SELECT id FROM entry_line WHERE entryId = ?)').run(entryId);
    db.prepare('DELETE FROM entry_line WHERE entryId = ?').run(entryId);
  },

  delete(id: number): void {
    db.prepare('DELETE FROM entry WHERE id = ?').run(id);
  },

  findByLinkedInvoice(invoiceId: number): Entry[] {
    return (db.prepare('SELECT * FROM entry WHERE linkedInvoiceId = ? ORDER BY createdAt DESC').all(invoiceId) as any[]).map(mapEntry);
  },
};
