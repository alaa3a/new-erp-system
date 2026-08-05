import { db } from '../db';
import { agingService } from './agingService';

export const reportingService = {
  getTrialBalance(periodId?: number): any[] {
    let sql = `
      SELECT el.accountCode, a.name AS accountName, a.type AS accountType,
        SUM(el.debitAmount) AS totalDebit,
        SUM(el.creditAmount) AS totalCredit
      FROM entry_line el
      JOIN account a ON a.code = el.accountCode
      JOIN entry e ON e.id = el.entryId
      WHERE e.status = 'posted'
    `;
    const params: any[] = [];
    if (periodId) { sql += ' AND e.periodId = ?'; params.push(periodId); }
    sql += ' GROUP BY el.accountCode ORDER BY el.accountCode ASC';
    const rows = db.prepare(sql).all(...params) as any[];
    const totalDebit = rows.reduce((s: number, r: any) => s + r.totalDebit, 0);
    const totalCredit = rows.reduce((s: number, r: any) => s + r.totalCredit, 0);
    return { rows, totalDebit, totalCredit } as any;
  },

  getIncomeStatement(startDate: string, endDate: string): any[] {
    return db.prepare(`
      SELECT el.accountCode, a.name AS accountName, a.type AS accountType,
        SUM(el.debitAmount) AS totalDebit, SUM(el.creditAmount) AS totalCredit,
        SUM(el.creditAmount - el.debitAmount) AS netAmount
      FROM entry_line el
      JOIN account a ON a.code = el.accountCode
      JOIN entry e ON e.id = el.entryId
      WHERE e.status = 'posted' AND e.entryDate BETWEEN ? AND ?
        AND a.type IN ('revenue', 'expense')
      GROUP BY el.accountCode
      ORDER BY a.type, el.accountCode ASC
    `).all(startDate, endDate);
  },

  getBalanceSheet(asOfDate: string): any[] {
    return db.prepare(`
      SELECT el.accountCode, a.name AS accountName, a.type AS accountType,
        SUM(el.debitAmount - el.creditAmount) AS balance
      FROM entry_line el
      JOIN account a ON a.code = el.accountCode
      JOIN entry e ON e.id = el.entryId
      WHERE e.status = 'posted' AND e.entryDate <= ?
        AND a.type IN ('asset', 'liability', 'equity')
      GROUP BY el.accountCode
      ORDER BY a.type, el.accountCode ASC
    `).all(asOfDate);
  },

  /**
   * General ledger with optional account / cost-center / partner / line-type
   * filters (Phase 9) — powers the ledger page, the partner ledger and the
   * cost-center ledger without scanning full tables.
   */
  getGeneralLedger(startDate?: string, endDate?: string, filters?: { accountCode?: string; costCenterId?: number; businessPartnerId?: number; employeeId?: number; lineType?: string }): any[] {
    let sql = `
      SELECT e.entryNumber, e.entryDate, e.description AS entryDescription,
        el.accountCode, a.name AS accountName, el.description AS lineDescription,
        el.debitAmount, el.creditAmount, el.vatAmount,
        el.costCenterId, el.businessPartnerId, el.employeeId, el.lineType,
        cc.name AS costCenterName, bp.name AS partnerName, emp.name AS employeeName
      FROM entry_line el
      JOIN account a ON a.code = el.accountCode
      JOIN entry e ON e.id = el.entryId
      LEFT JOIN cost_center cc ON cc.id = el.costCenterId
      LEFT JOIN business_partner bp ON bp.id = el.businessPartnerId
      LEFT JOIN employee emp ON emp.id = el.employeeId
      WHERE e.status = 'posted'
    `;
    const params: any[] = [];
    if (startDate) { sql += ' AND e.entryDate >= ?'; params.push(startDate); }
    if (endDate) { sql += ' AND e.entryDate <= ?'; params.push(endDate); }
    if (filters?.accountCode) { sql += ' AND el.accountCode = ?'; params.push(filters.accountCode); }
    if (filters?.costCenterId) { sql += ' AND el.costCenterId = ?'; params.push(filters.costCenterId); }
    if (filters?.businessPartnerId) { sql += ' AND el.businessPartnerId = ?'; params.push(filters.businessPartnerId); }
    if (filters?.employeeId) { sql += ' AND el.employeeId = ?'; params.push(filters.employeeId); }
    if (filters?.lineType) { sql += ' AND el.lineType = ?'; params.push(filters.lineType); }
    sql += ' ORDER BY e.entryDate, e.entryNumber, el.lineNumber ASC';
    return db.prepare(sql).all(...params);
  },

  getCashFlowReport(startDate: string, endDate: string): { inflows: number; outflows: number; netCashFlow: number; byAccount: Array<{ accountCode: string; accountName: string; inflows: number; outflows: number; net: number }> } {
    const rows = db.prepare(`
      SELECT el.accountCode, a.name AS accountName,
        SUM(el.debitAmount) AS totalDebit,
        SUM(el.creditAmount) AS totalCredit,
        SUM(el.debitAmount - el.creditAmount) AS net
      FROM entry_line el
      JOIN account a ON a.code = el.accountCode
      JOIN entry e ON e.id = el.entryId
      WHERE e.status = 'posted' AND e.entryDate BETWEEN ? AND ?
        AND a.type = 'asset'
        AND (a.name LIKE '%Cash%' OR a.name LIKE '%Bank%' OR a.code LIKE '101%')
      GROUP BY el.accountCode
      ORDER BY el.accountCode ASC
    `).all(startDate, endDate) as Array<{ accountCode: string; accountName: string; totalDebit: number; totalCredit: number; net: number }>;

    let inflows = 0;
    let outflows = 0;
    const byAccount = rows.map(r => {
      inflows += r.totalDebit;
      outflows += r.totalCredit;
      return {
        accountCode: r.accountCode,
        accountName: r.accountName,
        inflows: r.totalDebit,
        outflows: r.totalCredit,
        net: r.net,
      };
    });

    return { inflows, outflows, netCashFlow: inflows - outflows, byAccount };
  },

  getPartnerAging: () => agingService.calculatePartnerAging(),
  getInventoryValuation: () => db.prepare(`SELECT p.code, p.name, w.name AS warehouseName, pws.quantity, pws.averageCost, (pws.quantity * pws.averageCost) AS totalValue FROM product_warehouse_stock pws JOIN product p ON p.id = pws.productId JOIN warehouse w ON w.id = pws.warehouseId WHERE p.itemType = 'stock' AND pws.quantity > 0 ORDER BY p.name`).all() as any[],
  getTaxSummary: (startDate?: string, endDate?: string) => {
    let sql = `SELECT el.vatCodeId, tc.code AS taxCode, tc.name AS taxName, tc.rate AS taxRate, tc.type AS taxType, SUM(el.vatAmount) AS totalVat FROM entry_line el LEFT JOIN tax_code tc ON tc.id = el.vatCodeId JOIN entry e ON e.id = el.entryId WHERE e.status = 'posted' AND el.vatAmount > 0`;
    const params: any[] = [];
    if (startDate) { sql += ' AND e.entryDate >= ?'; params.push(startDate); }
    if (endDate) { sql += ' AND e.entryDate <= ?'; params.push(endDate); }
    sql += ' GROUP BY el.vatCodeId ORDER BY tc.type, tc.code ASC';
    return db.prepare(sql).all(...params) as any[];
  },

  /**
   * Captured tax-detail rows (Phase 6) — the individual documents behind each
   * VAT code: entry number/date, supplier name/tax id, invoice #/date and any
   * user-created `taxDetailsJson` extras. Powers the expandable details on the
   * tax-summary page (manual journal-entry side).
   */
  getTaxSummaryDetails: (startDate?: string, endDate?: string, vatCodeId?: number) => {
    let sql = `
      SELECT el.vatCodeId, tc.code AS taxCode, tc.name AS taxName,
        e.entryNumber, e.entryDate, e.description AS entryDescription,
        el.description AS lineDescription,
        el.supplierName, el.supplierTaxId, el.invoiceNumber, el.invoiceDate,
        el.taxDetailsJson, el.vatAmount
      FROM entry_line el
      JOIN entry e ON e.id = el.entryId
      LEFT JOIN tax_code tc ON tc.id = el.vatCodeId
      WHERE e.status = 'posted' AND el.vatAmount > 0 AND el.vatCodeId IS NOT NULL
    `;
    const params: any[] = [];
    if (startDate) { sql += ' AND e.entryDate >= ?'; params.push(startDate); }
    if (endDate) { sql += ' AND e.entryDate <= ?'; params.push(endDate); }
    if (vatCodeId) { sql += ' AND el.vatCodeId = ?'; params.push(vatCodeId); }
    sql += ' ORDER BY tc.code, e.entryDate DESC, e.entryNumber ASC';
    return db.prepare(sql).all(...params) as any[];
  },

  // Invoice-line based tax summary (taxable + tax amounts per VAT code,
  // filtered by invoice date). Shared by the /api/reports/tax-summary route
  // and the tax-summary export so they always agree.
  getInvoiceTaxSummary: (startDate?: string, endDate?: string) => {
    const taxCodes = db.prepare(`SELECT id, code, name, rate, parentId, isGroup, filingPeriod FROM tax_code`).all() as { id: number; code: string; name: string; rate: number; parentId: number | null; isGroup: number; filingPeriod: string }[];
    const taxCodeMap = new Map(taxCodes.map(tc => [tc.id, tc]));
    const resolveGroup = (parentId: number | null) => {
      if (!parentId) return null;
      const parent = taxCodeMap.get(parentId);
      return parent && parent.isGroup === 1 ? parent : null;
    };

    let sql = `
      SELECT il.vatCodeId,
        SUM(il.lineTotal) AS taxableAmount,
        SUM(il.vatAmount) AS taxAmount,
        COUNT(DISTINCT il.invoiceId) AS invoiceCount,
        MAX(il.vatRate) AS vatRate
      FROM invoice_line il
      JOIN invoice i ON i.id = il.invoiceId
      WHERE il.vatCodeId IS NOT NULL
    `;
    const params: any[] = [];
    if (startDate) { sql += ' AND i.invoiceDate >= ?'; params.push(startDate); }
    if (endDate) { sql += ' AND i.invoiceDate <= ?'; params.push(endDate); }
    sql += ' GROUP BY il.vatCodeId';

    const rows = db.prepare(sql).all(...params) as { vatCodeId: number; taxableAmount: number; taxAmount: number; invoiceCount: number; vatRate: number | null }[];

    return rows.map(r => {
      const tc = taxCodeMap.get(r.vatCodeId);
      const group = tc ? resolveGroup(tc.parentId) : null;
      return {
        vatCode: tc?.code || `code-${r.vatCodeId}`,
        vatName: tc?.name || `Tax Code #${r.vatCodeId}`,
        rate: tc?.rate ?? r.vatRate ?? 0,
        taxableAmount: Math.round(r.taxableAmount * 100) / 100,
        taxAmount: Math.round(r.taxAmount * 100) / 100,
        invoiceCount: r.invoiceCount,
        groupName: group?.name || 'Ungrouped',
        filingPeriod: group?.filingPeriod || '',
      };
    }).sort((a, b) => {
      const g = a.groupName.localeCompare(b.groupName);
      return g !== 0 ? g : a.vatCode.localeCompare(b.vatCode);
    });
  },
};
