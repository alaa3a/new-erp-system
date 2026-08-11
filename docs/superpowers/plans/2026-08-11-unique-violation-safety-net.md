# UNIQUE Constraint Safety Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee that no duplicate-code / duplicate-email insert ever returns a 500 again, and that seed data can never crash database initialization, even when soft-deleted rows still reserve unique codes.

**Architecture:** Two complementary layers. (1) The SQLite `UNIQUE` constraint is the source of truth — any pre-check that ignores soft-deleted rows can race it, so `Statement.run` in `src/lib/db.ts` catches `UNIQUE constraint failed` errors and rethrows them as a clean 409 `ConflictError`. (2) Every seed insert becomes idempotent (`INSERT OR IGNORE`), matching the pattern already used for permissions, aging buckets, and product groups, so a restored/partial DB can never crash `seedInitialData()`.

**Tech Stack:** TypeScript, sql.js (SQLite WASM), Next.js route handlers, Vitest.

## Global Constraints

- All edits stay in `src/lib/db.ts` plus one new test file `src/lib/__tests__/unique-violation.test.ts`.
- Soft-deleted rows keep their unique code/email reserved (`deletedAt` set, row remains) — pre-checks that filter `deletedAt IS NULL` can therefore pass while the `INSERT` still fails.
- No existing test asserts the raw sql.js message `UNIQUE constraint failed` (verified: zero matches). Converting that error type is safe.
- Follow existing codebase conventions: `import { ... } from '@/lib/utils/errors'`, vitest with explicit imports from `'vitest'`, and the established `INSERT OR IGNORE` seed pattern.
- Commands: unit tests `npx vitest run <file>`, full suite `npx vitest run`, typecheck `npx tsc --noEmit`.

---

### Task 1: Central DB-layer UNIQUE → ConflictError translation

**Files:**
- Modify: `src/lib/db.ts:5` (import), `src/lib/db.ts:46` (insert helper before `class Statement`), `src/lib/db.ts:82-91` (`Statement.run`)
- Test: `src/lib/__tests__/unique-violation.test.ts` (create)

**Interfaces:**
- Consumes: `ConflictError` from `@/lib/utils/errors` (exists: `class ConflictError extends AppError` with `statusCode 409`, `code 'CONFLICT'`).
- Produces: helper `uniqueViolationMessage(raw: string): string`; `Statement.run` now throws `ConflictError` instead of a raw `Error` when sql.js reports a UNIQUE constraint failure. All repositories and routes inherit this automatically.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/unique-violation.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from './test-helper';
import { db } from '../db';
import { productRepository } from '../repositories/productRepository';
import { ConflictError } from '../utils/errors';

