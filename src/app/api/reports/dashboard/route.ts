import { NextRequest, NextResponse } from 'next/server';
import { db, ensureInitialized } from '@/lib/db';
import { handleApiError } from '@/lib/utils/errors';

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized();
    const { searchParams } = new URL(request.url);

    // Revenue from posted entries (revenue accounts credit - debit)
    const revenueRow = db.prepare(`
      SELECT COALESCE(SUM(creditAmount - debitAmount), 0) AS total
      FROM entry_line el
      JOIN entry e ON e.id = el.entryId
      JOIN account a ON a.code = el.accountCode
      WHERE e.status = 'posted' AND a.type = 'revenue'
    `).get() as any;

    // Expenses from posted entries (expense accounts debit - credit)
    const expenseRow = db.prepare(`
      SELECT COALESCE(SUM(debitAmount - creditAmount), 0) AS total
      FROM entry_line el
      JOIN entry e ON e.id = el.entryId
      JOIN account a ON a.code = el.accountCode
      WHERE e.status = 'posted' AND a.type = 'expense'
    `).get() as any;

    // Total accounts
    const acctCount = (db.prepare('SELECT count(1) AS count FROM account WHERE isActive = 1').get() as any).count;
    const partnerCount = (db.prepare("SELECT count(1) AS count FROM business_partner WHERE status = 'active'").get() as any).count;
    const productCount = (db.prepare('SELECT count(1) AS count FROM product WHERE isActive = 1').get() as any).count;
    const invoiceCount = (db.prepare('SELECT count(1) AS count FROM invoice').get() as any).count;

    // Open invoices (draft, posted, partial_paid with balance)
    const openInvoices = db.prepare(`
      SELECT i.id, i.invoiceNumber, i.type, i.status, i.totalAmount, i.paidAmount,
        (i.totalAmount - i.paidAmount) AS balanceDue,
        i.invoiceDate, i.dueDate, i.partnerName,
        CAST(julianday('now') - julianday(i.dueDate) AS INTEGER) AS daysOverdue
      FROM invoice i
      WHERE i.status IN ('draft', 'posted', 'partial_paid')
        AND i.totalAmount > i.paidAmount
      ORDER BY i.dueDate ASC
      LIMIT 10
    `).all();

    // Aging summary
    const agingRow = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN i.dueDate >= date('now') THEN i.totalAmount - i.paidAmount ELSE 0 END), 0) AS current,
        COALESCE(SUM(CASE WHEN julianday('now') - julianday(i.dueDate) BETWEEN 1 AND 30 THEN i.totalAmount - i.paidAmount ELSE 0 END), 0) AS days1_30,
        COALESCE(SUM(CASE WHEN julianday('now') - julianday(i.dueDate) BETWEEN 31 AND 60 THEN i.totalAmount - i.paidAmount ELSE 0 END), 0) AS days31_60,
        COALESCE(SUM(CASE WHEN julianday('now') - julianday(i.dueDate) BETWEEN 61 AND 90 THEN i.totalAmount - i.paidAmount ELSE 0 END), 0) AS days61_90,
        COALESCE(SUM(CASE WHEN julianday('now') - julianday(i.dueDate) > 90 THEN i.totalAmount - i.paidAmount ELSE 0 END), 0) AS days90_plus,
        COALESCE(SUM(i.totalAmount - i.paidAmount), 0) AS totalDue
      FROM invoice i
      WHERE i.status IN ('posted', 'partial_paid')
        AND i.totalAmount > i.paidAmount
    `).get() as any;

    // Recent posted entries
    const recentEntries = db.prepare(`
      SELECT entryNumber, entryDate, description, totalDebit, totalCredit
      FROM entry
      WHERE status = 'posted'
      ORDER BY createdAt DESC
      LIMIT 5
    `).all();

    return NextResponse.json({ success: true, data: {
      revenue: revenueRow.total,
      expenses: expenseRow.total,
      netIncome: revenueRow.total - expenseRow.total,
      counts: {
        accounts: acctCount,
        partners: partnerCount,
        products: productCount,
        invoices: invoiceCount,
      },
      openInvoices,
      aging: agingRow,
      recentEntries,
    }});
  } catch (error) {
    return handleApiError(error);
  }
}
