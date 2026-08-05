import { ensureInitialized, resetForTest, db } from '../db';
import { existsSync, unlinkSync } from 'fs';

const DB_PATH = 'erp.sqlite';

// Module-level init promise ensures the DB is initialized only once per worker
let _initPromise: Promise<void> | null = null;

function getInitPromise(): Promise<void> {
  if (!_initPromise) {
    _initPromise = ensureInitialized().catch((err) => {
      _initPromise = null; // Reset so next call retries
      throw err;
    });
  }
  return _initPromise;
}

/**
 * Initialize a fresh database with seed data.
 * Resets the db module state, deletes any existing db file,
 * then waits for ensureInitialized() to create a fresh DB + seed data.
 * Call this in beforeAll() of each test suite.
 */
export async function setupTestDatabase(): Promise<void> {
  resetForTest();
  if (existsSync(DB_PATH)) {
    try { unlinkSync(DB_PATH); } catch { /* ignore */ }
  }
  _initPromise = null; // Force re-init on next call
  await getInitPromise();
}

/**
 * Clean up the test database after all tests.
 * Call this in afterAll() of each test suite.
 */
export function teardownTestDatabase(): void {
  if (existsSync(DB_PATH)) {
    try { unlinkSync(DB_PATH); } catch { /* ignore */ }
  }
}

export interface TestData {
  warehouseId: number;
  productIds: { widget: number; service: number };
  partnerIds: { customer: number; vendor: number };
  taxCodeId: number;
  taxGroupId: number;
  postingProfileId: number;
}

/**
 * Helper to create the default set of test data needed by most test suites.
 * Assumes setupTestDatabase() has been called first (seed accounts exist).
 */
export function seedTestData(): TestData {
  const now = new Date().toISOString();

  // Create a warehouse
  const whId = db.prepare(
    'INSERT INTO warehouse (code, name, address, manager, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, 1, ?, ?, 1)'
  ).run('WH-MAIN', 'Main Warehouse', '123 Storage Ave', 'John Doe', now, now)
    .lastInsertRowid as number;

  // Create a stock product
  const prod1Id = db.prepare(
    'INSERT INTO product (code, name, description, itemType, unitOfMeasure, salesPrice, purchasePrice, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)'
  ).run('PR-TEST-01', 'Widget', 'A stock widget', 'stock', 'pcs', 2999, 1500, now, now)
    .lastInsertRowid as number;

  // Create a service product
  const prod2Id = db.prepare(
    'INSERT INTO product (code, name, description, itemType, unitOfMeasure, salesPrice, purchasePrice, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)'
  ).run('PR-TEST-02', 'Service Item', 'A consulting service', 'service', 'hrs', 10000, 0, now, now)
    .lastInsertRowid as number;

  // Create a customer partner
  const partnerId = db.prepare(
    'INSERT INTO business_partner (code, name, type, email, city, status, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)'
  ).run('BP-TEST-01', 'Test Customer', 'customer', 'test@test.com', 'New York', 'active', now, now)
    .lastInsertRowid as number;

  // Create a vendor partner
  const vendorId = db.prepare(
    'INSERT INTO business_partner (code, name, type, email, city, status, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)'
  ).run('BP-TEST-02', 'Test Vendor', 'vendor', 'vendor@test.com', 'Chicago', 'active', now, now)
    .lastInsertRowid as number;

  // Create a tax group (container) + one tax type under it
  const groupId = db.prepare(
    'INSERT INTO tax_code (code, name, rate, type, parentId, accountCode, isActive, isSystemCode, effectiveFrom, effectiveTo, isGroup, filingPeriod, createdAt, updatedAt, version) VALUES (?, ?, 0, \'output\', NULL, \'\', 1, 0, ?, NULL, 1, \'monthly\', ?, ?, 1)'
  ).run('VAT-GRP', 'Test VAT Group', '2026-01-01', now, now).lastInsertRowid as number;
  const taxId = db.prepare(
    'INSERT INTO tax_code (code, name, rate, type, parentId, accountCode, isActive, isSystemCode, effectiveFrom, effectiveTo, isGroup, filingPeriod, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, NULL, 0, \'monthly\', ?, ?, 1)'
  ).run('VAT20', 'Standard VAT 20%', 20, 'output', groupId, '202', '2026-01-01', now, now)
    .lastInsertRowid as number;

  // Create a posting profile (dead VAT/adjustment columns dropped in Phase 7)
  const profileId = db.prepare(
    'INSERT INTO posting_profile (name, invoiceType, accountsReceivableCode, accountsPayableCode, cashAccountCode, discountAccountCode, inventoryAccountCode, cogsAccountCode, isDefault, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, 1)'
  ).run('Default Sales', 'sales', '102', '201', '101', '502', '103', '501', now, now)
    .lastInsertRowid as number;

  return {
    warehouseId: whId,
    productIds: { widget: prod1Id, service: prod2Id },
    partnerIds: { customer: partnerId, vendor: vendorId },
    taxCodeId: taxId,
    taxGroupId: groupId,
    postingProfileId: profileId,
  };
}
