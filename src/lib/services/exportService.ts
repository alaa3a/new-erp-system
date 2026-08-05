import { reportingService } from './reportingService';

// ─── CSV Helpers ───────────────────────────────────────────────────────

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(values: unknown[]): string {
  return values.map(escapeCsv).join(',') + '\n';
}

function formatCurrency(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ─── HTML (Excel .xls) Helpers ─────────────────────────────────────────

function htmlTable(headers: string[], rows: string[][]): string {
  const thead = `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<table border="1">${thead}${tbody}</table>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function xlsDocument(title: string, tables: string[]): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head><body><h2>${escapeHtml(title)}</h2>${tables.join('<br/><br/>')}</body></html>`;
}

// ─── Export Services ────────────────────────────────────────────────────

export const exportService = {

  trialBalance(format: 'csv' | 'xls', periodId?: number): { content: string; filename: string; contentType: string } {
    const data = reportingService.getTrialBalance(periodId) as any;
    const rows: any[] = data.rows || [];
    const totalDebit = data.totalDebit as number;
    const totalCredit = data.totalCredit as number;

    const headers = ['Code', 'Account Name', 'Type', 'Debit', 'Credit'];
    const filename = `trial-balance-${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
      let csv = csvRow(headers);
      for (const r of rows) {
        csv += csvRow([r.accountCode, r.accountName, r.accountType, formatCurrency(r.totalDebit), formatCurrency(r.totalCredit)]);
      }
      csv += csvRow(['', '', 'TOTAL', formatCurrency(totalDebit), formatCurrency(totalCredit)]);
      return { content: csv, filename: `${filename}.csv`, contentType: 'text/csv; charset=utf-8' };
    }

    const table = htmlTable(headers, rows.map((r: any) => [
      r.accountCode, r.accountName, r.accountType, formatCurrency(r.totalDebit), formatCurrency(r.totalCredit),
    ]));
    const totals = htmlTable(
      ['', '', 'TOTAL', formatCurrency(totalDebit), formatCurrency(totalCredit)],
      [[formatCurrency(totalDebit), formatCurrency(totalCredit)]]
    );
    return { content: xlsDocument('Trial Balance', [table, totals]), filename: `${filename}.xls`, contentType: 'application/vnd.ms-excel; charset=utf-8' };
  },

  incomeStatement(format: 'csv' | 'xls', startDate: string, endDate: string): { content: string; filename: string; contentType: string } {
    const rows: any[] = reportingService.getIncomeStatement(startDate, endDate) as any[] || [];

    const revenueRows = rows.filter((r: any) => r.accountType === 'revenue');
    const expenseRows = rows.filter((r: any) => r.accountType === 'expense');
    const totalRevenue = revenueRows.reduce((s: number, r: any) => s + r.netAmount, 0);
    const totalExpenses = expenseRows.reduce((s: number, r: any) => s + Math.abs(r.netAmount), 0);
    const netIncome = totalRevenue - totalExpenses;
    const netMargin = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0;

    const filename = `income-statement-${startDate}-to-${endDate}`;

    if (format === 'csv') {
      let csv = csvRow(['Income Statement', `${startDate} to ${endDate}`, '', '', '']);
      csv += '\n';
      csv += csvRow(['REVENUE', '', '', '', '']);
      csv += csvRow(['Code', 'Account Name', '', '', 'Amount']);
      for (const r of revenueRows) {
        csv += csvRow([r.accountCode, r.accountName, '', '', formatCurrency(r.netAmount)]);
      }
      csv += csvRow(['', '', '', 'Total Revenue', formatCurrency(totalRevenue)]);
      csv += '\n';
      csv += csvRow(['EXPENSES', '', '', '', '']);
      csv += csvRow(['Code', 'Account Name', '', '', 'Amount']);
      for (const r of expenseRows) {
        csv += csvRow([r.accountCode, r.accountName, '', '', formatCurrency(Math.abs(r.netAmount))]);
      }
      csv += csvRow(['', '', '', 'Total Expenses', formatCurrency(totalExpenses)]);
      csv += '\n';
      csv += csvRow(['', '', '', 'Net Income', formatCurrency(netIncome)]);
      csv += csvRow(['', '', '', 'Net Margin', `${netMargin.toFixed(1)}%`]);
      return { content: csv, filename: `${filename}.csv`, contentType: 'text/csv; charset=utf-8' };
    }

    const revTable = htmlTable(
      ['Code', 'Account Name', 'Amount'],
      revenueRows.map((r: any) => [r.accountCode, r.accountName, formatCurrency(r.netAmount)])
    ) + htmlTable(['Total Revenue', '', formatCurrency(totalRevenue)], [['']]);

    const expTable = htmlTable(
      ['Code', 'Account Name', 'Amount'],
      expenseRows.map((r: any) => [r.accountCode, r.accountName, formatCurrency(Math.abs(r.netAmount))])
    ) + htmlTable(['Total Expenses', '', formatCurrency(totalExpenses)], [['']]);

    const summary = htmlTable(
      ['Metric', 'Value'],
      [
        ['Total Revenue', `$${formatCurrency(totalRevenue)}`],
        ['Total Expenses', `$${formatCurrency(totalExpenses)}`],
        ['Net Income', `$${formatCurrency(netIncome)}`],
        ['Net Margin', `${netMargin.toFixed(1)}%`],
      ]
    );

    return {
      content: xlsDocument(`Income Statement (${startDate} to ${endDate})`, ['<h3>Revenue</h3>', revTable, '<h3>Expenses</h3>', expTable, '<h3>Summary</h3>', summary]),
      filename: `${filename}.xls`,
      contentType: 'application/vnd.ms-excel; charset=utf-8',
    };
  },

  balanceSheet(format: 'csv' | 'xls', asOfDate: string): { content: string; filename: string; contentType: string } {
    const rows: any[] = reportingService.getBalanceSheet(asOfDate) as any[] || [];

    const assetRows = rows.filter((r: any) => r.accountType === 'asset');
    const liabilityRows = rows.filter((r: any) => r.accountType === 'liability');
    const equityRows = rows.filter((r: any) => r.accountType === 'equity');

    const totalAssets = assetRows.reduce((s: number, r: any) => s + r.balance, 0);
    const totalLiabilities = liabilityRows.reduce((s: number, r: any) => s + r.balance, 0);
    const totalEquity = equityRows.reduce((s: number, r: any) => s + r.balance, 0);

    const filename = `balance-sheet-${asOfDate}`;

    if (format === 'csv') {
      let csv = csvRow(['Balance Sheet', `As of ${asOfDate}`, '', '']);
      csv += '\n';
      csv += csvRow(['ASSETS', '', '', '']);
      csv += csvRow(['Code', 'Account Name', '', 'Amount']);
      for (const r of assetRows) csv += csvRow([r.accountCode, r.accountName, '', formatCurrency(Math.abs(r.balance))]);
      csv += csvRow(['', '', 'Total Assets', formatCurrency(Math.abs(totalAssets))]);
      csv += '\n';
      csv += csvRow(['LIABILITIES', '', '', '']);
      csv += csvRow(['Code', 'Account Name', '', 'Amount']);
      for (const r of liabilityRows) csv += csvRow([r.accountCode, r.accountName, '', formatCurrency(Math.abs(r.balance))]);
      csv += csvRow(['', '', 'Total Liabilities', formatCurrency(Math.abs(totalLiabilities))]);
      csv += '\n';
      csv += csvRow(['EQUITY', '', '', '']);
      csv += csvRow(['Code', 'Account Name', '', 'Amount']);
      for (const r of equityRows) csv += csvRow([r.accountCode, r.accountName, '', formatCurrency(Math.abs(r.balance))]);
      csv += csvRow(['', '', 'Total Equity', formatCurrency(Math.abs(totalEquity))]);
      csv += '\n';
      csv += csvRow(['', '', 'Liabilities + Equity', formatCurrency(Math.abs(totalLiabilities + totalEquity))]);
      return { content: csv, filename: `${filename}.csv`, contentType: 'text/csv; charset=utf-8' };
    }

    const assetTable = htmlTable(['Code', 'Account Name', 'Amount'], assetRows.map((r: any) => [r.accountCode, r.accountName, formatCurrency(Math.abs(r.balance))]));
    const liabTable = htmlTable(['Code', 'Account Name', 'Amount'], liabilityRows.map((r: any) => [r.accountCode, r.accountName, formatCurrency(Math.abs(r.balance))]));
    const eqTable = htmlTable(['Code', 'Account Name', 'Amount'], equityRows.map((r: any) => [r.accountCode, r.accountName, formatCurrency(Math.abs(r.balance))]));
    const summary = htmlTable(['Section', 'Total'], [
      ['Assets', `$${formatCurrency(Math.abs(totalAssets))}`],
      ['Liabilities', `$${formatCurrency(Math.abs(totalLiabilities))}`],
      ['Equity', `$${formatCurrency(Math.abs(totalEquity))}`],
      ['Liabilities + Equity', `$${formatCurrency(Math.abs(totalLiabilities + totalEquity))}`],
    ]);

    return {
      content: xlsDocument(`Balance Sheet (${asOfDate})`, ['<h3>Assets</h3>', assetTable, '<h3>Liabilities</h3>', liabTable, '<h3>Equity</h3>', eqTable, '<h3>Summary</h3>', summary]),
      filename: `${filename}.xls`,
      contentType: 'application/vnd.ms-excel; charset=utf-8',
    };
  },

  ledger(format: 'csv' | 'xls', startDate: string, endDate: string, filters?: { accountCode?: string; costCenterId?: number; businessPartnerId?: number; lineType?: string }): { content: string; filename: string; contentType: string } {
    const rows: any[] = reportingService.getGeneralLedger(startDate, endDate, filters) as any[] || [];

    let runningBal = 0;
    const enriched = rows.map((r: any) => {
      runningBal += (r.debitAmount || 0) - (r.creditAmount || 0);
      return { ...r, runningBalance: runningBal };
    });

    const totalDebits = enriched.reduce((s: number, r: any) => s + (r.debitAmount || 0), 0);
    const totalCredits = enriched.reduce((s: number, r: any) => s + (r.creditAmount || 0), 0);

    const filename = `general-ledger-${startDate}-to-${endDate}`;

    const headers = ['Date', 'Entry #', 'Account Code', 'Account Name', 'Description', 'Debit', 'Credit', 'Running Balance'];
    const rowData = enriched.map((r: any) => [
      r.entryDate, r.entryNumber, r.accountCode, r.accountName,
      r.lineDescription || r.entryDescription,
      r.debitAmount > 0 ? formatCurrency(r.debitAmount) : '',
      r.creditAmount > 0 ? formatCurrency(r.creditAmount) : '',
      formatCurrency(r.runningBalance),
    ]);

    if (format === 'csv') {
      let csv = csvRow(headers);
      for (const r of rowData) csv += csvRow(r);
      csv += csvRow(['', '', '', '', 'TOTAL', formatCurrency(totalDebits), formatCurrency(totalCredits), '']);
      return { content: csv, filename: `${filename}.csv`, contentType: 'text/csv; charset=utf-8' };
    }

    const table = htmlTable(headers, rowData);
    const totals = htmlTable(
      ['', '', '', '', 'TOTAL', formatCurrency(totalDebits), formatCurrency(totalCredits), ''],
      [[formatCurrency(totalDebits), formatCurrency(totalCredits)]]
    );
    return {
      content: xlsDocument(`General Ledger (${startDate} to ${endDate})`, [table, totals]),
      filename: `${filename}.xls`,
      contentType: 'application/vnd.ms-excel; charset=utf-8',
    };
  },

  aging(format: 'csv' | 'xls'): { content: string; filename: string; contentType: string } {
    const partners: any[] = reportingService.getPartnerAging() as any[] || [];

    const filename = `aging-report-${new Date().toISOString().split('T')[0]}`;

    const headers = ['Partner Code', 'Partner Name', 'Current', '1-30 Days', '31-60 Days', '61-90 Days', '91-180 Days', '180+ Days', 'Total Due'];
    const rowData = partners.map((p: any) => [
      p.code, p.name,
      formatCurrency(p.current), formatCurrency(p.days1_30), formatCurrency(p.days31_60),
      formatCurrency(p.days61_90), formatCurrency(p.days91_180), formatCurrency(p.days180_plus),
      formatCurrency(p.totalDue),
    ]);

    const totals = ['', 'TOTAL',
      formatCurrency(partners.reduce((s: number, p: any) => s + (p.current || 0), 0)),
      formatCurrency(partners.reduce((s: number, p: any) => s + (p.days1_30 || 0), 0)),
      formatCurrency(partners.reduce((s: number, p: any) => s + (p.days31_60 || 0), 0)),
      formatCurrency(partners.reduce((s: number, p: any) => s + (p.days61_90 || 0), 0)),
      formatCurrency(partners.reduce((s: number, p: any) => s + (p.days91_180 || 0), 0)),
      formatCurrency(partners.reduce((s: number, p: any) => s + (p.days180_plus || 0), 0)),
      formatCurrency(partners.reduce((s: number, p: any) => s + (p.totalDue || 0), 0)),
    ];

    if (format === 'csv') {
      let csv = csvRow(headers);
      for (const r of rowData) csv += csvRow(r);
      csv += csvRow(totals);
      return { content: csv, filename: `${filename}.csv`, contentType: 'text/csv; charset=utf-8' };
    }

    const table = htmlTable(headers, rowData);
    const totalsRow = htmlTable(totals, [totals]);
    return {
      content: xlsDocument('Aging Report', [table, totalsRow]),
      filename: `${filename}.xls`,
      contentType: 'application/vnd.ms-excel; charset=utf-8',
    };
  },

  inventoryValuation(format: 'csv' | 'xls'): { content: string; filename: string; contentType: string } {
    const rows: any[] = reportingService.getInventoryValuation() as any[] || [];

    const filename = `inventory-valuation-${new Date().toISOString().split('T')[0]}`;

    const headers = ['Code', 'Product', 'Warehouse', 'Quantity', 'Avg Cost', 'Total Value'];
    const rowData = rows.map((r: any) => [
      r.code, r.name, r.warehouseName,
      r.quantity, formatCurrency(r.averageCost), formatCurrency(r.totalValue),
    ]);

    const totals = ['', 'TOTAL', '',
      rows.reduce((s: number, r: any) => s + (r.quantity || 0), 0),
      '', formatCurrency(rows.reduce((s: number, r: any) => s + (r.totalValue || 0), 0)),
    ];

    if (format === 'csv') {
      let csv = csvRow(headers);
      for (const r of rowData) csv += csvRow(r);
      csv += csvRow(totals);
      return { content: csv, filename: `${filename}.csv`, contentType: 'text/csv; charset=utf-8' };
    }

    const table = htmlTable(headers, rowData);
    const totalsRow = htmlTable(totals, [totals]);
    return {
      content: xlsDocument('Inventory Valuation', [table, totalsRow]),
      filename: `${filename}.xls`,
      contentType: 'application/vnd.ms-excel; charset=utf-8',
    };
  },

  taxSummary(format: 'csv' | 'xls', startDate?: string, endDate?: string): { content: string; filename: string; contentType: string } {
    const rows: any[] = reportingService.getInvoiceTaxSummary(startDate, endDate) as any[] || [];

    const filename = `tax-summary-${startDate || 'all'}-to-${endDate || 'all'}`;

    const headers = ['Group', 'VAT Code', 'Name', 'Rate', 'Taxable Amount', 'Tax Amount', 'Invoices'];
    const rowData = rows.map((r: any) => [
      r.groupName || 'Ungrouped', r.vatCode, r.vatName, `${r.rate}%`,
      formatCurrency(r.taxableAmount), formatCurrency(r.taxAmount), r.invoiceCount,
    ]);

    const totals = ['TOTAL', '', '', '',
      formatCurrency(rows.reduce((s: number, r: any) => s + (r.taxableAmount || 0), 0)),
      formatCurrency(rows.reduce((s: number, r: any) => s + (r.taxAmount || 0), 0)),
      rows.reduce((s: number, r: any) => s + (r.invoiceCount || 0), 0),
    ];

    // Captured detail rows (Phase 6): supplier name / tax id / invoice # + JSON extras
    const detailRows: any[] = reportingService.getTaxSummaryDetails(startDate, endDate) as any[] || [];
    const detailHeaders = ['Tax Code', 'Entry #', 'Entry Date', 'Supplier', 'Supplier Tax ID', 'Invoice #', 'Invoice Date', 'VAT Amount', 'Extra Details'];
    const detailData = detailRows.map((d: any) => {
      let extras = '';
      try {
        const obj = JSON.parse(d.taxDetailsJson || '{}');
        extras = Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(' | ');
      } catch { /* ignore */ }
      return [
        d.taxCode || `code-${d.vatCodeId}`, d.entryNumber, d.entryDate,
        d.supplierName || '', d.supplierTaxId || '', d.invoiceNumber || '', d.invoiceDate || '',
        formatCurrency(d.vatAmount), extras,
      ];
    });

    if (format === 'csv') {
      let csv = csvRow(headers);
      for (const r of rowData) csv += csvRow(r);
      csv += csvRow(totals);
      csv += '\n';
      csv += csvRow(['Captured Tax Details', '', '', '', '', '', '']);
      csv += csvRow(detailHeaders);
      for (const r of detailData) csv += csvRow(r);
      return { content: csv, filename: `${filename}.csv`, contentType: 'text/csv; charset=utf-8' };
    }

    const table = htmlTable(headers, rowData);
    const totalsRow = htmlTable(totals, [totals]);
    const detailsTable = detailData.length > 0
      ? '<h3>Captured Tax Details</h3>' + htmlTable(detailHeaders, detailData)
      : '';
    return {
      content: xlsDocument('Tax Summary', [table, totalsRow, detailsTable]),
      filename: `${filename}.xls`,
      contentType: 'application/vnd.ms-excel; charset=utf-8',
    };
  },
};
