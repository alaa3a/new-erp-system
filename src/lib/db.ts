import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { hashPassword } from '@/lib/auth/password';

const DB_PATH = process.env.DATABASE_PATH || 'erp.sqlite';

// In Next.js dev mode every route handler is compiled into its own module
// instance, so module-level state here would be duplicated per route — each
// route would hold a *different* in-memory copy of the database. That caused
// "deleted but still in the list" (list route serving a stale copy) and
// "Account not found" (delete route not seeing a just-created row) bugs.
// Store the DB state on globalThis so every route bundle shares one instance.
const GLOBAL_KEY = '__erpDbState__';

interface DbState {
  db: SqlJsDatabase | null;
  initialized: boolean;
  initPromise: Promise<void> | null;
  inTransaction: boolean;
}

function getState(): DbState {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { db: null, initialized: false, initPromise: null, inTransaction: false };
  }
  return g[GLOBAL_KEY] as DbState;
}

function ensureSync(): SqlJsDatabase {
  const state = getState();
  if (!state.db) throw new Error('Database not initialized. Call await ensureDb() first.');
  return state.db;
}

/** A single row of results from the (loosely typed) sql.js engine. */
export type SqlRow = Record<string, unknown>;

type SqlValue = number | string | Uint8Array | null;

/** Convert undefined values to null for sql.js compatibility */
function sanitizeParams(params: unknown[]): unknown[] {
  return params.map(p => p === undefined ? null : p);
}

class Statement {
  private sql: string;
  private params: unknown[];
  constructor(sql: string, params: unknown[] = []) {
    this.sql = sql;
    this.params = params;
  }
  get<T extends object = SqlRow>(...bindParams: unknown[]): T | undefined {
    const db = ensureSync();
    const stmt = db.prepare(this.sql);
    try {
      stmt.bind(sanitizeParams(bindParams.length > 0 ? bindParams : this.params));
      if (stmt.step()) {
        return stmt.getAsObject() as T;
      }
      return undefined;
    } finally {
      stmt.free();
    }
  }
  all<T extends object = SqlRow>(...bindParams: unknown[]): T[] {
    const db = ensureSync();
    const stmt = db.prepare(this.sql);
    const rows: T[] = [];
    try {
      stmt.bind(sanitizeParams(bindParams.length > 0 ? bindParams : this.params));
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }
  run(...bindParams: unknown[]): { changes: number; lastInsertRowid: number } {
    const db = ensureSync();
    const params = sanitizeParams(bindParams.length > 0 ? bindParams : this.params);
    db.run(this.sql, params);
    const changes = db.getRowsModified();
    const lastId = db.exec('SELECT last_insert_rowid() AS id');
    const lastInsertRowid = lastId.length > 0 ? lastId[0].values[0][0] as number : 0;
    if (!getState().inTransaction) saveDb();
    return { changes, lastInsertRowid };
  }
}

class DatabaseWrapper {
  prepare(sql: string): Statement {
    return new Statement(sql);
  }

  exec(sql: string): void {
    const db = ensureSync();
    db.exec(sql);
    saveDb();
  }

  transaction<T>(fn: () => T): () => T {
    return () => {
      const state = getState();
      const d = ensureSync();
      // Re-entrant: a transaction called inside an active transaction joins the
      // outer one (SQLite does not allow nested BEGIN). Sequence generators and
      // stock helpers are called from within service transactions, so without
      // this they would crash with "cannot start a transaction within a transaction".
      if (state.inTransaction) {
        return fn();
      }
      d.run('BEGIN TRANSACTION');
      state.inTransaction = true;
      try {
        const result = fn();
        d.run('COMMIT');
        state.inTransaction = false;
        flushPendingSave();
        return result;
      } catch (err) {
        state.inTransaction = false;
        d.run('ROLLBACK');
        throw err;
      }
    };
  }
}

const db = new DatabaseWrapper();

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 100;

function persistDb(): void {
  const state = getState();
  if (!state.db) return;
  const data = state.db.export();
  const buffer = Buffer.from(data);
  writeFileSync(DB_PATH, buffer);
  try { state.db.exec('PRAGMA foreign_keys = ON'); } catch { /* ignore */ }
}

function flushPendingSave(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
    persistDb();
  }
}

function scheduleSave(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    persistDb();
  }, SAVE_DEBOUNCE_MS);
}

function saveDb(): void {
  scheduleSave();
}

if (typeof process !== 'undefined') {
  process.on('exit', () => flushPendingSave());
}

