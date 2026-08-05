import { db } from '../db';
import { Account, AccountUsage, AccountLinkType, AccountPartnerFilter } from '@/types/erp';

export interface AccountLink {
  type: AccountLinkType | null;
  linkId: number | null;
  partnerFilter?: AccountPartnerFilter | null;
}

function mapRow(row: any): Account {
  return {
    ...row,
    isActive: row.isActive === 1,
    isSystemAccount: row.isSystemAccount === 1,
    parentId: row.parentId || null,
    costCenterId: row.costCenterId || null,
    linkType: row.linkType || null,
    linkId: row.linkId || null,
    linkPartnerFilter: row.linkPartnerFilter || null,
    description: row.description || '',
  };
}

export const accountRepository = {
  findAll(): Account[] {
    return (db.prepare('SELECT * FROM account WHERE deletedAt IS NULL AND isActive = 1 ORDER BY code ASC').all() as any[]).map(mapRow);
  },

  findHierarchy(): Account[] {
    return (db.prepare('SELECT * FROM account WHERE deletedAt IS NULL ORDER BY code ASC').all() as any[]).map(mapRow);
  },

  findById(id: number): Account | null {
    const row = db.prepare('SELECT * FROM account WHERE id = ?').get(id) as any;
    return row ? mapRow(row) : null;
  },

  findByCode(code: string): Account | null {
    const row = db.prepare('SELECT * FROM account WHERE code = ?').get(code) as any;
    return row ? mapRow(row) : null;
  },

  create(data: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'version'>): number {
    const now = new Date().toISOString();
    const result = db.prepare(
      'INSERT INTO account (code, name, type, parentId, costCenterId, linkType, linkId, linkPartnerFilter, isActive, isSystemAccount, description, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    ).run(
      data.code, data.name, data.type, data.parentId, data.costCenterId || null,
      data.linkType || null, data.linkId || null, data.linkPartnerFilter || null,
      data.isActive !== false ? 1 : 0,
      data.isSystemAccount ? 1 : 0, data.description || '', now, now,
    );
    return result.lastInsertRowid as number;
  },

  update(id: number, data: Partial<Account>, version: number): boolean {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];

    if (data.code !== undefined) { fields.push('code=?'); values.push(data.code); }
    if (data.name !== undefined) { fields.push('name=?'); values.push(data.name); }
    if (data.type !== undefined) { fields.push('type=?'); values.push(data.type); }
    if (data.parentId !== undefined) { fields.push('parentId=?'); values.push(data.parentId); }
    if (data.costCenterId !== undefined) { fields.push('costCenterId=?'); values.push(data.costCenterId); }
    if (data.linkType !== undefined) { fields.push('linkType=?'); values.push(data.linkType); }
    if (data.linkId !== undefined) { fields.push('linkId=?'); values.push(data.linkId); }
    if (data.linkPartnerFilter !== undefined) { fields.push('linkPartnerFilter=?'); values.push(data.linkPartnerFilter); }
    if (data.isActive !== undefined) { fields.push('isActive=?'); values.push(data.isActive ? 1 : 0); }
    if (data.description !== undefined) { fields.push('description=?'); values.push(data.description); }

    if (fields.length === 0) return false;

    fields.push('updatedAt=?');
    values.push(now);
    fields.push('version=version+1');
    values.push(id, version);

    const result = db.prepare(
      `UPDATE account SET ${fields.join(', ')} WHERE id=? AND version=?`
    ).run(...values);
    return result.changes > 0;
  },

  hardDelete(id: number, version: number): boolean {
    const result = db.prepare('DELETE FROM account WHERE id = ? AND version = ?').run(id, version);
    return result.changes > 0;
  },

  softDelete(id: number, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE account SET isActive=0, deletedAt=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(now, now, id, version);
    return result.changes > 0;
  },

  restore(id: number, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE account SET isActive=1, deletedAt=NULL, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(now, id, version);
    return result.changes > 0;
  },

  toggleActive(id: number, active: boolean, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE account SET isActive=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(active ? 1 : 0, now, id, version);
    return result.changes > 0;
  },

  cascadeToggleActive(accountId: number, active: boolean): void {
    (db.transaction(() => {
      const now = new Date().toISOString();
      const updateChildren = (parentId: number) => {
        const children = db.prepare('SELECT id FROM account WHERE parentId = ?').all(parentId) as any[];
        for (const child of children) {
          db.prepare('UPDATE account SET isActive=?, updatedAt=?, version=version+1 WHERE id=?').run(active ? 1 : 0, now, child.id);
          updateChildren(child.id);
        }
      };
      updateChildren(accountId);
    }))();
  },

  /**
   * Generalized account link (Phase 1): linkType 'cost_center' | 'partner' | 'employee'.
   * Keeps the legacy costCenterId column in sync for cost-center links. The AR/AP
   * role is now derived from linkPartnerFilter at runtime — nothing to persist.
   */
  linkAccount(id: number, link: AccountLink, version: number): boolean {
    const now = new Date().toISOString();
    const costCenterId = link.type === 'cost_center' ? link.linkId : null;
    const result = db.prepare(
      'UPDATE account SET linkType=?, linkId=?, linkPartnerFilter=?, costCenterId=?, updatedAt=?, version=version+1 WHERE id=? AND version=?'
    ).run(link.type || null, link.linkId || null, link.partnerFilter || null, costCenterId, now, id, version);
    return result.changes > 0;
  },

  linkCostCenter(id: number, costCenterId: number | null, version: number): boolean {
    return this.linkAccount(id, { type: costCenterId ? 'cost_center' : null, linkId: costCenterId || null }, version);
  },

  /** Cascades the same link to all descendants (all levels). */
  cascadeLink(accountId: number, link: AccountLink): number {
    let affected = 0;
    (db.transaction(() => {
      const now = new Date().toISOString();
      const visited = new Set<number>();
      const updateChildren = (parentId: number) => {
        const children = db.prepare('SELECT id FROM account WHERE parentId = ?').all(parentId) as any[];
        for (const child of children) {
          if (visited.has(child.id)) continue;
          visited.add(child.id);
          const costCenterId = link.type === 'cost_center' ? link.linkId : null;
          db.prepare('UPDATE account SET linkType=?, linkId=?, linkPartnerFilter=?, costCenterId=?, updatedAt=?, version=version+1 WHERE id=?')
            .run(link.type || null, link.linkId || null, link.type === 'partner' ? (link.partnerFilter || 'both') : null, costCenterId, now, child.id);
          affected++;
          updateChildren(child.id);
        }
      };
      visited.add(accountId);
      updateChildren(accountId);
    }))();
    return affected;
  },

  cascadeLinkCostCenter(accountId: number, costCenterId: number | null): number {
    return this.cascadeLink(accountId, { type: costCenterId ? 'cost_center' : null, linkId: costCenterId || null });
  },

  getCostCenterId(id: number): number | null {
    const row = db.prepare('SELECT costCenterId FROM account WHERE id = ?').get(id) as any;
    return row?.costCenterId || null;
  },

  hasChildren(id: number): boolean {
    return (db.prepare('SELECT count(1) AS count FROM account WHERE parentId = ?').get(id) as any).count > 0;
  },

  isUsedInEntries(code: string): boolean {
    return (db.prepare('SELECT count(1) AS count FROM entry_line WHERE accountCode = ?').get(code) as any).count > 0;
  },

  isUsedInInvoiceLines(code: string): boolean {
    return (db.prepare('SELECT count(1) AS count FROM invoice_line WHERE accountCode = ?').get(code) as any).count > 0;
  },

  isUsedInPostingProfiles(code: string): boolean {
    return (db.prepare(
      'SELECT count(1) AS count FROM posting_profile WHERE accountsReceivableCode = ? OR accountsPayableCode = ? OR cashAccountCode = ? OR discountAccountCode = ? OR inventoryAccountCode = ? OR cogsAccountCode = ?'
    ).get(code, code, code, code, code, code) as any).count > 0;
  },

  isUsedInTaxCodes(code: string): boolean {
    const row = db.prepare('SELECT count(1) AS count FROM tax_code WHERE accountCode = ?').get(code) as { count: number } | undefined;
    return (row?.count ?? 0) > 0;
  },

  isUsedInPurchaseOrderLines(code: string): boolean {
    const row = db.prepare('SELECT count(1) AS count FROM purchase_order_line WHERE accountCode = ?').get(code) as { count: number } | undefined;
    return (row?.count ?? 0) > 0;
  },

  /** AR/AP usage of a code across ACTIVE posting profiles (fallback when an account is not partner-linked). */
  getActiveProfileRoles(code: string): { asAr: boolean; asAp: boolean } {
    const row = db.prepare(
      "SELECT COUNT(CASE WHEN accountsReceivableCode = ? THEN 1 END) AS arCount, COUNT(CASE WHEN accountsPayableCode = ? THEN 1 END) AS apCount FROM posting_profile WHERE isActive = 1"
    ).get(code, code) as any;
    return { asAr: (row?.arCount || 0) > 0, asAp: (row?.apCount || 0) > 0 };
  },

  getUsageMap(): Record<string, AccountUsage> {
    const usage: Record<string, AccountUsage> = {};
    const ensure = (code: string) => {
      if (!usage[code]) usage[code] = { postingProfiles: [], taxCodes: [], entryLines: 0, invoiceLines: 0, purchaseOrderLines: 0 };
    };

    const profileFields: Array<[string, string]> = [
      ['accountsReceivableCode', 'AR'],
      ['accountsPayableCode', 'AP'],
      ['cashAccountCode', 'Cash'],
      ['discountAccountCode', 'Discount'],
      ['inventoryAccountCode', 'Inventory'],
      ['cogsAccountCode', 'COGS'],
    ];
    const profiles = db.prepare(
      'SELECT name, accountsReceivableCode, accountsPayableCode, cashAccountCode, discountAccountCode, inventoryAccountCode, cogsAccountCode FROM posting_profile'
    ).all() as any[];
    for (const p of profiles) {
      for (const [field, role] of profileFields) {
        const code = p[field];
        if (code) { ensure(code); usage[code].postingProfiles.push({ name: p.name, role }); }
      }
    }

    const taxCodes = db.prepare('SELECT name, accountCode FROM tax_code WHERE isGroup = 0 AND accountCode != \'\'').all() as any[];
    for (const t of taxCodes) {
      if (t.accountCode) { ensure(t.accountCode); usage[t.accountCode].taxCodes.push(t.name); }
    }

    // Transaction-line usage counts — everything that would block a delete.
    const lineQueries: Array<{ sql: string; field: 'entryLines' | 'invoiceLines' | 'purchaseOrderLines' }> = [
      { sql: "SELECT accountCode, count(1) AS count FROM entry_line WHERE accountCode != '' GROUP BY accountCode", field: 'entryLines' },
      { sql: "SELECT accountCode, count(1) AS count FROM invoice_line WHERE accountCode != '' GROUP BY accountCode", field: 'invoiceLines' },
      { sql: "SELECT accountCode, count(1) AS count FROM purchase_order_line WHERE accountCode != '' GROUP BY accountCode", field: 'purchaseOrderLines' },
    ];
    for (const q of lineQueries) {
      const rows = db.prepare(q.sql).all() as Array<{ accountCode: string; count: number }>;
      for (const r of rows) {
        if (!r.accountCode) continue;
        ensure(r.accountCode);
        usage[r.accountCode][q.field] = r.count || 0;
      }
    }

    return usage;
  },
};
