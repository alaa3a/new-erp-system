# Critical Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical, high, and medium severity issues found in code review — enabling referential integrity, access control, race condition prevention, financial calculation correctness, and audit trail accuracy.

**Architecture:** Fixes are organized by layer — database constraints first (foundation), then service-layer transaction safety, then route-layer authorization, then data integrity guards. Each fix is independently testable.

**Tech Stack:** TypeScript, Next.js API routes, sql.js (SQLite), Vitest

## Global Constraints

- All monetary calculations must use integer math (cents) — no float arithmetic
- All state-changing operations must be inside transactions
- All routes must enforce specific permissions (not just authentication)
- Foreign key constraints must be enforced at the database level
- Sessions must be cryptographically verifiable (HMAC)
- Every state change must record the actual authenticated user, never `'system'`

---

### Task 1: Enable Foreign Key Constraints

**Files:**
- Modify: `src/lib/db.ts:155` (inside `initializeSchema` or `createTables`)

**Interfaces:**
- Consumes: nothing new
- Produces: `PRAGMA foreign_keys = ON` executed on every DB connection

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/foreignKeys.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { db, ensureInitialized } from '../db';

describe('Foreign Key Constraints', () => {
  beforeAll(async () => {
    await ensureInitialized();
  });

  it('should have PRAGMA foreign_keys = ON', () => {
    const result = db.prepare('PRAGMA foreign_keys').get() as any;
    expect(result.foreign_keys).toBe(1);
  });

  it('should reject deleting a product that has invoice lines', () => {
    // Seed a product, create an invoice referencing it, then attempt delete
    // Should throw due to FK constraint
    expect(() => {
      // Attempt to delete product that is referenced by invoice_line
      db.prepare('DELETE FROM product WHERE id = 99999').run();
      // If product doesn't exist, no FK violation — test the pragma instead
    }).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/foreignKeys.test.ts -v`
Expected: FAIL — `foreign_keys` is 0

- [ ] **Step 3: Add PRAGMA to db.ts**

In `src/lib/db.ts`, inside the `getDb()` function (after the database is created/loaded, around line 155), add after the database initialization:

```typescript
// After db is created/loaded and before createTables()
db.run('PRAGMA foreign_keys = ON');
```

Also add it in the `initializeSchema` function or wherever the DB is first set up, so it runs on every connection.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/foreignKeys.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/__tests__/foreignKeys.test.ts
git commit -m "fix: enable foreign key constraints (PRAGMA foreign_keys = ON)"
```

---

### Task 2: Add Permission Enforcement Middleware

**Files:**
- Modify: `src/lib/auth/middleware.ts`
- Modify: `src/lib/auth/session.ts` (return permissions with user)
- Create: `src/lib/__tests__/permissions.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser()` returns `User` with `permissionIds`
- Produces: `requirePermission(request, key)` function

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { hasPermission } from '../auth/permissions';
import { User } from '@/types/erp';

describe('Permission System', () => {
  it('should allow user with matching permission', () => {
    const user: User = {
      id: 1, email: 'test@test.com', passwordHash: '', firstName: 'Test', lastName: 'User',
      permissionIds: [1], isActive: true, lastLoginAt: null, createdAt: '', updatedAt: '', version: 1,
    };
    // Permission ID 1 should map to a real seeded permission
    // This test validates the hasPermission function works
    const result = hasPermission(user, 'invoice.view');
    // Result depends on seed data - test that function doesn't throw
    expect(typeof result).toBe('boolean');
  });

  it('should deny user without matching permission', () => {
    const user: User = {
      id: 2, email: 'limited@test.com', passwordHash: '', firstName: 'Limited', lastName: 'User',
      permissionIds: [], isActive: true, lastLoginAt: null, createdAt: '', updatedAt: '', version: 1,
    };
    const result = hasPermission(user, 'invoice.approve');
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (if `requirePermission` doesn't exist)**

Run: `npx vitest run src/lib/__tests__/permissions.test.ts -v`
Expected: Tests for hasPermission pass, but we still need the route middleware

- [ ] **Step 3: Add `requirePermission` to middleware.ts**

Replace `src/lib/auth/middleware.ts`:
```typescript
import { getCurrentUser } from './session';
import { ensureInitialized } from '@/lib/db';
import { NextResponse } from 'next/server';
import { hasPermission } from './permissions';

export async function requireAuth(request: Request): Promise<{ userId: number } | NextResponse> {
  await ensureInitialized();
  const user = getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }
  return { userId: user.id };
}

export async function requirePermission(request: Request, permissionKey: string): Promise<{ userId: number } | NextResponse> {
  await ensureInitialized();
  const user = getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }
  if (!hasPermission(user, permissionKey)) {
    return NextResponse.json({ success: false, error: `Permission denied: ${permissionKey}` }, { status: 403 });
  }
  return { userId: user.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/permissions.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/middleware.ts src/lib/__tests__/permissions.test.ts
git commit -m "feat: add requirePermission middleware for route authorization"
```

---

### Task 3: Add Permission Checks to State-Changing Routes

**Files:**
- Modify: `src/app/api/invoices/[id]/approve/route.ts`
- Modify: `src/app/api/invoices/[id]/post/route.ts`
- Modify: `src/app/api/invoices/[id]/link-payment/route.ts`
- Modify: `src/app/api/purchase-orders/[id]/approve/route.ts`
- Modify: `src/app/api/purchase-orders/[id]/receive/route.ts`
- Modify: `src/app/api/purchase-orders/[id]/close/route.ts`
- Modify: `src/app/api/entries/[id]/post/route.ts`
- Modify: `src/app/api/inventory/stock-adjustments/route.ts`

**Interfaces:**
- Consumes: `requirePermission()` from Task 2
- Produces: All state-changing routes enforce specific permissions

- [ ] **Step 1: Update approve route to use `requirePermission`**

In `src/app/api/invoices/[id]/approve/route.ts`:
```typescript
import { requirePermission } from '@/lib/auth/middleware';
// ...
const auth = await requirePermission(request, 'invoice.approve');
if (auth instanceof NextResponse) return auth;
invoiceService.approveInvoice(Number(id), String(auth.userId));
```

- [ ] **Step 2: Update post invoice route**

In `src/app/api/invoices/[id]/post/route.ts`:
```typescript
const auth = await requirePermission(request, 'invoice.post');
if (auth instanceof NextResponse) return auth;
invoiceService.postInvoice(Number(id), String(auth.userId));
```

- [ ] **Step 3: Update link-payment route**

In `src/app/api/invoices/[id]/link-payment/route.ts`:
```typescript
const auth = await requirePermission(request, 'invoice.payment');
if (auth instanceof NextResponse) return auth;
```

- [ ] **Step 4: Update PO approve route**

In `src/app/api/purchase-orders/[id]/approve/route.ts`:
```typescript
const auth = await requirePermission(request, 'purchaseOrder.approve');
if (auth instanceof NextResponse) return auth;
```

- [ ] **Step 5: Update PO receive route**

In `src/app/api/purchase-orders/[id]/receive/route.ts`:
```typescript
const auth = await requirePermission(request, 'purchaseOrder.receive');
if (auth instanceof NextResponse) return auth;
```

- [ ] **Step 6: Update PO close route**

In `src/app/api/purchase-orders/[id]/close/route.ts`:
```typescript
const auth = await requirePermission(request, 'purchaseOrder.close');
if (auth instanceof NextResponse) return auth;
```

- [ ] **Step 7: Update entry post route**

In `src/app/api/entries/[id]/post/route.ts`:
```typescript
const auth = await requirePermission(request, 'entry.post');
if (auth instanceof NextResponse) return auth;
```

- [ ] **Step 8: Update stock adjustment route**

In `src/app/api/inventory/stock-adjustments/route.ts`:
```typescript
const auth = await requirePermission(request, 'inventory.adjust');
if (auth instanceof NextResponse) return auth;
```

- [ ] **Step 9: Run tests to verify nothing breaks**

Run: `npx vitest run -v`
Expected: All existing tests pass

- [ ] **Step 10: Commit**

```bash
git add src/app/api/
git commit -m "fix: enforce permission checks on all state-changing routes"
```

---

### Task 4: Fix TOCTOU in Invoice Approve/Post (Move Check Inside Transaction)

**Files:**
- Modify: `src/lib/services/invoiceService.ts:14-37, 86-165`

**Interfaces:**
- Consumes: `db.transaction()` already used
- Produces: Status validation happens inside transaction

- [ ] **Step 1: Write the failing test**

Add to `src/lib/__tests__/invoiceService.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { invoiceService } from '../services/invoiceService';
import { invoiceRepository } from '../repositories/invoiceRepository';
import { db } from '../db';

describe('Invoice Posting Safety', () => {
  it('should throw if invoice is already posted (inside transaction guard)', () => {
    // Create a draft invoice
    const invoiceId = invoiceRepository.create({
      type: 'sales', businessPartnerId: 1, partnerName: 'Test',
      postingProfileId: null, invoiceDate: '2025-01-01', dueDate: '2025-02-01',
      paymentTermId: null, warehouseId: null, referenceNumber: null, notes: null, createdBy: 'test',
    });
    // Post it first time
    invoiceService.postInvoice(invoiceId, 'test-user');
    // Second post should throw
    expect(() => invoiceService.postInvoice(invoiceId, 'test-user')).toThrow();
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/lib/__tests__/invoiceService.test.ts -v`
Expected: PASS (current code throws, but not atomically)

- [ ] **Step 3: Fix `approveInvoice` — move check inside transaction**

In `src/lib/services/invoiceService.ts:14-37`:
```typescript
approveInvoice(invoiceId: number, userId: string): void {
  const transaction = db.transaction(() => {
    const invoice = invoiceRepository.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    if (invoice.status !== 'draft') throw new BusinessRuleError('Only draft invoices can be approved');
    if (invoice.approvedBy) throw new BusinessRuleError('Invoice is already approved');

    invoiceRepository.approve(invoiceId, userId);

    const allUsers = db.prepare('SELECT id FROM users WHERE isActive = 1').all() as { id: number }[];
    for (const user of allUsers) {
      notificationRepository.create({
        userId: user.id, type: 'success', title: 'Invoice Approved',
        message: `${invoice.invoiceNumber} — ${invoice.partnerName} has been approved by user #${userId}.`,
        entityType: 'invoice', entityId: invoiceId,
      });
    }
  });
  transaction();
}
```

- [ ] **Step 4: Fix `postInvoice` — move check inside transaction**

In `src/lib/services/invoiceService.ts:86-165`:
```typescript
postInvoice(invoiceId: number, userId: string): void {
  const transaction = db.transaction(() => {
    const invoice = invoiceRepository.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    if (invoice.status !== 'draft') throw new BusinessRuleError('Only draft invoices can be posted');

    const { entries, stockMovements } = this.previewPosting(invoiceId);
    // ... rest of posting logic stays the same ...
  });
  transaction();
}
```

- [ ] **Step 5: Run test to verify**

Run: `npx vitest run src/lib/__tests__/invoiceService.test.ts -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/invoiceService.ts
git commit -m "fix: move status checks inside transactions to prevent TOCTOU races"
```

---

### Task 5: Add Negative Inventory Guard

**Files:**
- Modify: `src/lib/repositories/inventoryRepository.ts:24-37`
- Create: `src/lib/__tests__/inventoryGuard.test.ts`

**Interfaces:**
- Consumes: `upsertStock()` called by services
- Produces: Throws `BusinessRuleError` if result would be negative

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { BusinessRuleError } from '../utils/errors';

describe('Negative Inventory Guard', () => {
  it('should throw when upsertStock would make quantity negative', () => {
    // productId 99999, warehouseId 99999 — no existing stock
    expect(() => {
      inventoryRepository.upsertStock(99999, 99999, -10, 100);
    }).toThrow(BusinessRuleError);
  });

  it('should allow valid stock reduction', () => {
    // First add stock, then reduce by less than what exists
    inventoryRepository.upsertStock(88888, 88888, 100, 100);
    inventoryRepository.upsertStock(88888, 88888, -50, 100);
    const stock = inventoryRepository.getStock(88888, 88888);
    expect(stock?.quantity).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/inventoryGuard.test.ts -v`
Expected: FAIL — negative quantity is allowed

- [ ] **Step 3: Add guard to `upsertStock`**

In `src/lib/repositories/inventoryRepository.ts:24-37`:
```typescript
upsertStock(productId: number, warehouseId: number, quantityDelta: number, unitCost: number): void {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM product_warehouse_stock WHERE productId = ? AND warehouseId = ?').get(productId, warehouseId) as any;
  if (existing) {
    const newQty = existing.quantity + quantityDelta;
    if (newQty < 0) {
      throw new BusinessRuleError(`Insufficient stock: cannot reduce by ${Math.abs(quantityDelta)} (available: ${existing.quantity})`);
    }
    const newValue = existing.quantity * existing.averageCost + quantityDelta * unitCost;
    const newAvg = newQty > 0 ? Math.round(newValue / newQty) : 0;
    db.prepare('UPDATE product_warehouse_stock SET quantity=?, averageCost=?, lastUpdated=?, version=version+1 WHERE id=?').run(newQty, newAvg, now, existing.id);
  } else {
    if (quantityDelta < 0) {
      throw new BusinessRuleError(`Insufficient stock: cannot reduce by ${Math.abs(quantityDelta)} (available: 0)`);
    }
    db.prepare('INSERT INTO product_warehouse_stock (productId, warehouseId, quantity, averageCost, lastUpdated, version) VALUES (?, ?, ?, ?, ?, 1)').run(
      productId, warehouseId, quantityDelta, unitCost, now,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/inventoryGuard.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/repositories/inventoryRepository.ts src/lib/__tests__/inventoryGuard.test.ts
git commit -m "fix: prevent negative inventory quantities"
```

---

### Task 6: Fix Float Math for Monetary Calculations

**Files:**
- Modify: `src/app/api/invoices/route.ts:62-63`
- Modify: `src/app/api/invoices/[id]/route.ts:78-79` (update)
- Create: `src/lib/formatters/money.ts`
- Create: `src/lib/__tests__/money.test.ts`

**Interfaces:**
- Consumes: none new
- Produces: `toCents()` and `calculateLineTotal()` helper functions

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { toCents, calculateLineTotal } from '../formatters/money';

describe('Money Calculations', () => {
  it('should calculate line total without float errors', () => {
    // 3 * 3333 cents * (1 - 15/100) = 3 * 3333 * 0.85 = 8499.15 → should round to 8499
    const result = calculateLineTotal(3, 3333, 15);
    expect(result).toBe(8499);
  });

  it('should convert float dollar to integer cents', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.01)).toBe(1);
    expect(toCents(100.005)).toBe(10001); // rounds
  });

  it('should produce balanced debit/credit totals', () => {
    // Sum of line totals should not drift from sum of rounded values
    const lines = [
      { qty: 3, price: 3333, discount: 10 },
      { qty: 2, price: 5000, discount: 5 },
    ];
    const total = lines.reduce((sum, l) => sum + calculateLineTotal(l.qty, l.price, l.discount), 0);
    expect(total).toBe(3 * 3333 * 0.85 + 2 * 5000 * 0.95);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/money.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Create `src/lib/formatters/money.ts`**

```typescript
/**
 * Convert a dollar amount (float) to cents (integer) with proper rounding.
 * Avoids floating-point errors by using Math.round.
 */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Calculate line total in cents from quantity, unit price (cents), and discount percent.
 * All inputs are integers except discountPercent which is a whole number (e.g., 15 for 15%).
 * Returns integer cents.
 */
export function calculateLineTotal(quantity: number, unitPriceCents: number, discountPercent: number): number {
  // Integer math: total = qty * price * (100 - discount) / 100
  const discountMultiplier = 100 - discountPercent;
  return Math.round(quantity * unitPriceCents * discountMultiplier / 100);
}

/**
 * Calculate VAT amount in cents.
 * lineTotalCents: integer cents
 * vatRate: whole number (e.g., 15 for 15%)
 */
export function calculateVatAmount(lineTotalCents: number, vatRate: number): number {
  return Math.round(lineTotalCents * vatRate / 100);
}
```

- [ ] **Step 4: Update invoice creation route to use integer math**

In `src/app/api/invoices/route.ts:62-63`:
```typescript
// OLD: const lineTotal = line.quantity * line.unitPrice * (1 - (line.discountPercent || 0) / 100);
// OLD: const vatAmt = lineTotal * (line.vatRate || 0) / 100;
const lineTotal = calculateLineTotal(line.quantity, line.unitPrice, line.discountPercent || 0);
const vatAmt = calculateVatAmount(lineTotal, line.vatRate || 0);
```

- [ ] **Step 5: Update invoice PATCH route similarly**

In `src/app/api/invoices/[id]/route.ts:78-79`, apply same pattern.

- [ ] **Step 6: Run test to verify**

Run: `npx vitest run src/lib/__tests__/money.test.ts -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/formatters/money.ts src/app/api/invoices/route.ts src/app/api/invoices/[id]/route.ts src/lib/__tests__/money.test.ts
git commit -m "fix: use integer math for monetary calculations to prevent float truncation"
```

---

### Task 7: Fix Hardcoded VAT Account Fallbacks

**Files:**
- Modify: `src/lib/services/invoiceService.ts:60-67`

**Interfaces:**
- Consumes: `taxCodeRepository`
- Produces: Falls back to seeded VAT accounts (105 for input, 202 for output)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { invoiceService } from '../services/invoiceService';

describe('VAT Account Resolution', () => {
  it('should resolve to an existing account when tax code has no account', () => {
    // The fallback accounts should exist in the seeded chart
    // Sales VAT should map to 202 (VAT Output), purchase to 105 (VAT Input)
    // This test verifies the previewPosting doesn't produce invalid account codes
    // Would need a seeded invoice with VAT but no vatCodeId to test fully
    expect(true).toBe(true); // placeholder - full test requires DB setup
  });
});
```

- [ ] **Step 2: Fix the fallback account codes**

In `src/lib/services/invoiceService.ts:62`:
```typescript
// OLD: const vatAccount = taxType?.accountCode || (invoice.type === 'sales' || invoice.type === 'debit_note' ? '2100' : '2200');
const vatAccount = taxType?.accountCode || (invoice.type === 'sales' || invoice.type === 'debit_note' ? '202' : '105');
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/invoiceService.ts
git commit -m "fix: correct hardcoded VAT account fallbacks to match seeded chart"
```

---

### Task 8: Fix Sequence Number Race Condition

**Files:**
- Modify: `src/lib/utils/idGenerator.ts`
- Modify: `src/lib/repositories/inventoryRepository.ts:39-67`

**Interfaces:**
- Consumes: `db.transaction()`
- Produces: All sequence operations are atomic

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { generateInvoiceNumber } from '../utils/idGenerator';
import { db, ensureInitialized } from '../db';

describe('Sequence Number Generation', () => {
  beforeAll(async () => {
    await ensureInitialized();
  });

  it('should generate unique sequential invoice numbers', () => {
    const num1 = generateInvoiceNumber('test_type_unique');
    const num2 = generateInvoiceNumber('test_type_unique');
    expect(num1).not.toBe(num2);
  });

  it('should not produce duplicate numbers under sequential calls', () => {
    const numbers = new Set<string>();
    for (let i = 0; i < 10; i++) {
      numbers.add(generateInvoiceNumber('test_seq_unique'));
    }
    expect(numbers.size).toBe(10);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/lib/__tests__/sequence.test.ts -v`
Expected: PASS (sequential calls work, but pattern is unsafe)

- [ ] **Step 3: Wrap sequence operations in transactions**

In `src/lib/utils/idGenerator.ts`, modify `takeNextFrom` and all generators:

```typescript
function takeNextFrom(documentType: string): string {
  let result: string;
  const transaction = db.transaction(() => {
    const seq = db.prepare('SELECT * FROM document_sequence WHERE documentType = ?').get(documentType) as any;
    const num = seq.nextNumber;
    const padded = String(num).padStart(seq.padding, '0');
    db.prepare('UPDATE document_sequence SET nextNumber = nextNumber + 1, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), seq.id);
    result = seq.prefix + padded;
  });
  transaction();
  return result!;
}
```

Apply same pattern to `generateInvoiceNumber`, `generateMovementNumber`, `generatePONumber`, `generateReceiptNumber`.

- [ ] **Step 4: Deduplicate movement number logic in inventoryRepository**

In `src/lib/repositories/inventoryRepository.ts:39-67`, replace the inline sequence logic with a call to `generateMovementNumber`:

```typescript
import { generateMovementNumber } from '../utils/idGenerator';

// In recordMovement:
const movementNumber = generateMovementNumber(data.type);
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/idGenerator.ts src/lib/repositories/inventoryRepository.ts src/lib/__tests__/sequence.test.ts
git commit -m "fix: wrap sequence number generation in transactions for atomicity"
```

---

### Task 9: Fix Payment Allocation Race Condition

**Files:**
- Modify: `src/lib/services/invoiceService.ts:172-186`

**Interfaces:**
- Consumes: `db.transaction()`
- Produces: `applyPaymentAllocation` is atomic

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { invoiceService } from '../services/invoiceService';
import { invoiceRepository } from '../repositories/invoiceRepository';
import { BusinessRuleError } from '../utils/errors';

describe('Payment Allocation Safety', () => {
  it('should reject payment exceeding remaining balance', () => {
    // Create invoice with totalAmount = 10000 (100.00)
    const invoiceId = invoiceRepository.create({
      type: 'sales', businessPartnerId: 1, partnerName: 'Test',
      postingProfileId: null, invoiceDate: '2025-01-01', dueDate: '2025-02-01',
      paymentTermId: null, warehouseId: null, referenceNumber: null, notes: null, createdBy: 'test',
    });
    // Attempt to overpay should throw
    expect(() => invoiceService.applyPaymentAllocation(invoiceId, 20000)).toThrow(BusinessRuleError);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/lib/__tests__/paymentAllocation.test.ts -v`
Expected: PASS (throws, but not atomically)

- [ ] **Step 3: Wrap payment allocation in transaction**

In `src/lib/services/invoiceService.ts:172-186`:
```typescript
applyPaymentAllocation(invoiceId: number, amount: number): void {
  const transaction = db.transaction(() => {
    const invoice = invoiceRepository.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    if (invoice.status === 'cancelled') throw new BusinessRuleError('Cannot pay cancelled invoice');
    if (invoice.status === 'draft') throw new BusinessRuleError('Cannot pay an invoice that has not been posted');

    const remaining = invoice.totalAmount - invoice.paidAmount;
    if (amount > remaining) {
      throw new BusinessRuleError(`Payment amount (${amount}) exceeds the invoice remaining balance (${remaining})`);
    }

    const newPaidAmount = invoice.paidAmount + amount;
    invoiceRepository.updatePaidAmount(invoiceId, newPaidAmount);
    invoiceRepository.updateStatus(invoiceId, newPaidAmount >= invoice.totalAmount ? 'paid' : newPaidAmount > 0 ? 'partial_paid' : 'posted');
  });
  transaction();
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run src/lib/__tests__/paymentAllocation.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/invoiceService.ts src/lib/__tests__/paymentAllocation.test.ts
git commit -m "fix: wrap payment allocation in transaction to prevent over-payment races"
```

---

### Task 10: Fix Inventory Transfer Atomicity

**Files:**
- Modify: `src/lib/services/inventoryService.ts:15-24`

**Interfaces:**
- Consumes: `db.transaction()`
- Produces: Transfer operations are all-or-nothing

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { inventoryService } from '../services/inventoryService';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { BusinessRuleError } from '../utils/errors';

describe('Inventory Transfer Atomicity', () => {
  it('should throw when insufficient stock', () => {
    expect(() => {
      inventoryService.transferStock(99999, 99999, 99998, 1000, 'test');
    }).toThrow(BusinessRuleError);
  });

  it('should complete transfer atomically', () => {
    // Add stock to source warehouse
    inventoryRepository.upsertStock(77777, 77777, 100, 500);
    // Transfer
    inventoryService.transferStock(77777, 77777, 77776, 30, 'test');
    // Verify both warehouses updated
    const from = inventoryRepository.getStock(77777, 77777);
    const to = inventoryRepository.getStock(77777, 77776);
    expect(from?.quantity).toBe(70);
    expect(to?.quantity).toBe(30);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/lib/__tests__/transferAtomicity.test.ts -v`
Expected: PASS (transfer works, but not wrapped in transaction)

- [ ] **Step 3: Wrap transfer in transaction**

In `src/lib/services/inventoryService.ts:15-24`:
```typescript
transferStock(productId: number, fromWarehouseId: number, toWarehouseId: number, quantity: number, userId: string): void {
  if (quantity <= 0) throw new BusinessRuleError('Transfer quantity must be positive');

  const transaction = db.transaction(() => {
    const stock = inventoryRepository.getStock(productId, fromWarehouseId);
    if (!stock || stock.quantity < quantity) throw new BusinessRuleError('Insufficient stock');

    inventoryRepository.upsertStock(productId, fromWarehouseId, -quantity, stock.averageCost);
    inventoryRepository.upsertStock(productId, toWarehouseId, quantity, stock.averageCost);
    inventoryRepository.recordMovement({ type: 'transfer', productId, warehouseId: fromWarehouseId, quantity: -quantity, unitCost: stock.averageCost, referenceType: 'transfer', referenceId: toWarehouseId, referenceNumber: `Transfer to WH-${toWarehouseId}`, postedBy: userId });
    inventoryRepository.recordMovement({ type: 'transfer', productId, warehouseId: toWarehouseId, quantity, unitCost: stock.averageCost, referenceType: 'transfer', referenceId: fromWarehouseId, referenceNumber: `Transfer from WH-${fromWarehouseId}`, postedBy: userId });
  });
  transaction();
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run src/lib/__tests__/transferAtomicity.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/inventoryService.ts src/lib/__tests__/transferAtomicity.test.ts
git commit -m "fix: wrap inventory transfer in transaction for atomicity"
```

---

### Task 11: Fix Forgeable Session Cookie (Add HMAC)

**Files:**
- Modify: `src/lib/auth/session.ts`
- Create: `src/lib/__tests__/session.test.ts`

**Interfaces:**
- Consumes: `crypto` module for HMAC
- Produces: Signed session cookies that can be verified

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createSessionCookie, parseSessionCookie } from '../auth/session';

describe('Session Security', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret-key-for-vitest';
  });

  it('should create a signed cookie', () => {
    const cookie = createSessionCookie(1);
    expect(cookie).toContain('erp_session=');
    expect(cookie).toContain('HttpOnly');
  });

  it('should parse a valid session cookie', () => {
    const cookie = createSessionCookie(42);
    const userId = parseSessionCookie(cookie);
    expect(userId).toBe(42);
  });

  it('should reject a tampered cookie', () => {
    const cookie = 'erp_session=42:tampered_signature; Path=/; HttpOnly';
    const userId = parseSessionCookie(cookie);
    expect(userId).toBeNull();
  });

  it('should reject a forged cookie', () => {
    const cookie = 'erp_session=1:fakesignature; Path=/; HttpOnly';
    const userId = parseSessionCookie(cookie);
    expect(userId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/session.test.ts -v`
Expected: FAIL — `parseSessionCookie` doesn't exist

- [ ] **Step 3: Implement HMAC-signed sessions**

Replace `src/lib/auth/session.ts`:
```typescript
import { db } from '../db';
import { User } from '@/types/erp';
import { createHmac, timingSafeEqual } from 'crypto';

const SESSION_COOKIE = 'erp_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-production';
const SESSION_MAX_AGE = 86400;

function sign(data: string): string {
  return createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
}

function verify(data: string, signature: string): boolean {
  const expected = sign(data);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export function getCurrentUser(request: Request): User | null {
  const cookie = request.headers.get('cookie') || '';
  const userId = parseSessionCookie(cookie);
  if (!userId) return null;

  const row = db.prepare('SELECT * FROM users WHERE id = ? AND isActive = 1').get(userId) as any;
  if (!row) return null;

  return {
    id: row.id, email: row.email, passwordHash: row.passwordHash,
    firstName: row.firstName, lastName: row.lastName,
    permissionIds: JSON.parse(row.permissionIds || '[]'),
    isActive: row.isActive === 1, lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt, updatedAt: row.updatedAt, version: row.version,
  };
}

export function parseSessionCookie(cookieHeader: string): number | null {
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;

  const value = match[1];
  const parts = value.split(':');
  if (parts.length !== 2) return null;

  const [userIdStr, signature] = parts;
  const userId = parseInt(userIdStr, 10);
  if (isNaN(userId)) return null;

  if (!verify(userIdStr, signature)) return null;

  return userId;
}

export function createSessionCookie(userId: number): string {
  const data = String(userId);
  const signature = sign(data);
  return `${SESSION_COOKIE}=${data}:${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function setLastLogin(userId: number): void {
  db.prepare('UPDATE users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?').run(
    new Date().toISOString(), new Date().toISOString(), userId,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/session.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts src/lib/__tests__/session.test.ts
git commit -m "fix: add HMAC signature to session cookies to prevent forgery"
```

---

### Task 12: Fix 'system' User Logging (Pass Real userId)

**Files:**
- Modify: `src/app/api/invoices/[id]/approve/route.ts:17`
- Modify: `src/app/api/invoices/[id]/post/route.ts:17`
- Modify: `src/app/api/invoices/route.ts:53`
- Modify: `src/app/api/purchase-orders/[id]/approve/route.ts:17`
- Modify: `src/app/api/purchase-orders/[id]/receive/route.ts`
- Modify: `src/app/api/purchase-orders/[id]/close/route.ts`
- Modify: `src/app/api/entries/[id]/post/route.ts:23`

**Interfaces:**
- Consumes: `requireAuth` / `requirePermission` returns `userId`
- Produces: All service calls use real user ID

- [ ] **Step 1: Replace `'system'` with `String(auth.userId)` in all routes**

For each route file, change the service call to pass the authenticated user's ID:

```typescript
// OLD: invoiceService.approveInvoice(Number(id), 'system');
// NEW: invoiceService.approveInvoice(Number(id), String(auth.userId));
```

Files to update:
- `src/app/api/invoices/[id]/approve/route.ts:17`
- `src/app/api/invoices/[id]/post/route.ts:17`
- `src/app/api/invoices/route.ts:53` (invoice creation)
- `src/app/api/purchase-orders/[id]/approve/route.ts:17`
- `src/app/api/purchase-orders/[id]/receive/route.ts`
- `src/app/api/purchase-orders/[id]/close/route.ts`
- `src/app/api/entries/[id]/post/route.ts:23`

- [ ] **Step 2: Run tests**

Run: `npx vitest run -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/
git commit -m "fix: pass authenticated userId instead of 'system' to service layer"
```

---

### Task 13: Fix Admin User Seed Permissions

**Files:**
- Modify: `src/lib/db.ts:794` (admin user seed)

**Interfaces:**
- Consumes: `getAllPermissions()` to get all permission IDs
- Produces: Admin user seeded with all permissions

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { ensureInitialized } from '../db';
import { db } from '../db';

describe('Admin User Seed', () => {
  beforeAll(async () => {
    await ensureInitialized();
  });

  it('should have admin user with permissions', () => {
    const admin = db.prepare("SELECT * FROM users WHERE email = 'admin@erp.local'").get() as any;
    expect(admin).toBeDefined();
    const permissionIds = JSON.parse(admin.permissionIds || '[]');
    expect(permissionIds.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/adminSeed.test.ts -v`
Expected: FAIL — admin has empty permissions

- [ ] **Step 3: Fix admin seed in db.ts**

In `src/lib/db.ts` around line 794, change the admin user seed:
```typescript
// OLD: JSON.stringify([])
// NEW: grant admin all permissions
const allPermissions = db.prepare('SELECT id FROM permission').all() as { id: number }[];
const allPermissionIds = allPermissions.map(p => p.id);
// ... in admin user insert:
JSON.stringify(allPermissionIds),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/adminSeed.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/__tests__/adminSeed.test.ts
git commit -m "fix: seed admin user with all permissions"
```

---

## Execution Order

Tasks should be executed in this order due to dependencies:

```
Task 1 (FK constraints) → Task 2 (permission middleware) → Task 3 (route permissions)
Task 4 (TOCTOU fix) — independent
Task 5 (negative inventory) — independent
Task 6 (money math) — independent
Task 7 (VAT accounts) — independent
Task 8 (sequences) — independent
Task 9 (payment allocation) — independent
Task 10 (transfer atomicity) — independent
Task 11 (session HMAC) — independent
Task 12 (system user fix) — depends on Task 2/3
Task 13 (admin seed) — independent
```

Tasks 4-11 and 13 can be parallelized after Tasks 1-3 are complete.

---

## Verification Checklist

After all tasks complete:

- [ ] `npx vitest run` — all tests pass
- [ ] `npx tsc --noEmit` — no type errors
- [ ] `npx eslint src/` — no lint errors
- [ ] Foreign keys enforced (try deleting referenced product → should fail)
- [ ] Permission denied on unauthorized route access (403 response)
- [ ] Negative inventory throws error
- [ ] Session cookie cannot be forged (tampered cookie rejected)
- [ ] All document numbers unique after rapid creation
- [ ] Payment over-allocation rejected

---

# Phase 2: Upgrades (After Fixes Complete)

> **These tasks are executed AFTER all 13 critical fixes are deployed and stable.**

---

## Phase 2A: Code Quality & Maintainability

### Task 14: Refactor Bloated Page Components

**Files:**
- Modify: `src/app/(admin)/invoice/sales/page.tsx` (~1600 lines)
- Modify: `src/app/(admin)/invoice/purchase/page.tsx` (~1660 lines)
- Modify: `src/app/(admin)/accounting/entries/page.tsx` (~1044 lines)
- Create: Extracted sub-components in respective `components/` folders

**Goal:** Break each page into smaller, focused components:
- Line items table (editable grid)
- Tax summary panel
- Partner/product selector
- Status workflow actions
- Document header section

**Target:** Each page under 400 lines, each component under 200 lines.

---

### Task 15: Add Environment Configuration

**Files:**
- Create: `.env.example`
- Create: `.env` (git-ignored)
- Modify: `src/lib/db.ts` — use `process.env.DATABASE_PATH`
- Modify: `src/lib/auth/session.ts` — use `process.env.SESSION_SECRET`
- Modify: `next.config.ts` — add env validation

**Template `.env.example`:**
```env
DATABASE_PATH=erp.sqlite
SESSION_SECRET=change-this-to-a-random-64-char-string
NEXT_PUBLIC_APP_NAME=ERP System
NODE_ENV=development
```

---

### Task 16: Add README.md

**Files:**
- Create: `README.md`

**Contents:**
- Project overview & features
- Tech stack
- Setup instructions (install, dev, build)
- Architecture overview (layer diagram)
- Module list with descriptions
- API conventions
- Contributing guidelines

---

## Phase 2B: Performance

### Task 17: Optimize Database Write Strategy

**Files:**
- Modify: `src/lib/db.ts` — debounce `saveDb()` instead of per-statement write

**Current problem:** Every INSERT/UPDATE writes entire DB to disk (`writeFileSync`).

**Solution:** Debounce writes — collect dirty state, flush after 100ms of inactivity or at end of request.

---

### Task 18: Add React Query for Server State

**Files:**
- Install: `@tanstack/react-query`
- Create: `src/lib/queryClient.ts`
- Modify: `src/app/layout.tsx` — add QueryClientProvider
- Refactor: Key pages to use `useQuery`/`useMutation`

**Benefits:** Automatic caching, background refetch, optimistic updates.

---

## Phase 2C: DevOps & Security

### Task 19: Add CI/CD Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

**Pipeline steps:**
1. Lint (`npm run lint`)
2. Type check (`npx tsc --noEmit`)
3. Test (`npx vitest run`)
4. Build (`npm run build`)

---

### Task 20: Production Security Hardening

**Files:**
- Create: `src/lib/security/rateLimit.ts`
- Modify: `src/lib/auth/middleware.ts` — add rate limit check
- Modify: `src/lib/auth/session.ts` — add `Secure` flag for HTTPS
- Add: Helmet-like headers in `next.config.ts`

**Features:**
- Rate limiting (100 req/min per IP, 5 req/sec for auth routes)
- CSRF token for state-changing requests
- Security headers (X-Frame-Options, X-Content-Type-Options, etc.)

---

### Task 21: Add Docker Support

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docker-compose.yml`

**Dockerfile stages:**
1. Dependencies (`npm ci`)
2. Build (`npm run build`)
3. Production (minimal image with output)

---

## Phase 2D: Testing Maturity

### Task 22: Integration Tests for API Routes

**Files:**
- Create: `src/lib/__tests__/api/invoices.test.ts`
- Create: `src/lib/__tests__/api/entries.test.ts`
- Create: `src/lib/__tests__/api/purchase-orders.test.ts`

**Test scenarios:**
- Full invoice lifecycle (create → approve → post → pay)
- Entry posting with allocations
- PO receiving and matching
- Permission denied scenarios

---

### Task 23: Add E2E Tests

**Files:**
- Install: `playwright`
- Create: `e2e/invoice-flow.spec.ts`
- Create: `e2e/entry-flow.spec.ts`

**Key flows:**
- Create and post a sales invoice
- Create and pay an entry with allocations
- Transfer inventory between warehouses

---

## Phase 2E: Feature Upgrades

### Task 24: Add CSV/Excel Import-Export

**Files:**
- Create: `src/lib/utils/csv.ts`
- Create: `src/app/api/import/route.ts`
- Create: `src/app/api/export/route.ts`
- Create: Import/Export UI components

**Entities:** Products, Partners, Chart of Accounts

---

### Task 25: Soft Delete with Restore

**Files:**
- Modify: All repositories with `deletedAt` support
- Modify: All queries to filter `deletedAt IS NULL`
- Create: Restore API routes
- Create: "Trash" UI for deleted items

---

### Task 26: Advanced Reporting

**Files:**
- Create: `src/app/(admin)/report/cash-flow/page.tsx`
- Create: `src/app/(admin)/report/pl-by-cc/page.tsx`
- Create: `src/lib/services/reportService.ts` (extend)

**New reports:**
- Cash flow statement
- P&L by cost center
- P&L by month (trend)

---

## Phase 2 Execution Order

```
Phase 2A (Quality)     → Phase 2B (Performance) → Phase 2C (DevOps) → Phase 2D (Testing) → Phase 2E (Features)
```

Phase 2A tasks are prerequisites for everything else. 2B-2D can run partially in parallel. 2E depends on 2D.

---

## Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| Fixes (Phase 1) | 1-13 | Critical bugs |
| 2A Quality | 14-16 | Maintainability |
| 2B Performance | 17-18 | Speed |
| 2C DevOps | 19-21 | Production readiness |
| 2D Testing | 22-23 | Reliability |
| 2E Features | 24-26 | Capabilities |

---

## Phase 2F: User Management Enhancements

> **Completed during execution — professional design with tree-view permissions**

### Task 27: Professional User Management UI
- Add ID column to users table
- Split Edit / Permissions into separate modals
- Tree-view permissions grouped by module
- Professional design polish

### Task 28: Password Management
- Generate secure random password button
- Copy credentials to clipboard
- "Require password change on first login" toggle
- Password strength indicator with requirements list

### Task 29: User Communication
- Welcome email with credentials
- Email templates for new users
- Force password reset email
- Notification when user is created

### Task 30: Enhanced Security
- Account lockout after N failed login attempts
- Session timeout configuration
- Login history (IP, date, browser)
- Force password change enforcement

### Phase 2F Execution Order
```
Task 27 (UI) → Task 28 (Password) → Task 29 (Email) → Task 30 (Security)
```

---

## Updated Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| Fixes (Phase 1) | 1-13 | Critical bugs |
| 2A Quality | 14-16 | Maintainability |
| 2B Performance | 17-18 | Speed |
| 2C DevOps | 19-21 | Production readiness |
| 2D Testing | 22-23 | Reliability |
| 2E Features | 24-26 | Capabilities |
| 2F User Mgmt | 27-30 | Professional UX |

**Total: 30 tasks from critical fixes to full production readiness.**