async function ensureDb(): Promise<void> {
  const state = getState();
  if (state.initialized && state.db) return;
  if (state.initPromise) {
    await state.initPromise;
    return;
  }
  state.initPromise = (async () => {
    // The runtime accepts a config object with locateFile (declared in our
    // sql.js type shim) so the WASM binary resolves from node_modules.
    const SQL = await initSqlJs({
      locateFile: (file: string) => path.join(process.cwd(), 'node_modules/sql.js/dist', file),
    });
    if (existsSync(DB_PATH)) {
      const fileBuffer = readFileSync(DB_PATH);
      state.db = new SQL.Database(fileBuffer);
    } else {
      state.db = new SQL.Database();
    }
    // Enforce referential integrity on every connection (Critical Bug Fix #1).
    // sql.js links against SQLite with FK support compiled in; the pragma must
    // run outside any transaction, which is the case here (fresh connection).
    state.db.exec('PRAGMA foreign_keys = ON');
    state.initialized = true;
  })();
  await state.initPromise;
}

function initDb() {
  const d = ensureSync();
  d.exec(`
    CREATE TABLE IF NOT EXISTS company (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      registrationNumber TEXT,
      taxRegistrationNumber TEXT,
      address TEXT,
      city TEXT,
      country TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      baseCurrencyCode TEXT NOT NULL DEFAULT 'USD',
      fiscalYearStartMonth INTEGER NOT NULL DEFAULT 1,
      logoUrl TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS fiscal_period (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      closedBy TEXT,
      closedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS document_sequence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      documentType TEXT NOT NULL UNIQUE,
      prefix TEXT NOT NULL,
      nextNumber INTEGER NOT NULL DEFAULT 1,
      padding INTEGER NOT NULL DEFAULT 6,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      permissionIds TEXT NOT NULL DEFAULT '[]',
      isActive INTEGER NOT NULL DEFAULT 1,
      lastLoginAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS permission (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS business_partner (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      contactPerson TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      country TEXT,
      taxRegistrationNumber TEXT,
      defaultVatCodeId INTEGER,
      paymentTermId INTEGER,
      creditLimit INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      tags TEXT DEFAULT '[]',
      deletedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      parentId INTEGER,
      costCenterId INTEGER,
      linkType TEXT,
      linkId INTEGER,
      linkPartnerFilter TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      isSystemAccount INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      deletedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(parentId) REFERENCES account(id),
      FOREIGN KEY(costCenterId) REFERENCES cost_center(id)
    );

    CREATE TABLE IF NOT EXISTS cost_center (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      parentId INTEGER,
      isActive INTEGER NOT NULL DEFAULT 1,
      responsiblePerson TEXT,
      description TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(parentId) REFERENCES cost_center(id)
    );

    CREATE TABLE IF NOT EXISTS warehouse (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      address TEXT,
      manager TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS product (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      itemType TEXT NOT NULL DEFAULT 'stock',
      unitOfMeasure TEXT NOT NULL DEFAULT 'pcs',
      salesPrice INTEGER NOT NULL DEFAULT 0,
      purchasePrice INTEGER NOT NULL DEFAULT 0,
      vatCodeId INTEGER,
      purchaseVatCodeId INTEGER,
      defaultWarehouseId INTEGER,
      reorderPoint INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      deletedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(defaultWarehouseId) REFERENCES warehouse(id)
    );

    CREATE TABLE IF NOT EXISTS product_warehouse_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL,
      warehouseId INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      averageCost INTEGER NOT NULL DEFAULT 0,
      lastUpdated TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(productId) REFERENCES product(id),
      FOREIGN KEY(warehouseId) REFERENCES warehouse(id),
      UNIQUE(productId, warehouseId)
    );

    CREATE TABLE IF NOT EXISTS employee (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      jobTitle TEXT,
      department TEXT,
      email TEXT,
      phone TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS tax_code (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      rate REAL NOT NULL DEFAULT 0,
      type TEXT NOT NULL,
      parentId INTEGER,
      accountCode TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      isSystemCode INTEGER NOT NULL DEFAULT 0,
      effectiveFrom TEXT NOT NULL,
      effectiveTo TEXT,
      isGroup INTEGER NOT NULL DEFAULT 0,
      filingPeriod TEXT NOT NULL DEFAULT 'monthly',
      detailsConfig TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(parentId) REFERENCES tax_code(id)
    );

    CREATE TABLE IF NOT EXISTS payment_term (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      daysUntilDue INTEGER NOT NULL DEFAULT 30,
      discountPercent INTEGER NOT NULL DEFAULT 0,
      discountDays INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS posting_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      invoiceType TEXT NOT NULL,
      accountsReceivableCode TEXT,
      accountsPayableCode TEXT,
      cashAccountCode TEXT,
      discountAccountCode TEXT,
      inventoryAccountCode TEXT,
      cogsAccountCode TEXT,
      isDefault INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      entryCategoryId INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(entryCategoryId) REFERENCES entry_category(id)
    );

    CREATE TABLE IF NOT EXISTS entry_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS invoice (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceNumber TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      businessPartnerId INTEGER,
      partnerName TEXT NOT NULL DEFAULT '',
      postingProfileId INTEGER,
      invoiceDate TEXT NOT NULL,
      dueDate TEXT NOT NULL,
      paymentTermId INTEGER,
      currencyCode TEXT NOT NULL DEFAULT 'USD',
      exchangeRate REAL NOT NULL DEFAULT 1,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vatAmount INTEGER NOT NULL DEFAULT 0,
      totalAmount INTEGER NOT NULL DEFAULT 0,
      paidAmount INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      referenceNumber TEXT,
      linkedInvoiceId INTEGER,
      warehouseId INTEGER,
      approvedBy TEXT,
      approvedAt TEXT,
      postedBy TEXT,
      postedAt TEXT,
      purchaseOrderId INTEGER,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(businessPartnerId) REFERENCES business_partner(id),
      FOREIGN KEY(postingProfileId) REFERENCES posting_profile(id),
      FOREIGN KEY(linkedInvoiceId) REFERENCES invoice(id),
      FOREIGN KEY(warehouseId) REFERENCES warehouse(id),
      FOREIGN KEY(purchaseOrderId) REFERENCES purchase_order(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL,
      lineNumber INTEGER NOT NULL,
      productId INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      unitPrice INTEGER NOT NULL DEFAULT 0,
      discountPercent INTEGER NOT NULL DEFAULT 0,
      vatCodeId INTEGER,
      vatRate REAL NOT NULL DEFAULT 0,
      vatAmount INTEGER NOT NULL DEFAULT 0,
      lineTotal INTEGER NOT NULL DEFAULT 0,
      lineType TEXT NOT NULL DEFAULT 'stock',
      warehouseId INTEGER,
      costCenterId INTEGER,
      accountCode TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(invoiceId) REFERENCES invoice(id),
      FOREIGN KEY(productId) REFERENCES product(id),
      FOREIGN KEY(warehouseId) REFERENCES warehouse(id),
      FOREIGN KEY(costCenterId) REFERENCES cost_center(id)
    );

    CREATE TABLE IF NOT EXISTS entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entryNumber TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      entryDate TEXT NOT NULL,
      description TEXT NOT NULL,
      referenceNumber TEXT,
      categoryId INTEGER,
      totalDebit INTEGER NOT NULL DEFAULT 0,
      totalCredit INTEGER NOT NULL DEFAULT 0,
      currencyCode TEXT NOT NULL DEFAULT 'USD',
      exchangeRate REAL NOT NULL DEFAULT 1,
      linkedInvoiceId INTEGER,
      periodId INTEGER,
      costCenterId INTEGER,
      postedBy TEXT,
      postedAt TEXT,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(linkedInvoiceId) REFERENCES invoice(id),
      FOREIGN KEY(periodId) REFERENCES fiscal_period(id),
      FOREIGN KEY(costCenterId) REFERENCES cost_center(id),
      FOREIGN KEY(categoryId) REFERENCES entry_category(id)
    );

    CREATE TABLE IF NOT EXISTS entry_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entryId INTEGER NOT NULL,
      lineNumber INTEGER NOT NULL,
      accountCode TEXT NOT NULL,
      description TEXT,
      debitAmount INTEGER NOT NULL DEFAULT 0,
      creditAmount INTEGER NOT NULL DEFAULT 0,
      businessPartnerId INTEGER,
      costCenterId INTEGER,
      employeeId INTEGER,
      vatCodeId INTEGER,
      vatAmount INTEGER NOT NULL DEFAULT 0,
      lineType TEXT NOT NULL DEFAULT 'normal',
      supplierName TEXT,
      supplierTaxId TEXT,
      invoiceNumber TEXT,
      invoiceDate TEXT,
      taxDetailsJson TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(entryId) REFERENCES entry(id),
      FOREIGN KEY(businessPartnerId) REFERENCES business_partner(id),
      FOREIGN KEY(costCenterId) REFERENCES cost_center(id)
    );

    CREATE TABLE IF NOT EXISTS entry_line_payment_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entryLineId INTEGER NOT NULL,
      invoiceId INTEGER NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(entryLineId) REFERENCES entry_line(id),
      FOREIGN KEY(invoiceId) REFERENCES invoice(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_movement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movementNumber TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      productId INTEGER NOT NULL,
      warehouseId INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      unitCost INTEGER NOT NULL DEFAULT 0,
      totalCost INTEGER NOT NULL DEFAULT 0,
      referenceType TEXT NOT NULL,
      referenceId INTEGER NOT NULL,
      referenceNumber TEXT,
      postedBy TEXT NOT NULL,
      postedAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(productId) REFERENCES product(id),
      FOREIGN KEY(warehouseId) REFERENCES warehouse(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      action TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId INTEGER NOT NULL,
      entityNumber TEXT,
      changes TEXT,
      ipAddress TEXT,
      userAgent TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notification (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      entityType TEXT,
      entityId INTEGER,
      isRead INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_order (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poNumber TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      businessPartnerId INTEGER,
      partnerName TEXT NOT NULL DEFAULT '',
      orderDate TEXT NOT NULL,
      expectedDate TEXT NOT NULL,
      warehouseId INTEGER,
      referenceNumber TEXT,
      notes TEXT,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vatAmount INTEGER NOT NULL DEFAULT 0,
      totalAmount INTEGER NOT NULL DEFAULT 0,
      approvedBy TEXT,
      approvedAt TEXT,
      closedBy TEXT,
      closedAt TEXT,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(businessPartnerId) REFERENCES business_partner(id),
      FOREIGN KEY(warehouseId) REFERENCES warehouse(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_order_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poId INTEGER NOT NULL,
      lineNumber INTEGER NOT NULL,
      productId INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      unitPrice INTEGER NOT NULL DEFAULT 0,
      receivedQuantity INTEGER NOT NULL DEFAULT 0,
      invoicedQuantity INTEGER NOT NULL DEFAULT 0,
      discountPercent INTEGER NOT NULL DEFAULT 0,
      vatCodeId INTEGER,
      vatRate REAL NOT NULL DEFAULT 0,
      vatAmount INTEGER NOT NULL DEFAULT 0,
      lineTotal INTEGER NOT NULL DEFAULT 0,
      lineType TEXT NOT NULL DEFAULT 'stock',
      warehouseId INTEGER,
      costCenterId INTEGER,
      accountCode TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(poId) REFERENCES purchase_order(id),
      FOREIGN KEY(productId) REFERENCES product(id),
      FOREIGN KEY(warehouseId) REFERENCES warehouse(id)
    );

    CREATE TABLE IF NOT EXISTS goods_receipt (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receiptNumber TEXT NOT NULL UNIQUE,
      poId INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'full',
      receiptDate TEXT NOT NULL,
      warehouseId INTEGER NOT NULL,
      notes TEXT,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(poId) REFERENCES purchase_order(id),
      FOREIGN KEY(warehouseId) REFERENCES warehouse(id)
    );

    CREATE TABLE IF NOT EXISTS goods_receipt_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receiptId INTEGER NOT NULL,
      poLineId INTEGER NOT NULL,
      productId INTEGER NOT NULL,
      description TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      unitCost INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(receiptId) REFERENCES goods_receipt(id),
      FOREIGN KEY(poLineId) REFERENCES purchase_order_line(id),
      FOREIGN KEY(productId) REFERENCES product(id)
    );

    CREATE TABLE IF NOT EXISTS aging_bucket (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      fromDays INTEGER NOT NULL,
      toDays INTEGER NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );

    INSERT OR IGNORE INTO aging_bucket (id, label, fromDays, toDays, sortOrder, createdAt, updatedAt) VALUES
      (1, 'Current', 0, 0, 1, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
      (2, '1-30 days', 1, 30, 2, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
      (3, '31-60 days', 31, 60, 3, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
      (4, '61-90 days', 61, 90, 4, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
      (5, '90+ days', 91, 999999, 5, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `);
  // Migration: add purchaseOrderId to invoice if missing from existing DB
  try { db.exec('ALTER TABLE invoice ADD COLUMN purchaseOrderId INTEGER REFERENCES purchase_order(id)'); } catch { /* column may already exist */ }
  // Migration: soft-delete support — deletedAt column on key entities
  try { db.exec('ALTER TABLE product ADD COLUMN deletedAt TEXT'); } catch { /* column may already exist */ }
  try { db.exec('ALTER TABLE business_partner ADD COLUMN deletedAt TEXT'); } catch { /* column may already exist */ }
  try { db.exec('ALTER TABLE account ADD COLUMN deletedAt TEXT'); } catch { /* column may already exist */ }
  // Migration: fix child accounts incorrectly marked as system accounts
  try { db.exec('UPDATE account SET isSystemAccount = 0 WHERE parentId IS NOT NULL AND isSystemAccount = 1'); } catch { /* ignore */ }
  // Migration: tax groups support (tax_code)
  try { db.exec('ALTER TABLE tax_code ADD COLUMN isGroup INTEGER NOT NULL DEFAULT 0'); } catch { /* column may already exist */ }
  try { db.exec('ALTER TABLE tax_code ADD COLUMN filingPeriod TEXT NOT NULL DEFAULT \'monthly\''); } catch { /* column may already exist */ }
  // Migration: link entries to categories
  // NOTE: the ALTER for entry omits the REFERENCES clause — adding a column
  // with a foreign key is version-dependent in SQLite and would silently fail
  // on some builds, leaving existing DBs without the column.
  try { db.exec('ALTER TABLE entry ADD COLUMN categoryId INTEGER'); } catch { /* column may already exist */ }
  // Migration: drop the unused type column that was briefly added to entry_category
  try { db.exec('ALTER TABLE entry_category DROP COLUMN type'); } catch { /* column may already be gone */ }
  // Migration: remove the entry `type` column (every entry is now a journal entry)
  try { db.exec('ALTER TABLE entry DROP COLUMN type'); } catch { /* column may already be gone */ }
  // Migration: posting profiles carry a default entry category for auto-generated entries
  try { db.exec('ALTER TABLE posting_profile ADD COLUMN entryCategoryId INTEGER'); } catch { /* column may already exist */ }
  // Migration: drop the removed partner-role flag column (the role is now derived from the partner link filter)
  try { db.exec('ALTER TABLE account DROP COLUMN partnerRole'); } catch { /* column may already be gone */ }
  // Migration: dynamic account links (cost center | partner | employee) — polymorphic linkId + linkType discriminator
  try { db.exec('ALTER TABLE account ADD COLUMN linkType TEXT'); } catch { /* column may already exist */ }
  try { db.exec('ALTER TABLE account ADD COLUMN linkId INTEGER'); } catch { /* column may already exist */ }
  try { db.exec('ALTER TABLE account ADD COLUMN linkPartnerFilter TEXT'); } catch { /* column may already exist */ }
  // Backfill: existing costCenterId links become linkType='cost_center' (the legacy column stays in sync during transition)
  try {
    db.exec("UPDATE account SET linkType='cost_center', linkId=costCenterId WHERE costCenterId IS NOT NULL AND linkType IS NULL");
  } catch { /* ignore */ }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_account_link ON account(linkType, linkId)'); } catch { /* ignore */ }
  // Migration: drop dead posting-profile columns (VAT output/input + inventory adjustment — no consumers)
  try { db.exec('ALTER TABLE posting_profile DROP COLUMN vatOutputCode'); } catch { /* column may already be gone */ }
  try { db.exec('ALTER TABLE posting_profile DROP COLUMN vatInputCode'); } catch { /* column may already be gone */ }
  try { db.exec('ALTER TABLE posting_profile DROP COLUMN adjustmentAccountCode'); } catch { /* column may already be gone */ }
  // Migration: entry line types (normal / tax / payment) + supplier document fields
  try { db.exec("ALTER TABLE entry_line ADD COLUMN lineType TEXT NOT NULL DEFAULT 'normal'"); } catch { /* column may already exist */ }
  try { db.exec('ALTER TABLE entry_line ADD COLUMN supplierName TEXT'); } catch { /* column may already exist */ }
  try { db.exec('ALTER TABLE entry_line ADD COLUMN supplierTaxId TEXT'); } catch { /* column may already exist */ }
  try { db.exec('ALTER TABLE entry_line ADD COLUMN invoiceNumber TEXT'); } catch { /* column may already exist */ }
  try { db.exec('ALTER TABLE entry_line ADD COLUMN invoiceDate TEXT'); } catch { /* column may already exist */ }
  // Migration: entry-line employee dimension + captured user-defined tax-detail JSON (Phase 3/4)
  try { db.exec('ALTER TABLE entry_line ADD COLUMN employeeId INTEGER'); } catch { /* column may already exist */ }
  try { db.exec('ALTER TABLE entry_line ADD COLUMN taxDetailsJson TEXT'); } catch { /* column may already exist */ }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_entry_line_employeeId ON entry_line(employeeId)'); } catch { /* ignore */ }
  // Migration: tax types carry a dynamic details-field config (Phase 4)
  try { db.exec('ALTER TABLE tax_code ADD COLUMN detailsConfig TEXT'); } catch { /* column may already exist */ }
  // Indexes for the new reporting query paths
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_entry_line_entryId ON entry_line(entryId)'); } catch { /* ignore */ }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_entry_line_vatCodeId ON entry_line(vatCodeId)'); } catch { /* ignore */ }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_entry_line_costCenterId ON entry_line(costCenterId)'); } catch { /* ignore */ }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_entry_line_businessPartnerId ON entry_line(businessPartnerId)'); } catch { /* ignore */ }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_entry_categoryId ON entry(categoryId)'); } catch { /* ignore */ }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_entry_status_date ON entry(status, entryDate)'); } catch { /* ignore */ }
  // Migration: purge orphaned per-type entry document sequences (only entry_journal remains)
  try {
    db.exec("DELETE FROM document_sequence WHERE documentType IN ('entry_payment', 'entry_receipt', 'entry_adjustment', 'entry_closing')");
  } catch { /* ignore */ }
  // Migration: backfill per-category entry sequences for existing categories
  try {
    const categories = db.prepare('SELECT id, code FROM entry_category').all() as { id: number; code: string }[];
    for (const c of categories) ensureCategorySequence(c.id, c.code);
  } catch { /* ignore */ }
  // Migration: permissions added after the initial seed — INSERT OR IGNORE so
  // existing DBs gain them without touching the seeded rows.
  try {
    const extraPerms: Array<[string, string, string, string]> = [
      ['invoice.payment', 'invoice', 'payment', 'Link payments to invoices'],
      ['purchaseOrder.close', 'purchaseOrder', 'close', 'Close purchase orders'],
      ['inventory.adjust', 'inventory', 'adjust', 'Adjust inventory stock'],
    ];
    const stmt = db.prepare('INSERT OR IGNORE INTO permission (key, module, action, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)');
    const now = new Date().toISOString();
    for (const [key, module, action, desc] of extraPerms) stmt.run(key, module, action, desc, now, now);
  } catch { /* ignore */ }
  // Migration: the seeded admin keeps ALL permissions (existing DBs were seeded
  // with an empty permissionIds list — grant them now so permission checks work).
  try {
    const admin = db.prepare("SELECT id FROM users WHERE email = 'admin@erp.local'").get<{ id: number }>();
    if (admin) {
      const allPerms = db.prepare('SELECT id FROM permission').all<{ id: number }>();
      db.prepare('UPDATE users SET permissionIds = ?, updatedAt = ? WHERE id = ?')
        .run(JSON.stringify(allPerms.map(p => p.id)), new Date().toISOString(), admin.id);
    }
  } catch { /* ignore */ }
  saveDb();
}

