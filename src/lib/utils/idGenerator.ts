import { db, ensureSequence, sanitizeCategoryCode } from '../db';

/**
 * All sequence reads + increments run inside a transaction, so two concurrent
 * calls can never hand out the same number (Critical Bug Fix #8).
 */

/** Takes the next number from an existing sequence row (must exist via ensureSequence). */
function takeNextFrom(documentType: string): string {
  let result = '';
  const transaction = db.transaction(() => {
    const seq = db.prepare('SELECT * FROM document_sequence WHERE documentType = ?').get(documentType) as any;
    const num = seq.nextNumber;
    const padded = String(num).padStart(seq.padding, '0');
    db.prepare('UPDATE document_sequence SET nextNumber = nextNumber + 1, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), seq.id);
    result = seq.prefix + padded;
  });
  transaction();
  return result;
}

export function generateInvoiceNumber(type: string): string {
  let result = '';
  const transaction = db.transaction(() => {
    const prefixMap: Record<string, string> = {
      sales: 'INV-S-',
      purchase: 'INV-P-',
      credit_note: 'CN-',
      debit_note: 'DN-',
    };
    const prefix = prefixMap[type] || 'INV-';
    const seq = db.prepare('SELECT * FROM document_sequence WHERE documentType = ?').get(type) as any;
    if (!seq) {
      const now = new Date().toISOString();
      db.prepare('INSERT INTO document_sequence (documentType, prefix, nextNumber, padding, createdAt, updatedAt) VALUES (?, ?, 2, 6, ?, ?)').run(type, prefix, now, now);
      result = prefix + '000001';
    } else {
      const num = seq.nextNumber;
      const padded = String(num).padStart(seq.padding, '0');
      db.prepare('UPDATE document_sequence SET nextNumber = nextNumber + 1, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), seq.id);
      result = prefix + padded;
    }
  });
  transaction();
  return result;
}

export function generateEntryNumber(category?: { id: number; code: string } | null): string {
  // Per-category numbering: entry_cat_<id> with prefix JE-<CODE>-; uncategorized
  // entries fall back to the plain journal sequence (JE-).
  if (category) {
    const seqType = `entry_cat_${category.id}`;
    ensureSequence(seqType, `JE-${sanitizeCategoryCode(category.code)}-`, 6);
    return takeNextFrom(seqType);
  }
  ensureSequence('entry_journal', 'JE-', 6);
  return takeNextFrom('entry_journal');
}

export function generateMovementNumber(type: string): string {
  let result = '';
  const transaction = db.transaction(() => {
    const prefixMap: Record<string, string> = {
      receipt: 'MR-',
      issue: 'MI-',
      transfer: 'MT-',
      adjustment: 'MA-',
      return: 'MRT-',
    };
    const prefix = prefixMap[type] || 'MV-';
    const seqType = 'movement_' + type;
    const seq = db.prepare('SELECT * FROM document_sequence WHERE documentType = ?').get(seqType) as any;
    if (!seq) {
      const now = new Date().toISOString();
      db.prepare('INSERT INTO document_sequence (documentType, prefix, nextNumber, padding, createdAt, updatedAt) VALUES (?, ?, 2, 6, ?, ?)').run(seqType, prefix, now, now);
      result = prefix + '000001';
    } else {
      const num = seq.nextNumber;
      const padded = String(num).padStart(seq.padding, '0');
      db.prepare('UPDATE document_sequence SET nextNumber = nextNumber + 1, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), seq.id);
      result = prefix + padded;
    }
  });
  transaction();
  return result;
}

export function generatePartnerCode(): string {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(code, 4) AS INTEGER)) AS maxNum FROM business_partner WHERE code LIKE 'BP-%'").get() as any;
  const next = (row?.maxNum || 0) + 1;
  return 'BP-' + String(next).padStart(5, '0');
}

export function generatePONumber(): string {
  let result = '';
  const transaction = db.transaction(() => {
    const seq = db.prepare("SELECT * FROM document_sequence WHERE documentType = 'purchase_order'").get() as any;
    if (!seq) {
      const now = new Date().toISOString();
      db.prepare("INSERT INTO document_sequence (documentType, prefix, nextNumber, padding, createdAt, updatedAt) VALUES ('purchase_order', 'PO-', 2, 6, ?, ?)").run(now, now);
      result = 'PO-000001';
    } else {
      const num = seq.nextNumber;
      const padded = String(num).padStart(seq.padding, '0');
      db.prepare('UPDATE document_sequence SET nextNumber = nextNumber + 1, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), seq.id);
      result = seq.prefix + padded;
    }
  });
  transaction();
  return result;
}

export function generateReceiptNumber(): string {
  let result = '';
  const transaction = db.transaction(() => {
    const seq = db.prepare("SELECT * FROM document_sequence WHERE documentType = 'goods_receipt'").get() as any;
    if (!seq) {
      const now = new Date().toISOString();
      db.prepare("INSERT INTO document_sequence (documentType, prefix, nextNumber, padding, createdAt, updatedAt) VALUES ('goods_receipt', 'GR-', 2, 6, ?, ?)").run(now, now);
      result = 'GR-000001';
    } else {
      const num = seq.nextNumber;
      const padded = String(num).padStart(seq.padding, '0');
      db.prepare('UPDATE document_sequence SET nextNumber = nextNumber + 1, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), seq.id);
      result = seq.prefix + padded;
    }
  });
  transaction();
  return result;
}

export function generateProductCode(): string {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(code, 4) AS INTEGER)) AS maxNum FROM product WHERE code LIKE 'PR-%'").get() as any;
  const next = (row?.maxNum || 0) + 1;
  return 'PR-' + String(next).padStart(5, '0');
}

export function generateCategoryCode(): string {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(code, 5) AS INTEGER)) AS maxNum FROM product_category WHERE code LIKE 'CAT-%'").get() as any;
  const next = (row?.maxNum || 0) + 1;
  return 'CAT-' + String(next).padStart(4, '0');
}

export function generateEmployeeCode(): string {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(code, 4) AS INTEGER)) AS maxNum FROM employee WHERE code LIKE 'EM-%'").get() as any;
  const next = (row?.maxNum || 0) + 1;
  return 'EM-' + String(next).padStart(5, '0');
}