describe('DB-layer UNIQUE safety net', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });
  afterAll(() => {
    teardownTestDatabase();
  });

  it('translates a duplicate-code INSERT into ConflictError (409), not a raw error', () => {
    const now = new Date().toISOString();
    const stmt = db.prepare(
      'INSERT INTO product (code, name, description, itemType, unitOfMeasure, salesPrice, purchasePrice, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)'
    );
    stmt.run('DUP-CODE', 'First', '', 'stock', 'pcs', 0, 0, now, now);
    let thrown: ConflictError | null = null;
    try {
      stmt.run('DUP-CODE', 'Second', '', 'stock', 'pcs', 0, 0, now, now);
    } catch (err) {
      thrown = err as ConflictError;
    }
    expect(thrown).toBeInstanceOf(ConflictError);
    expect(thrown!.statusCode).toBe(409);
    expect(thrown!.code).toBe('CONFLICT');
    expect(thrown!.message).toContain('product');
    expect(thrown!.message).toContain('already exists');
  });

  it('productRepository.create surfaces ConflictError for a code reserved by a soft-deleted row', () => {
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO product (code, name, description, itemType, unitOfMeasure, salesPrice, purchasePrice, isActive, deletedAt, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 1)'
    ).run('RESERVED-CODE', 'Ghost', '', 'stock', 'pcs', 0, 0, now, now, now);
    // Route-level pre-checks would return 400 first; this calls the repository
    // directly to prove the DB layer itself never lets a raw UNIQUE error escape.
    expect(() =>
      productRepository.create({ code: 'RESERVED-CODE', name: 'New item', itemType: 'stock', unitOfMeasure: 'pcs' })
    ).toThrow(ConflictError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/unique-violation.test.ts`

Expected: FAIL — first test throws `Error: sql.js: Error: UNIQUE constraint failed: product.code` (a raw `Error`, not a `ConflictError`), so `expect(thrown).toBeInstanceOf(ConflictError)` fails.

- [ ] **Step 3: Implement the translation in `Statement.run`**

Edit `src/lib/db.ts:5`:

```ts
import { ValidationError, ConflictError } from '@/lib/utils/errors';
```

Insert the helper immediately after `sanitizeParams` (after line 46) and before `class Statement`:

```ts
/** Human-friendly labels for tables that can raise UNIQUE-constraint conflicts. */
const ENTITY_LABELS: Record<string, string> = {
  product: 'product',
  account: 'account',
  business_partner: 'business partner',
  users: 'user',
  employee: 'employee',
  tax_code: 'tax code',
  product_profile: 'product profile',
  cost_center: 'cost center',
  warehouse: 'warehouse',
  document_sequence: 'document sequence',
};

/**
 * sql.js surfaces UNIQUE violations as a raw Error("UNIQUE constraint failed:
 * <table>.<column>"). Pre-checks that ignore soft-deleted rows can race the
 * UNIQUE constraint, so the DB layer is the last line of defense: turn these
 * into a clean 409 ConflictError instead of a 500 (duplicate create-group /
 * create-product codes were crashing with "Internal server error").
 */
function uniqueViolationMessage(raw: string): string {
  const cols = raw.replace(/^.*?UNIQUE constraint failed:\s*/, '').split(',').map((c) => c.trim());
  const [table, field] = (cols[0] ?? '').split('.');
  const entity = (table && ENTITY_LABELS[table]) || table?.replace(/_/g, ' ') || 'record';
  const label = field === 'email' ? 'email address' : field || 'value';
  return `A ${entity} with this ${label} already exists. Deleted records keep their unique ${label} reserved.`;
}
```

Replace the body of `Statement.run` (`src/lib/db.ts:82-91`):

```ts
  run(...bindParams: unknown[]): { changes: number; lastInsertRowid: number } {
    const db = ensureSync();
    const params = sanitizeParams(bindParams.length > 0 ? bindParams : this.params);
    try {
      db.run(this.sql, params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('UNIQUE constraint failed')) {
        throw new ConflictError(uniqueViolationMessage(message));
      }
      throw err;
    }
    const changes = db.getRowsModified();
    const lastId = db.exec('SELECT last_insert_rowid() AS id');
    const lastInsertRowid = lastId.length > 0 ? lastId[0].values[0][0] as number : 0;
    if (!getState().inTransaction) saveDb();
    return { changes, lastInsertRowid };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/unique-violation.test.ts`

Expected: PASS (both tests).

- [ ] **Step 5: Run the full suite to confirm no behavior change elsewhere**

Run: `npx vitest run`

Expected: PASS (all existing tests — no test asserts raw `UNIQUE constraint failed` messages, so none break).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`

Expected: exit 0, no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db.ts src/lib/__tests__/unique-violation.test.ts
git commit -m "fix: translate UNIQUE constraint failures into 409 ConflictError"
```

---

### Task 2: Make remaining seed inserts idempotent

**Files:**
- Modify: `src/lib/db.ts:1002`, `src/lib/db.ts:1054`, `src/lib/db.ts:1170`, `src/lib/db.ts:1206`, `src/lib/db.ts:1211`
- Test: `src/lib/__tests__/unique-violation.test.ts` (append describe block)

**Interfaces:**
- Consumes: `seedInitialData` (already exported at `src/lib/db.ts:1351`), `db` from `../db`.
- Produces: `seedInitialData()` is crash-proof against soft-deleted rows reserving seed codes. The `CAT-*` product-group seed (line 1253) already uses `INSERT OR IGNORE`; this task applies the same pattern to `document_sequence`, `users`, `product_profile`, and `account` seeds. `aging_bucket` (756) and `permission` (976, 1129) are already idempotent — leave them.

- [ ] **Step 1: Write the failing test**

Append this describe block to `src/lib/__tests__/unique-violation.test.ts`:

```ts
describe('seed robustness against soft-deleted reserved codes', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });
  afterAll(() => {
    teardownTestDatabase();
  });

  it('seedInitialData does not crash when all groups are soft-deleted but keep their CAT-* codes', async () => {
    const { seedInitialData } = await import('../db');
    // Reproduce the original failure: groupCount (isCategory=1 AND deletedAt IS
    // NULL) drops to 0, so the group seed re-runs — but the soft-deleted rows
    // still hold the CAT-* codes via the UNIQUE constraint. A plain INSERT
    // (pre-fix) crashed initialization on every request.
    const now = new Date().toISOString();
    db.prepare('UPDATE product SET deletedAt=? WHERE isCategory=1 AND deletedAt IS NULL').run(now);

    expect(() => seedInitialData()).not.toThrow();

    const dups = db.prepare(
      "SELECT code, count(1) AS c FROM product WHERE code LIKE 'CAT-%' GROUP BY code HAVING c > 1"
    ).all() as any[];
    expect(dups).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/unique-violation.test.ts`

Expected: FAIL — `seedInitialData()` throws `ConflictError` (or the pre-fix raw `UNIQUE constraint failed: product.code`) because the re-seed collides with the soft-deleted `CAT-ELEC`/`CAT-CLOTH`/`CAT-SERV` rows. This proves the test reproduces the original init crash.

- [ ] **Step 3: Convert the seed inserts to `INSERT OR IGNORE`**

In `src/lib/db.ts`, change exactly these five strings (do not touch the already-idempotent `aging_bucket`/`permission`/`CAT-*` statements):

Line 1002 (`ensureSequence`):
```ts
    db.prepare('INSERT OR IGNORE INTO document_sequence (documentType, prefix, nextNumber, padding, createdAt, updatedAt) VALUES (?, ?, 1, ?, ?, ?)').run(documentType, prefix, padding, now, now);
```

Line 1054 (admin user):
```ts
    db.prepare(`INSERT OR IGNORE INTO users (email, passwordHash, firstName, lastName, permissionIds, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1)`).run(
```

Line 1170 (product profiles):
```ts
    const pStmt = db.prepare('INSERT OR IGNORE INTO product_profile (code, name, description, salesVatCodeId, purchaseVatCodeId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
```

Line 1206 (root accounts):
```ts
    const rootStmt = db.prepare('INSERT OR IGNORE INTO account (code, name, type, parentId, isSystemAccount, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, NULL, ?, 1, ?, ?, 1)');
```

Line 1211 (child accounts):
```ts
    const acctStmt = db.prepare('INSERT OR IGNORE INTO account (code, name, type, parentId, isSystemAccount, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, 0, 1, ?, ?, 1)');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/unique-violation.test.ts`

Expected: PASS (both Task 1 tests and the new seed-robustness test).

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`

Expected: PASS (all existing tests, including `adminSeed.test.ts`, `db-backup.test.ts`, `sequence.test.ts`).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`

Expected: exit 0, no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db.ts src/lib/__tests__/unique-violation.test.ts
git commit -m "fix: make seed inserts idempotent so init can never crash on reserved codes"
```

---

## Self-Review

**Spec coverage:**
- DB-layer safety net (every UNIQUE insert → 409 ConflictError): Task 1. Covers product, account, partner, employee, tax_code, users, product_profile, cost_center, warehouse, document_sequence, and all invoice/entry/movement number tables — the full UNIQUE inventory from `db.ts` (lines 236-801).
- Seed can never crash init: Task 2 (all code-bearing seed inserts now `INSERT OR IGNORE`; `aging_bucket`, `permission`, `CAT-*` already were).
- Regression coverage for both original crashes: Task 1 test #2 (soft-deleted product code reserved) + Task 2 test (soft-deleted `CAT-*` group seed). The route-level friendly-400 pre-check is already covered by `product-create.test.ts:43` and `product-profiles.test.ts:45`.

**Placeholder scan:** No TBD/TODO; every step has concrete code and exact commands.

**Type consistency:** `uniqueViolationMessage(raw: string): string` is defined in Task 1 Step 3 and used only within `Statement.run`. `ConflictError` is imported in Task 1 Step 3 and used in tests. `seedInitialData` is already exported at `db.ts:1351` and used in Task 2 Step 1. All method/type names match.