/**
 * Shared sequence ensure helper — creates a document_sequence row (idempotent).
 * Used by idGenerator, entity creation and getNextSequence so the Document
 * Sequences page always shows a complete, labeled set (§10.8).
 */
function ensureSequence(documentType: string, prefix: string, padding = 6): void {
  const exists = db.prepare('SELECT id FROM document_sequence WHERE documentType = ?').get(documentType);
  if (!exists) {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO document_sequence (documentType, prefix, nextNumber, padding, createdAt, updatedAt) VALUES (?, ?, 1, ?, ?, ?)').run(documentType, prefix, padding, now, now);
  }
}

/** Sanitizes an entry category code into a safe JE-<CODE>- prefix segment (no spaces/special chars). */
function sanitizeCategoryCode(code?: string): string {
  const clean = (code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return clean || 'GEN';
}

/** Ensures the per-category entry sequence exists (entry_cat_<id>, prefix JE-<CODE>-). */
function ensureCategorySequence(categoryId: number, code: string): void {
  ensureSequence(`entry_cat_${categoryId}`, `JE-${sanitizeCategoryCode(code)}-`, 6);
}

interface DocumentSequenceRow {
  id: number;
  prefix: string;
  nextNumber: number;
  padding: number;
}

function getNextSequence(documentType: string): string {
  ensureSequence(documentType, documentType.toUpperCase() + '-', 6);
  const seq = db.prepare('SELECT * FROM document_sequence WHERE documentType = ?').get<DocumentSequenceRow>(documentType);
  if (!seq) throw new Error(`Sequence not found for document type: ${documentType}`);
  const padded = seq.prefix + String(seq.nextNumber).padStart(seq.padding, '0');
  db.prepare('UPDATE document_sequence SET nextNumber = nextNumber + 1, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), seq.id);
  return padded;
}

function canUser(userPermissionIds: number[], permissionKey: string): boolean {
  const perm = db.prepare('SELECT id FROM permission WHERE key = ?').get<{ id: number }>(permissionKey);
  if (!perm) return false;
  return userPermissionIds.includes(perm.id);
}

/**
 * Ensures the database is fully initialized (WASM loaded, tables created, seed data inserted).
 * Must be called once before any API route that accesses the database.
 */
async function ensureInitialized(): Promise<void> {
  await ensureDb();
  seedInitialData();
}

function seedInitialData() {
  initDb();

  const userCount = db.prepare('SELECT count(1) AS count FROM users').get<{ count: number }>()?.count ?? 0;
  if (userCount === 0) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users (email, passwordHash, firstName, lastName, permissionIds, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1)`).run(
      'admin@erp.local',
      hashPassword('admin123'),
      'Admin',
      'User',
      JSON.stringify([]),
      now,
      now,
    );
  }

  // Seed permissions idempotently (INSERT OR IGNORE) rather than gating on
  // permCount === 0: the initDb() migration inserts a few extra permissions
  // (invoice.payment etc.) BEFORE this seed runs, so a fresh DB would otherwise
  // have count > 0 and the full permission set would never be seeded — leaving
  // the app with only 3 permissions and breaking every permission check
  // (Critical Bug Fix #13 regression on fresh installs).
  {
    const now = new Date().toISOString();
    const perms = [
      ['partner.view', 'partner', 'view', 'View business partners'],
      ['partner.create', 'partner', 'create', 'Create business partners'],
      ['partner.update', 'partner', 'update', 'Update business partners'],
      ['partner.delete', 'partner', 'delete', 'Delete business partners'],
      ['product.view', 'product', 'view', 'View products'],
      ['product.create', 'product', 'create', 'Create products'],
      ['product.update', 'product', 'update', 'Update products'],
      ['product.delete', 'product', 'delete', 'Delete products'],
      ['invoice.view', 'invoice', 'view', 'View invoices'],
      ['invoice.create', 'invoice', 'create', 'Create invoices'],
      ['invoice.update', 'invoice', 'update', 'Update invoices'],
      ['invoice.delete', 'invoice', 'delete', 'Delete invoices'],
      ['invoice.post', 'invoice', 'post', 'Post invoices'],
      ['invoice.approve', 'invoice', 'approve', 'Approve invoices'],
      ['entry.view', 'entry', 'view', 'View journal entries'],
      ['entry.create', 'entry', 'create', 'Create journal entries'],
      ['entry.update', 'entry', 'update', 'Update journal entries'],
      ['entry.delete', 'entry', 'delete', 'Delete journal entries'],
      ['entry.post', 'entry', 'post', 'Post journal entries'],
      ['account.view', 'account', 'view', 'View chart of accounts'],
      ['account.create', 'account', 'create', 'Create accounts'],
      ['account.update', 'account', 'update', 'Update accounts'],
      ['account.delete', 'account', 'delete', 'Delete accounts'],
      ['costCenter.view', 'costCenter', 'view', 'View cost centers'],
      ['costCenter.create', 'costCenter', 'create', 'Create cost centers'],
      ['costCenter.update', 'costCenter', 'update', 'Update cost centers'],
      ['costCenter.delete', 'costCenter', 'delete', 'Delete cost centers'],
      ['warehouse.view', 'warehouse', 'view', 'View warehouses'],
      ['warehouse.create', 'warehouse', 'create', 'Create warehouses'],
      ['warehouse.update', 'warehouse', 'update', 'Update warehouses'],
      ['warehouse.delete', 'warehouse', 'delete', 'Delete warehouses'],
      ['report.view', 'report', 'view', 'View reports'],
      ['report.export', 'report', 'export', 'Export reports'],
      ['settings.manage', 'settings', 'manage', 'Manage system settings'],
      ['user.view', 'user', 'view', 'View users'],
      ['user.manage', 'user', 'manage', 'Manage users and permissions'],
      ['audit.view', 'audit', 'view', 'View audit log'],
      ['taxCode.view', 'taxCode', 'view', 'View tax codes'],
      ['taxCode.manage', 'taxCode', 'manage', 'Manage tax codes'],
      ['postingProfile.view', 'postingProfile', 'view', 'View posting profiles'],
      ['postingProfile.manage', 'postingProfile', 'manage', 'Manage posting profiles'],
      ['purchaseOrder.view', 'purchaseOrder', 'view', 'View purchase orders'],
      ['purchaseOrder.create', 'purchaseOrder', 'create', 'Create purchase orders'],
      ['purchaseOrder.update', 'purchaseOrder', 'update', 'Update purchase orders'],
      ['purchaseOrder.delete', 'purchaseOrder', 'delete', 'Delete purchase orders'],
      ['purchaseOrder.approve', 'purchaseOrder', 'approve', 'Approve purchase orders'],
      ['purchaseOrder.receive', 'purchaseOrder', 'receive', 'Receive goods against POs'],
      ['purchaseOrder.close', 'purchaseOrder', 'close', 'Close purchase orders'],
      ['invoice.payment', 'invoice', 'payment', 'Link payments to invoices'],
      ['inventory.adjust', 'inventory', 'adjust', 'Adjust inventory stock'],
    ];
    const stmt = db.prepare('INSERT OR IGNORE INTO permission (key, module, action, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)');
    for (const [key, module, action, desc] of perms) {
      stmt.run(key, module, action, desc, now, now);
    }
  }

  // Grant the seeded admin every permission. The admin user is created before
  // permissions are seeded (order above), so this sync runs after both exist.
  try {
    const admin = db.prepare("SELECT id FROM users WHERE email = 'admin@erp.local'").get<{ id: number }>();
    if (admin) {
      const allPerms = db.prepare('SELECT id FROM permission').all<{ id: number }>();
      db.prepare('UPDATE users SET permissionIds = ?, updatedAt = ? WHERE id = ?')
        .run(JSON.stringify(allPerms.map(p => p.id)), new Date().toISOString(), admin.id);
    }
  } catch { /* ignore */ }

  // Seed notifications for the admin user
  const notifCount = db.prepare('SELECT count(1) AS count FROM notification').get<{ count: number }>()?.count ?? 0;
  if (notifCount === 0) {
    const admin = db.prepare('SELECT id FROM users WHERE email = ?').get<{ id: number }>('admin@erp.local');
    const adminId = admin?.id || 1;
    const now = new Date().toISOString();
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 172800000).toISOString();

    const notifStmt = db.prepare('INSERT INTO notification (userId, type, title, message, entityType, entityId, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    notifStmt.run(adminId, 'success', 'Welcome to ERP', 'Your account has been created. Start by configuring your company settings.', 'user', adminId, 0, now);
    notifStmt.run(adminId, 'info', 'Chart of Accounts Ready', 'Standard chart of accounts has been pre-loaded. You can customize it anytime.', 'account', 1, 0, oneHourAgo);
    notifStmt.run(adminId, 'info', 'Fiscal Periods Available', 'Fiscal periods for the current year are ready for transactions.', 'fiscal_period', 1, 0, dayAgo);
    notifStmt.run(adminId, 'warning', 'Tax Codes Setup', 'Reminder: Review and verify tax codes before processing invoices.', 'tax_code', 1, 0, twoDaysAgo);
  }

  const acctCount = db.prepare('SELECT count(1) AS count FROM account').get<{ count: number }>()?.count ?? 0;
  if (acctCount === 0) {
    const now = new Date().toISOString();
    // Level 1: Root type accounts with single-digit codes (Asset=1, Liability=2, Equity=3, Revenue=4, Expense=5)
    const rootAccts: [string, string, string, number][] = [
      ['1', 'Assets', 'asset', 0],
      ['2', 'Liabilities', 'liability', 0],
      ['3', 'Equity', 'equity', 0],
      ['4', 'Revenue', 'revenue', 0],
      ['5', 'Expenses', 'expense', 0],
    ];
    const rootStmt = db.prepare('INSERT INTO account (code, name, type, parentId, isSystemAccount, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, NULL, ?, 1, ?, ?, 1)');
    for (const [code, name, type, sys] of rootAccts) {
      rootStmt.run(code, name, type, sys, now, now);
    }
    // Level 2: Child accounts — editable (isSystemAccount = 0)
    const acctStmt = db.prepare('INSERT INTO account (code, name, type, parentId, isSystemAccount, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, 0, 1, ?, ?, 1)');
    // Under Asset(1): 101-105
    const assets: [string, string, string][] = [
      ['101', 'Cash & Bank', 'asset'],
      ['102', 'Accounts Receivable', 'asset'],
      ['103', 'Inventory', 'asset'],
      ['104', 'Fixed Assets', 'asset'],
      ['105', 'VAT Input', 'asset'],
    ];
    for (const [code, name, type] of assets) {
      acctStmt.run(code, name, type, 1, now, now);
    }
    // Under Liability(2): 201-202
    acctStmt.run('201', 'Accounts Payable', 'liability', 2, now, now);
    acctStmt.run('202', 'VAT Output', 'liability', 2, now, now);
    // Under Equity(3): 301
    acctStmt.run('301', 'Equity', 'equity', 3, now, now);
    // Under Revenue(4): 401-402
    acctStmt.run('401', 'Sales Revenue', 'revenue', 4, now, now);
    acctStmt.run('402', 'Service Revenue', 'revenue', 4, now, now);
    // Under Expense(5): 501-503
    acctStmt.run('501', 'Cost of Goods Sold', 'expense', 5, now, now);
    acctStmt.run('502', 'Inventory Adjustment', 'expense', 5, now, now);
    acctStmt.run('503', 'Operating Expenses', 'expense', 5, now, now);
  }

  // NOTE: No tax_code seed. The tax table intentionally starts empty so users
  // create their own tax groups and types (avoids a protected system "VAT"
  // group that cannot be deleted from the UI).
}

/** Reset the database module state for testing. Only use in test suites. */
function resetForTest(): void {
  const state = getState();
  state.db = null;
  state.initialized = false;
  state.initPromise = null;
  state.inTransaction = false;
}

export { db, ensureDb, initDb, getNextSequence, ensureSequence, sanitizeCategoryCode, ensureCategorySequence, canUser, seedInitialData, ensureInitialized, resetForTest, flushPendingSave };
