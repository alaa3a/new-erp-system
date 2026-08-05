# Tax Groups, Tax-Driven Posting & CoA Usage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure tax setup around Tax Groups (containers with a filing period) + Tax Types (which own their posting account), make the tax type the single source of truth for VAT posting accounts, remove VAT from posting profiles and PO lines, link tax situations to products, group the tax-summary report by group, and add a settings-only "Used In" indicator to the Chart of Accounts.

**Architecture:** Add `isGroup`/`filingPeriod` columns to the existing `tax_code` table (groups are rows with `isGroup=1`; types keep `parentId` pointing at a group). The tax type's `accountCode` drives the VAT posting line. `posting_profile`/`purchase_order_line` keep their physical VAT columns but stop being read/written. Reports resolve each tax code's group and group by it.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, SQLite via sql.js, Zod 4, Tailwind 4, Vitest 4.

## Global Constraints

- Money stored as **integers (cents)** throughout; rates are `REAL` percentages.
- Only REST APIs (no server actions). Standard response shape `{ success, data?, error?, code?, fields? }`.
- `requireAuth()` on every POST/PUT/DELETE route; `ensureInitialized()` before DB access.
- **Optimistic locking**: `update(id, data, version)` must include `WHERE ... AND version=?` and bump `version=version+1`; returns `changes > 0`.
- Soft-delete master data (set `isActive=0`), never `DELETE`.
- Do **not** physically drop `vatOutputCode`/`vatInputCode` (posting_profile) or `vatCodeId`/`vatRate`/`vatAmount` (purchase_order_line) columns — keep them unused in the DB.
- All `tax_code` queries that feed pickers must exclude groups where noted with `!t.isGroup`.
- Verify each task with `npx vitest run <file>` for tests and `npx tsc --noEmit` (typecheck) before committing.
- Commit after each task with a descriptive `feat:`/`refactor:` message. Do not commit if the user has not asked — this plan is executed only when the user starts execution.

---

### Task 1: DB schema — add `isGroup` + `filingPeriod` to `tax_code`, seed VAT group

**Files:**
- Modify: `src/lib/db.ts` (CREATE TABLE `tax_code` ~321-337, migrations ~634-638, seed area ~761+)

**Interfaces:**
- Consumes: nothing.
- Produces: `tax_code` table with `isGroup INTEGER NOT NULL DEFAULT 0` and `filingPeriod TEXT NOT NULL DEFAULT 'monthly'`; a seeded system "VAT" group (isGroup=1, isSystemCode=1) when none exists.

- [ ] **Step 1: Add the columns to the CREATE TABLE for fresh databases**

In `src/lib/db.ts`, edit the `tax_code` table definition so it reads:

```sql
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
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(parentId) REFERENCES tax_code(id)
);
```

- [ ] **Step 2: Add ALTER TABLE migrations for existing databases**

In the migration block right after the existing `db.exec(...)` schema call (near line 634-637), add:

```ts
// Migration: tax groups support (tax_code)
try { db.exec('ALTER TABLE tax_code ADD COLUMN isGroup INTEGER NOT NULL DEFAULT 0'); } catch (e) { /* column may already exist */ }
try { db.exec('ALTER TABLE tax_code ADD COLUMN filingPeriod TEXT NOT NULL DEFAULT \'monthly\''); } catch (e) { /* column may already exist */ }
```

- [ ] **Step 3: Seed a system "VAT" group when none exists**

In `seedInitialData()`, after the account seeding block (after line ~768 where `acctCount` is checked), add:

```ts
const taxGroupCount = (db.prepare('SELECT count(1) AS count FROM tax_code WHERE isGroup = 1').get() as any).count;
if (taxGroupCount === 0) {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO tax_code (code, name, rate, type, parentId, accountCode, isActive, isSystemCode, effectiveFrom, effectiveTo, isGroup, filingPeriod, createdAt, updatedAt, version) VALUES (?, ?, 0, \'output\', NULL, \'\', 1, 1, ?, NULL, 1, \'monthly\', ?, ?, 1)'
  ).run('VAT', 'VAT', now, now, now);
}
```

- [ ] **Step 4: Verify the migration + seed**

Run: `npx vitest run src/lib/__tests__/repositories/accountRepository.test.ts`
Expected: PASS (this initializes a fresh DB via `setupTestDatabase`, proving schema is valid).

Run a one-off check (no test for the seed yet — added in Task 4):

```bash
node -e "const {ensureInitialized}=require('tsx/cjs')" 2>$null; npx tsc --noEmit
```

Expected: typecheck passes with no new errors (no other code reads `isGroup`/`filingPeriod` yet).

- [ ] **Step 5: Commit**

```bash
git add "NEW ERP/src/lib/db.ts"
git commit -m "feat(db): add isGroup and filingPeriod to tax_code, seed VAT group"
```

---

### Task 2: Types — extend `TaxCode`, add `TaxGroup` and `AccountUsage`; update test seed data

**Files:**
- Modify: `src/types/erp.ts` (TaxCode ~173-188, PostingProfile ~203-221, PurchaseOrderLine ~252-273)
- Modify: `src/lib/__tests__/test-helper.ts` (tax_code insert line 90-93, posting_profile insert line 96-99)

**Interfaces:**
- Consumes: Task 1 columns.
- Produces: `TaxCode` gains `isGroup: boolean`, `filingPeriod: FilingPeriod`; `TaxGroup` alias; `AccountUsage` interface; `FilingPeriod` type. `test-helper` creates a group + a type under it and a posting profile without VAT columns.

- [ ] **Step 1: Write the failing type check**

Add to `src/types/erp.ts` near the TaxCode definition (this is a pure type addition — the "test" is a typecheck). First make the edits, then run typecheck:

```ts
export type FilingPeriod = 'monthly' | 'quarterly' | 'annually';

export interface TaxCode {
  id: number;
  code: string;
  name: string;
  rate: number;
  type: TaxType;
  parentId: number | null;
  accountCode: string;
  isActive: boolean;
  isSystemCode: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  isGroup: boolean;
  filingPeriod: FilingPeriod;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type TaxGroup = TaxCode & { isGroup: true };

export interface AccountUsage {
  postingProfiles: { name: string; role: string }[];  // role: AR | AP | Cash | Discount | Inventory | COGS | Adjustment
  taxCodes: string[];
}
```

- [ ] **Step 2: Run typecheck to confirm it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — `mapRow` in `taxCodeRepository.ts` creates `TaxCode` without `isGroup`/`filingPeriod`, and callers that construct `TaxCode` objects error.

- [ ] **Step 3: Update `taxCodeRepository.ts` `mapRow` (minimal fix for typecheck)**

In `src/lib/repositories/taxCodeRepository.ts`, change `mapRow` to:

```ts
function mapRow(row: any): TaxCode {
  return {
    ...row,
    isActive: row.isActive === 1,
    isSystemCode: row.isSystemCode === 1,
    parentId: row.parentId || null,
    effectiveTo: row.effectiveTo || null,
    isGroup: row.isGroup === 1,
    filingPeriod: row.filingPeriod || 'monthly',
  };
}
```

- [ ] **Step 4: Update the test seed data**

In `src/lib/__tests__/test-helper.ts`:

Replace the tax-code insert (lines 89-93) with a **group + type under it**:

```ts
  // Create a tax group (container) + one tax type under it
  const groupId = db.prepare(
    'INSERT INTO tax_code (code, name, rate, type, parentId, accountCode, isActive, isSystemCode, effectiveFrom, effectiveTo, isGroup, filingPeriod, createdAt, updatedAt, version) VALUES (?, ?, 0, \'output\', NULL, \'\', 1, 0, ?, NULL, 1, \'monthly\', ?, ?, 1)'
  ).run('VAT', 'VAT Group', '2026-01-01', now, now).lastInsertRowid as number;
  const taxId = db.prepare(
    'INSERT INTO tax_code (code, name, rate, type, parentId, accountCode, isActive, isSystemCode, effectiveFrom, effectiveTo, isGroup, filingPeriod, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, NULL, 0, \'monthly\', ?, ?, 1)'
  ).run('VAT20', 'Standard VAT 20%', 20, 'output', groupId, '202', '2026-01-01', now, now)
    .lastInsertRowid as number;
```

Replace the posting-profile insert (lines 96-99) with a version **without** the VAT columns:

```ts
  // Create a posting profile (VAT account fields removed)
  const profileId = db.prepare(
    'INSERT INTO posting_profile (name, invoiceType, accountsReceivableCode, accountsPayableCode, cashAccountCode, discountAccountCode, inventoryAccountCode, cogsAccountCode, adjustmentAccountCode, isDefault, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, 1)'
  ).run('Default Sales', 'sales', '102', '201', '101', '502', '103', '501', '503', now, now)
    .lastInsertRowid as number;
```

Update the returned `TestData` to include the group id:

```ts
  return {
    warehouseId: whId,
    productIds: { widget: prod1Id, service: prod2Id },
    partnerIds: { customer: partnerId, vendor: vendorId },
    taxCodeId: taxId,
    taxGroupId: groupId,
    postingProfileId: profileId,
  };
```

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 6: Run the full test suite to confirm seed changes don't break existing tests**

Run: `npx vitest run`
Expected: PASS. (Invoice/PO tests construct objects with VAT fields — those are repository-level `addLine` objects that are still structurally compatible because `addLine` params are still typed with the VAT fields until Task 11/13.)

- [ ] **Step 7: Commit**

```bash
git add "NEW ERP/src/types/erp.ts" "NEW ERP/src/lib/__tests__/test-helper.ts" "NEW ERP/src/lib/repositories/taxCodeRepository.ts"
git commit -m "feat(types): add isGroup/filingPeriod to TaxCode, TaxGroup and AccountUsage types"
```

---

### Task 3: Validators — conditional tax-code rules; remove VAT fields from posting-profile validator

**Files:**
- Modify: `src/lib/validators/taxCode.ts`
- Modify: `src/lib/validators/settings.ts` (lines 38-39)
- Test: `src/lib/__tests__/validators/taxCode.test.ts` (new)

**Interfaces:**
- Consumes: `FilingPeriod` from Task 2.
- Produces: `createTaxCodeSchema` (with superRefine: types require rate/accountCode/parentId; groups accept code+name+filingPeriod), `updateTaxCodeSchema = base.partial()` (no superRefine so partial restores like `{isActive:true}` pass).

- [ ] **Step 1: Write the failing validator test**

Create `src/lib/__tests__/validators/taxCode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTaxCodeSchema } from '../../validators/taxCode';

describe('createTaxCodeSchema', () => {
  it('accepts a valid tax group', () => {
    const res = createTaxCodeSchema.safeParse({ code: 'VAT', name: 'VAT', isGroup: true, filingPeriod: 'quarterly' });
    expect(res.success).toBe(true);
  });

  it('accepts a valid tax type under a group', () => {
    const res = createTaxCodeSchema.safeParse({
      code: 'VAT15', name: 'VAT 15%', isGroup: false,
      rate: 15, type: 'output', parentId: 1, accountCode: '2100',
    });
    expect(res.success).toBe(true);
  });

  it('rejects a tax type without a parent group', () => {
    const res = createTaxCodeSchema.safeParse({
      code: 'VAT15', name: 'VAT 15%', isGroup: false,
      rate: 15, type: 'output', parentId: null, accountCode: '2100',
    });
    expect(res.success).toBe(false);
  });

  it('rejects a tax type without an account code', () => {
    const res = createTaxCodeSchema.safeParse({
      code: 'VAT15', name: 'VAT 15%', isGroup: false,
      rate: 15, type: 'output', parentId: 1, accountCode: '',
    });
    expect(res.success).toBe(false);
  });

  it('rejects an invalid filing period on a group', () => {
    const res = createTaxCodeSchema.safeParse({
      code: 'VAT', name: 'VAT', isGroup: true, filingPeriod: 'weekly',
    });
    expect(res.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/validators/taxCode.test.ts`
Expected: FAIL — current schema has no `isGroup`/`filingPeriod` and no conditional rules (groups fail because they have no rate, etc.).

- [ ] **Step 3: Rewrite the tax-code validator**

Replace `src/lib/validators/taxCode.ts`:

```ts
import { z } from 'zod'
import { entityNameSchema, optionalString } from './common'

const base = z.object({
  code: z.string('Code is required').min(1).max(20),
  name: entityNameSchema,
  isGroup: z.boolean().optional().default(false),
  filingPeriod: z.enum(['monthly', 'quarterly', 'annually']).optional().default('monthly'),
  rate: z.number().min(0).max(100, 'Rate must be 0-100').optional().default(0),
  type: z.enum(['output', 'input']).optional().default('output'),
  parentId: z.number().int().positive().nullable().optional().default(null),
  accountCode: z.string().max(50).optional().default(''),
  description: optionalString,
  effectiveFrom: z.string().max(20).optional().default(''),
  effectiveTo: z.string().max(20).nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
})

export const createTaxCodeSchema = base.superRefine((data, ctx) => {
  if (data.isGroup) return
  // Tax type rules
  if (data.rate === undefined) {
    ctx.addIssue({ code: 'custom', path: ['rate'], message: 'Rate is required for tax types' })
  }
  if (data.type === undefined) {
    ctx.addIssue({ code: 'custom', path: ['type'], message: 'Type is required for tax types' })
  }
  if (data.accountCode === '' || data.accountCode === undefined) {
    ctx.addIssue({ code: 'custom', path: ['accountCode'], message: 'Posting account is required for tax types' })
  }
  if (data.parentId === null || data.parentId === undefined) {
    ctx.addIssue({ code: 'custom', path: ['parentId'], message: 'Tax types must belong to a tax group' })
  }
})

export const updateTaxCodeSchema = base.partial()
```

- [ ] **Step 4: Remove VAT fields from the posting-profile validator**

In `src/lib/validators/settings.ts`, delete these two lines:

```ts
  vatOutputCode: z.string().max(20).optional().default(''),
  vatInputCode: z.string().max(20).optional().default(''),
```

- [ ] **Step 5: Run the new test + typecheck**

Run: `npx vitest run src/lib/__tests__/validators/taxCode.test.ts; npx tsc --noEmit`
Expected: test PASS, typecheck PASS.

- [ ] **Step 6: Commit**

```bash
git add "NEW ERP/src/lib/validators/taxCode.ts" "NEW ERP/src/lib/validators/settings.ts" "NEW ERP/src/lib/__tests__/validators/taxCode.test.ts"
git commit -m "feat(validators): conditional tax group/type rules, remove posting profile VAT fields"
```

---

### Task 4: taxCodeRepository — isGroup/filingPeriod in CRUD, `findGroups`, group delete protection, remove duplicate postingProfileRepository

**Files:**
- Modify: `src/lib/repositories/taxCodeRepository.ts`
- Test: `src/lib/__tests__/repositories/taxCodeRepository.test.ts` (new)

**Interfaces:**
- Consumes: `TaxCode`, `TaxGroup` types (Task 2), `createTaxCodeSchema` (Task 3).
- Produces:
  - `taxCodeRepository.findGroups(): TaxGroup[]`
  - `taxCodeRepository.hasChildren(id: number): boolean`
  - `create(data)`/`update(id, data, version)` accept and persist `isGroup` + `filingPeriod`.
  - Removed `postingProfileRepository` export from this file (canonical one lives in `postingProfileRepository.ts`).

- [ ] **Step 1: Write the failing repository test**

Create `src/lib/__tests__/repositories/taxCodeRepository.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from '../test-helper';
import { taxCodeRepository } from '../../repositories/taxCodeRepository';
import { db } from '../../db';

describe('taxCodeRepository', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('should persist isGroup and filingPeriod on create and mapRow', () => {
    const id = taxCodeRepository.create({
      code: 'GRP-T', name: 'Test Group', rate: 0, type: 'output',
      parentId: null, accountCode: '', isActive: true, isSystemCode: false,
      effectiveFrom: '2026-01-01', effectiveTo: null,
      isGroup: true, filingPeriod: 'quarterly',
    });
    const row = taxCodeRepository.findById(id)!;
    expect(row.isGroup).toBe(true);
    expect(row.filingPeriod).toBe('quarterly');
  });

  it('should find groups only', () => {
    const groups = taxCodeRepository.findGroups();
    expect(groups.length).toBeGreaterThanOrEqual(1);
    groups.forEach(g => expect(g.isGroup).toBe(true));
  });

  it('should report a group with children as having children', () => {
    const groupId = taxCodeRepository.findGroups()[0].id;
    expect(taxCodeRepository.hasChildren(groupId)).toBe(true);
  });

  it('should update isGroup and filingPeriod', () => {
    const id = taxCodeRepository.findGroups()[0].id;
    const existing = taxCodeRepository.findById(id)!;
    const ok = taxCodeRepository.update(id, { filingPeriod: 'annually' }, existing.version);
    expect(ok).toBe(true);
    expect(taxCodeRepository.findById(id)!.filingPeriod).toBe('annually');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/repositories/taxCodeRepository.test.ts`
Expected: FAIL — `findGroups`/`hasChildren` don't exist; `create` doesn't accept `isGroup`/`filingPeriod`.

- [ ] **Step 3: Rewrite `taxCodeRepository.ts`**

Replace the `taxCodeRepository` object and delete the duplicate `postingProfileRepository` (keep `paymentTermRepository` and `entryCategoryRepository` as-is):

```ts
export const taxCodeRepository = {
  findAll(): TaxCode[] {
    return (db.prepare('SELECT * FROM tax_code ORDER BY code ASC').all() as any[]).map(mapRow);
  },
  findGroups(): TaxGroup[] {
    return (db.prepare('SELECT * FROM tax_code WHERE isGroup = 1 ORDER BY code ASC').all() as any[]).map(mapRow);
  },
  findById(id: number): TaxCode | null {
    const row = db.prepare('SELECT * FROM tax_code WHERE id = ?').get(id) as any;
    return row ? mapRow(row) : null;
  },
  create(data: Omit<TaxCode, 'id' | 'createdAt' | 'updatedAt' | 'version'>): number {
    const now = new Date().toISOString();
    const result = db.prepare(
      'INSERT INTO tax_code (code, name, rate, type, parentId, accountCode, isActive, isSystemCode, effectiveFrom, effectiveTo, isGroup, filingPeriod, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    ).run(
      data.code, data.name, data.rate ?? 0, data.type ?? 'output', data.parentId ?? null, data.accountCode ?? '',
      data.isActive !== false ? 1 : 0, data.isSystemCode ? 1 : 0, data.effectiveFrom, data.effectiveTo ?? null,
      data.isGroup ? 1 : 0, data.filingPeriod || 'monthly', now, now,
    );
    return result.lastInsertRowid as number;
  },
  update(id: number, data: Partial<TaxCode>, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare(
      'UPDATE tax_code SET code=?, name=?, rate=?, type=?, parentId=?, accountCode=?, isActive=?, effectiveFrom=?, effectiveTo=?, isGroup=?, filingPeriod=?, updatedAt=?, version=version+1 WHERE id=? AND version=?'
    ).run(
      data.code ?? null, data.name ?? null, data.rate ?? 0, data.type ?? 'output', data.parentId ?? null, data.accountCode ?? '',
      data.isActive !== false ? 1 : 0, data.effectiveFrom ?? '', data.effectiveTo ?? null,
      data.isGroup ? 1 : 0, data.filingPeriod || 'monthly', now, id, version,
    );
    return result.changes > 0;
  },
  softDelete(id: number, version: number): boolean {
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE tax_code SET isActive=0, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(now, id, version);
    return result.changes > 0;
  },
  hasChildren(id: number): boolean {
    return (db.prepare('SELECT count(1) AS count FROM tax_code WHERE parentId = ?').get(id) as any).count > 0;
  },
  isInUse(id: number): boolean {
    return (db.prepare('SELECT count(1) AS count FROM invoice_line WHERE vatCodeId = ?').get(id) as any).count > 0;
  },
};
```

Then **delete** lines 51-57 (the duplicate `postingProfileRepository` block) from `taxCodeRepository.ts`. Update the imports at the top:

```ts
import { TaxCode, TaxGroup } from '@/types/erp';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/repositories/taxCodeRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Run typecheck + full test suite**

Run: `npx tsc --noEmit; npx vitest run`
Expected: `invoiceService.ts` and `posting-profiles` routes may now fail typecheck because they import `postingProfileRepository` from `taxCodeRepository` — **this is expected**; it is fixed in Task 5. If typecheck fails only on those imports, proceed.

- [ ] **Step 6: Commit**

```bash
git add "NEW ERP/src/lib/repositories/taxCodeRepository.ts" "NEW ERP/src/lib/__tests__/repositories/taxCodeRepository.test.ts"
git commit -m "feat(taxCodeRepository): groups, filingPeriod CRUD, findGroups, delete protection"
```

---

### Task 5: postingProfileRepository — drop VAT columns from SQL; fix invoiceService import

**Files:**
- Modify: `src/lib/repositories/postingProfileRepository.ts`
- Modify: `src/lib/services/invoiceService.ts` (line 5 import)

**Interfaces:**
- Consumes: duplicate removal from Task 4.
- Produces: `postingProfileRepository.create`/`update` that no longer read or write `vatOutputCode`/`vatInputCode`.

- [ ] **Step 1: Fix the invoiceService import first (so typecheck recovers)**

In `src/lib/services/invoiceService.ts`, change line 5:

```ts
import { postingProfileRepository } from '../repositories/postingProfileRepository';
```

- [ ] **Step 2: Update postingProfileRepository**

Replace `src/lib/repositories/postingProfileRepository.ts`:

```ts
import { db } from '../db';

export const postingProfileRepository = {
  findAll: () => (db.prepare('SELECT * FROM posting_profile WHERE isActive = 1 ORDER BY name ASC').all() as any[]).map(r => ({ ...r, isActive: r.isActive === 1, isDefault: r.isDefault === 1 })),
  findById: (id: number) => { const r = db.prepare('SELECT * FROM posting_profile WHERE id = ?').get(id) as any; return r ? { ...r, isActive: r.isActive === 1, isDefault: r.isDefault === 1 } : null; },
  create: (data: any) => { const now = new Date().toISOString(); return db.prepare('INSERT INTO posting_profile (name, invoiceType, accountsReceivableCode, accountsPayableCode, cashAccountCode, discountAccountCode, inventoryAccountCode, cogsAccountCode, adjustmentAccountCode, isDefault, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').run(data.name, data.invoiceType, data.accountsReceivableCode, data.accountsPayableCode, data.cashAccountCode, data.discountAccountCode, data.inventoryAccountCode, data.cogsAccountCode, data.adjustmentAccountCode, data.isDefault ? 1 : 0, data.isActive !== false ? 1 : 0, now, now).lastInsertRowid as number; },
  update: (id: number, data: any, version: number) => { const now = new Date().toISOString(); return db.prepare('UPDATE posting_profile SET name=?, invoiceType=?, accountsReceivableCode=?, accountsPayableCode=?, cashAccountCode=?, discountAccountCode=?, inventoryAccountCode=?, cogsAccountCode=?, adjustmentAccountCode=?, isDefault=?, isActive=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(data.name, data.invoiceType, data.accountsReceivableCode, data.accountsPayableCode, data.cashAccountCode, data.discountAccountCode, data.inventoryAccountCode, data.cogsAccountCode, data.adjustmentAccountCode, data.isDefault ? 1 : 0, data.isActive !== false ? 1 : 0, now, id, version).changes > 0; },
  softDelete: (id: number, version: number) => db.prepare('UPDATE posting_profile SET isActive=0, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(new Date().toISOString(), id, version).changes > 0,
};
```

- [ ] **Step 3: Update the posting-profiles API routes to stop sending VAT fields**

In `src/app/api/posting-profiles/route.ts` and `src/app/api/posting-profiles/[id]/route.ts`, the POST/PUT already pass the whole validated `body` to `create`/`update`. Since the validator (Task 3) now strips `vatOutputCode`/`vatInputCode`, no route change is needed — verify with typecheck.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit; npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "NEW ERP/src/lib/repositories/postingProfileRepository.ts" "NEW ERP/src/lib/services/invoiceService.ts"
git commit -m "refactor(postingProfile): stop writing VAT account columns, fix import"
```

---

### Task 6: accountRepository — fix usage check, add `getUsageMap`

**Files:**
- Modify: `src/lib/repositories/accountRepository.ts` (line 141-145, add `getUsageMap`)
- Test: `src/lib/__tests__/repositories/accountRepository.test.ts`

**Interfaces:**
- Consumes: `AccountUsage` type (Task 2).
- Produces: `accountRepository.getUsageMap(): Record<string, AccountUsage>`; `isUsedInPostingProfiles` no longer references VAT columns.

- [ ] **Step 1: Write the failing test additions**

Append to `src/lib/__tests__/repositories/accountRepository.test.ts`:

```ts
  describe('getUsageMap', () => {
    it('should return usage keyed by account code', () => {
      const usage = accountRepository.getUsageMap();
      expect(typeof usage).toBe('object');
      // Seed posting profile uses account '102' (AR) and seed tax type uses '202'
      const arUsage = usage['102'];
      expect(arUsage).toBeDefined();
      expect(arUsage.postingProfiles.length).toBeGreaterThan(0);
      const taxUsage = usage['202'];
      expect(taxUsage).toBeDefined();
      expect(taxUsage.taxCodes.length).toBeGreaterThan(0);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/repositories/accountRepository.test.ts`
Expected: FAIL — `getUsageMap` doesn't exist.

- [ ] **Step 3: Fix `isUsedInPostingProfiles` and add `getUsageMap`**

In `src/lib/repositories/accountRepository.ts`:

Replace `isUsedInPostingProfiles` body (remove the VAT conditions):

```ts
  isUsedInPostingProfiles(code: string): boolean {
    return (db.prepare(
      'SELECT count(1) AS count FROM posting_profile WHERE accountsReceivableCode = ? OR accountsPayableCode = ? OR cashAccountCode = ? OR discountAccountCode = ? OR inventoryAccountCode = ? OR cogsAccountCode = ? OR adjustmentAccountCode = ?'
    ).get(code, code, code, code, code, code, code) as any).count > 0;
  },

  getUsageMap(): Record<string, AccountUsage> {
    const usage: Record<string, AccountUsage> = {};
    const ensure = (code: string) => { if (!usage[code]) usage[code] = { postingProfiles: [], taxCodes: [] }; };

    const profileFields: Array<[string, string]> = [
      ['accountsReceivableCode', 'AR'],
      ['accountsPayableCode', 'AP'],
      ['cashAccountCode', 'Cash'],
      ['discountAccountCode', 'Discount'],
      ['inventoryAccountCode', 'Inventory'],
      ['cogsAccountCode', 'COGS'],
      ['adjustmentAccountCode', 'Adjustment'],
    ];
    const profiles = db.prepare(
      'SELECT name, accountsReceivableCode, accountsPayableCode, cashAccountCode, discountAccountCode, inventoryAccountCode, cogsAccountCode, adjustmentAccountCode FROM posting_profile'
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

    return usage;
  },
```

Add the import:

```ts
import { Account, AccountUsage } from '@/types/erp';
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/lib/__tests__/repositories/accountRepository.test.ts; npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "NEW ERP/src/lib/repositories/accountRepository.ts" "NEW ERP/src/lib/__tests__/repositories/accountRepository.test.ts"
git commit -m "feat(accountRepository): settings-only usage map, drop VAT from usage check"
```

---

### Task 7: API routes — tax-codes create/update with groups; group delete protection; accounts GET returns usage

**Files:**
- Modify: `src/app/api/tax-codes/route.ts`
- Modify: `src/app/api/tax-codes/[id]/route.ts`
- Modify: `src/app/api/accounts/route.ts`

**Interfaces:**
- Consumes: `taxCodeRepository` (Task 4), `accountRepository.getUsageMap` (Task 6), `createTaxCodeSchema` (Task 3).
- Produces: `POST /api/tax-codes` accepts `isGroup`/`filingPeriod` and rejects a type whose `parentId` is not a group; `PUT /api/tax-codes/:id` accepts `isGroup`/`filingPeriod`; `DELETE /api/tax-codes/:id` rejects deleting a group with children; `GET /api/accounts` returns `{ success, data, usage }`.

- [ ] **Step 1: Rewrite `POST /api/tax-codes`**

In `src/app/api/tax-codes/route.ts`, replace the POST handler body's create call with:

```ts
export async function POST(request: Request) {
  try {
    await ensureInitialized()
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth
    const body = validate(createTaxCodeSchema, await request.json())
    if (!body.isGroup) {
      if (!body.parentId) throw new ValidationError('Tax types must belong to a tax group')
      const parent = taxCodeRepository.findById(body.parentId)
      if (!parent || !parent.isGroup) throw new ValidationError('Parent must be a tax group')
    }
    const now = new Date().toISOString()
    const id = taxCodeRepository.create({
      code: body.code,
      name: body.name,
      rate: body.isGroup ? 0 : body.rate,
      type: body.isGroup ? 'output' : body.type,
      parentId: body.isGroup ? null : body.parentId,
      accountCode: body.isGroup ? '' : body.accountCode,
      isActive: body.isActive !== false,
      isSystemCode: false,
      effectiveFrom: body.effectiveFrom || now,
      effectiveTo: body.effectiveTo ?? null,
      isGroup: body.isGroup,
      filingPeriod: body.filingPeriod || 'monthly',
    })
    auditLogRepository.log({ userId: auth.userId, action: 'create', entityType: 'tax_code', entityId: id })
    return NextResponse.json({ success: true, data: { id } }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 2: Update `PUT /api/tax-codes/:id`**

In `src/app/api/tax-codes/[id]/route.ts`, add the group-parent guard and pass the new fields:

```ts
    const body = validate(updateTaxCodeSchema, await request.json())
    const codeId = Number(id)
    const existing = taxCodeRepository.findById(codeId)
    if (!existing) throw new NotFoundError('TaxCode', id)

    if (body.isGroup === false && body.parentId) {
      const parent = taxCodeRepository.findById(body.parentId)
      if (!parent || !parent.isGroup) throw new ValidationError('Parent must be a tax group')
    }

    const updated = taxCodeRepository.update(codeId, {
      ...(body.code !== undefined && { code: body.code }),
      ...(body.name !== undefined && { name: body.name }),
      ...(body.rate !== undefined && { rate: body.rate }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.parentId !== undefined && { parentId: body.parentId }),
      ...(body.accountCode !== undefined && { accountCode: body.accountCode }),
      ...(body.effectiveFrom !== undefined && { effectiveFrom: body.effectiveFrom }),
      ...(body.effectiveTo !== undefined && { effectiveTo: body.effectiveTo }),
      ...(body.isGroup !== undefined && { isGroup: body.isGroup }),
      ...(body.filingPeriod !== undefined && { filingPeriod: body.filingPeriod }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    }, existing.version)
```

Import `ValidationError` alongside the other errors in this file:

```ts
import { handleApiError, NotFoundError, ConflictError, ValidationError } from '@/lib/utils/errors'
```

- [ ] **Step 3: Add group delete protection**

In `src/app/api/tax-codes/[id]/route.ts`, in the DELETE handler, add before `isInUse`:

```ts
    if (existing.isSystemCode) throw new ValidationError('System tax codes cannot be deleted')
    if (existing.isGroup && taxCodeRepository.hasChildren(codeId)) throw new ValidationError('Tax group has tax types and cannot be deleted')
    if (taxCodeRepository.isInUse(codeId)) throw new ValidationError('Tax code is in use and cannot be deleted')
```

- [ ] **Step 4: Update `GET /api/accounts`**

In `src/app/api/accounts/route.ts`, replace the GET body:

```ts
export async function GET() {
  try {
    await ensureInitialized()
    const accounts = accountRepository.findHierarchy()
    const usage = accountRepository.getUsageMap()
    return NextResponse.json({ success: true, data: accounts, usage })
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit; npx vitest run src/lib/__tests__/validators/taxCode.test.ts src/lib/__tests__/repositories/taxCodeRepository.test.ts src/lib/__tests__/repositories/accountRepository.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "NEW ERP/src/app/api/tax-codes/route.ts" "NEW ERP/src/app/api/tax-codes/[id]/route.ts" "NEW ERP/src/app/api/accounts/route.ts"
git commit -m "feat(api): tax group create/update/delete guards, accounts usage payload"
```

---

### Task 8: invoiceService — VAT account from tax type, write vatCodeId on entry lines

**Files:**
- Modify: `src/lib/services/invoiceService.ts`
- Test: `src/lib/__tests__/services/invoiceService.test.ts`

**Interfaces:**
- Consumes: `taxCodeRepository` (Task 4), `postingProfileRepository` (Task 5).
- Produces: `previewPosting` VAT entries use `taxType.accountCode` (fallback `2100` sales / `2200` purchase) and carry `vatCodeId`; `postInvoice` writes `vatCodeId`/`vatAmount` on the VAT entry lines.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/__tests__/services/invoiceService.test.ts` a new describe block:

```ts
  describe('VAT account from tax type', () => {
    it('should use the tax type accountCode for the VAT entry', () => {
      // seedTestData tax type VAT20 has accountCode '202'
      const id = createDraftInvoice('sales');
      invoiceRepository.updateStatus(id, 'draft');
      // Force vatCodeId on the lines via a helper
      invoiceRepository.findLines(id).forEach(l => {
        db.prepare('UPDATE invoice_line SET vatCodeId = ? WHERE id = ?').run(data.taxCodeId, l.id);
      });
      const preview = invoiceService.previewPosting(id);
      const vatEntry = preview.entries.find((e: any) => e.description?.startsWith('VAT'));
      expect(vatEntry).toBeDefined();
      expect(vatEntry.accountCode).toBe('202');
      expect(vatEntry.vatCodeId).toBe(data.taxCodeId);
    });

    it('should write vatCodeId and vatAmount on posted VAT entry lines', () => {
      inventoryRepository.upsertStock(data.productIds.widget, data.warehouseId, 1000, 1500);
      const id = createDraftInvoice('sales');
      invoiceRepository.findLines(id).forEach(l => {
        db.prepare('UPDATE invoice_line SET vatCodeId = ? WHERE id = ?').run(data.taxCodeId, l.id);
      });
      invoiceService.approveInvoice(id, 'test');
      invoiceService.postInvoice(id, 'test-user');
      const entries = entryRepository.findByLinkedInvoice(id);
      const vatLine = db.prepare(
        'SELECT * FROM entry_line WHERE entryId = ? AND vatCodeId = ?'
      ).get(entries[0].id, data.taxCodeId) as any;
      expect(vatLine).toBeDefined();
      expect(vatLine.vatAmount).toBeGreaterThan(0);
    });
  });
```

Add `db` to the test imports:

```ts
import { db } from '../../db';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/services/invoiceService.test.ts`
Expected: FAIL — VAT entry uses `profile?.vatOutputCode || '2100'` (the seeded profile no longer has VAT columns) and entries have no `vatCodeId`.

- [ ] **Step 3: Update `previewPosting`**

In `src/lib/services/invoiceService.ts`, add the tax-code import and replace the VAT block:

```ts
import { taxCodeRepository } from '../repositories/taxCodeRepository';
```

Replace the VAT block inside the line loop:

```ts
      if (line.vatAmount > 0) {
        const taxType = line.vatCodeId ? taxCodeRepository.findById(line.vatCodeId) : null;
        const vatAccount = taxType?.accountCode || (invoice.type === 'sales' || invoice.type === 'debit_note' ? '2100' : '2200');
        if (invoice.type === 'sales' || invoice.type === 'debit_note') {
          entries.push({ accountCode: vatAccount, description: `VAT - ${line.description}`, debitAmount: 0, creditAmount: line.vatAmount, vatCodeId: line.vatCodeId });
        } else {
          entries.push({ accountCode: vatAccount, description: `VAT - ${line.description}`, debitAmount: line.vatAmount, creditAmount: 0, vatCodeId: line.vatCodeId });
        }
      }
```

- [ ] **Step 4: Update `postInvoice` to write VAT fields on entry lines**

Replace the `for (const e of entries)` loop:

```ts
      for (const e of entries) {
        entryRepository.addLine({
          entryId, lineNumber: lineNum++, accountCode: e.accountCode, description: e.description,
          debitAmount: e.debitAmount, creditAmount: e.creditAmount,
          businessPartnerId: null, costCenterId: null,
          vatCodeId: e.vatCodeId ?? null,
          vatAmount: e.vatCodeId ? e.debitAmount + e.creditAmount : 0,
        });
      }
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run src/lib/__tests__/services/invoiceService.test.ts; npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "NEW ERP/src/lib/services/invoiceService.ts" "NEW ERP/src/lib/__tests__/services/invoiceService.test.ts"
git commit -m "feat(invoiceService): VAT posting from tax type account, pass vatCodeId through"
```

---

### Task 9: Tax Setup UI — hierarchical group/type table with Add Group + Add Tax Type

**Files:**
- Modify: `src/app/(admin)/settings/tax-setup/page.tsx`

**Interfaces:**
- Consumes: `POST/PUT/DELETE /api/tax-codes` (Task 7), `TaxCode`/`TaxGroup` types (Task 2).
- Produces: Group rows (expandable, filing-period chip, "Add Tax Type" button, edit/delete), type child rows (type chip, rate, account, effective period, status), an "Ungrouped" section, and two form modes (group vs type).

- [ ] **Step 1: Rewrite the page**

Replace the whole `src/app/(admin)/settings/tax-setup/page.tsx` with the implementation below.

Key behaviors:
- `formMode: 'group' | 'type'`; `openAddGroup` clears form and sets `isGroup: true`; `openAddType(groupId?)` sets `parentId` to the group.
- Group row shows filing-period chip and an "Add Tax Type" button; deleting a group with children is blocked (server-side guard + UI disable).
- Type rows are children of the group; ungrouped (no parentId, `!isGroup`) codes render under an "Ungrouped" heading.
- Editing a group hides rate/type/account/effective fields; editing a type requires a parent group.

```tsx
'use client'
import { SearchInput, StatusBadge, EmptyState } from '@/components/ui'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Edit3, Trash2, AlertTriangle, Loader2, Percent, Calendar, ChevronRight, ChevronDown, FolderPlus, Layers,
} from 'lucide-react'
import DatePicker from '@/components/form/input/DatePicker'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { useToast } from '@/components/ui/toast/ToastProvider'
import type { TaxCode, TaxType, FilingPeriod, Account } from '@/types/erp'

const taxTypes: TaxType[] = ['output', 'input']
const filingPeriods: FilingPeriod[] = ['monthly', 'quarterly', 'annually']
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const taxTypeConfig: Record<TaxType, { label: string; bg: string; text: string }> = {
  output: { label: 'VAT Output (Sales)', bg: 'bg-blue-50 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-400' },
  input: { label: 'VAT Input (Purchases)', bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-400' },
}

const filingPeriodLabel: Record<FilingPeriod, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
}

interface TaxCodeFormData {
  code: string
  name: string
  isGroup: boolean
  filingPeriod: FilingPeriod
  rate: number
  type: TaxType
  parentId: number | null
  accountCode: string
  isActive: boolean
  isSystemCode: boolean
  effectiveFrom: string
  effectiveTo: string
}

const todayStr = () => new Date().toISOString().split('T')[0]

const emptyForm = (): TaxCodeFormData => ({
  code: '',
  name: '',
  isGroup: false,
  filingPeriod: 'monthly',
  rate: 0,
  type: 'output',
  parentId: null,
  accountCode: '',
  isActive: true,
  isSystemCode: false,
  effectiveFrom: todayStr(),
  effectiveTo: '',
})

export default function TaxSetupPage() {
  const toast = useToast()
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | TaxType>('all')
  const [showForm, setShowForm] = useState(false)
  const [formMode, setFormMode] = useState<'group' | 'type'>('type')
  const [editingCode, setEditingCode] = useState<TaxCode | null>(null)
  const [formData, setFormData] = useState<TaxCodeFormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formTouched, setFormTouched] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TaxCode | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const fetchTaxCodes = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/tax-codes')
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Request failed')
      setTaxCodes(json.data)
    } catch {
      setError('Failed to load tax codes.')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts')
      if (res.ok) {
        const json = await res.json()
        if (!json.success) throw new Error(json.error || 'Request failed')
        setAccounts(json.data)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchTaxCodes()
    fetchAccounts()
  }, [fetchTaxCodes, fetchAccounts])

  const filteredCodes = useMemo(() => {
    let list = taxCodes
    if (typeFilter !== 'all') list = list.filter(t => t.isGroup || t.type === typeFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(t =>
        t.code.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q)
      )
    }
    return list
  }, [taxCodes, typeFilter, searchQuery])

  const groups = filteredCodes.filter(t => t.isGroup)
  const ungrouped = filteredCodes.filter(t => !t.isGroup && !t.parentId)
  const getChildren = (parentId: number) => filteredCodes.filter(t => t.parentId === parentId)
  const hasChildren = (id: number) => taxCodes.some(t => t.parentId === id)
  const toggleExpand = (id: number) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const openAddGroup = () => {
    setEditingCode(null)
    setFormMode('group')
    setFormData({ ...emptyForm(), isGroup: true })
    setFormTouched(false)
    setFormError('')
    setShowForm(true)
  }

  const openAddType = (groupId: number | null = null) => {
    setEditingCode(null)
    setFormMode('type')
    setFormData({ ...emptyForm(), isGroup: false, parentId: groupId })
    setFormTouched(false)
    setFormError('')
    setShowForm(true)
  }

  const openEditForm = (code: TaxCode) => {
    setEditingCode(code)
    setFormMode(code.isGroup ? 'group' : 'type')
    setFormData({
      code: code.code,
      name: code.name,
      isGroup: code.isGroup,
      filingPeriod: code.filingPeriod || 'monthly',
      rate: code.rate,
      type: code.type,
      parentId: code.parentId,
      accountCode: code.accountCode,
      isActive: code.isActive,
      isSystemCode: code.isSystemCode,
      effectiveFrom: code.effectiveFrom.split('T')[0],
      effectiveTo: code.effectiveTo ? code.effectiveTo.split('T')[0] : '',
    })
    setFormTouched(false)
    setFormError('')
    setShowForm(true)
  }

  const handleSave = async () => {
    setFormTouched(true)
    if (!formData.code.trim() || !formData.name.trim()) {
      setFormError('Code and name are required')
      return
    }
    if (!formData.isGroup && !formData.parentId) {
      setFormError('Tax types must belong to a tax group')
      return
    }
    if (!formData.isGroup && !formData.accountCode.trim()) {
      setFormError('Posting account is required for tax types')
      return
    }
    if (!formData.isGroup && (formData.rate < 0 || formData.rate > 100)) {
      setFormError('Rate must be between 0 and 100')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const url = editingCode ? `/api/tax-codes/${editingCode.id}` : '/api/tax-codes'
      const method = editingCode ? 'PUT' : 'POST'
      const body: any = {
        ...formData,
        rate: formData.isGroup ? 0 : Number(formData.rate),
        parentId: formData.isGroup ? null : formData.parentId,
        accountCode: formData.isGroup ? '' : formData.accountCode,
        effectiveTo: formData.effectiveTo || null,
      }
      if (editingCode) body.version = editingCode.version
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      setShowForm(false)
      fetchTaxCodes()
      toast.success(editingCode ? `Tax ${formData.isGroup ? 'group' : 'type'} "${formData.name}" updated` : `Tax ${formData.isGroup ? 'group' : 'type'} "${formData.name}" created`)
    } catch (err: any) {
      setFormError(err.message)
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const restoreTaxCode = async (code: TaxCode) => {
    try {
      const res = await fetch(`/api/tax-codes/${code.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Restore failed')
      }
      fetchTaxCodes()
      toast.success(`Tax "${code.name}" restored`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore')
      fetchTaxCodes()
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const deleted = deleteTarget
    try {
      const res = await fetch(`/api/tax-codes/${deleted.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Delete failed')
      }
      setDeleteTarget(null)
      fetchTaxCodes()
      toast.success(`Tax "${deleted.name}" deleted`, {
        action: { label: 'Undo', onClick: () => restoreTaxCode(deleted) },
        duration: 8000,
      })
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message || 'Failed to delete')
    }
  }

  const renderGroupRows = (group: TaxCode): React.ReactNode[] => {
    const isOpen = expanded.has(group.id)
    const children = getChildren(group.id)
    const canDelete = !group.isSystemCode && children.length === 0

    const row = (
      <tr key={group.id} className="bg-gray-50/70 dark:bg-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2">
            {children.length > 0 ? (
              <button onClick={() => toggleExpand(group.id)} className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : <span className="w-4 shrink-0" />}
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-16 shrink-0">{group.code}</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{group.name}</span>
            {group.isSystemCode && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">System</span>
            )}
          </div>
        </td>
        <td className="py-2.5 px-3">
          <span className="inline-flex text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400">Group</span>
        </td>
        <td className="py-2.5 px-3">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400">
            {filingPeriodLabel[group.filingPeriod || 'monthly']}
          </span>
        </td>
        <td className="py-2.5 px-3 text-xs text-gray-400 italic">—</td>
        <td className="py-2.5 px-3 text-xs text-gray-400 italic">—</td>
        <td className="py-2.5 px-3 text-center">
          <span className={`inline-flex text-xs font-medium px-2 py-1 rounded-full ${
            group.isActive ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400' : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
          }`}>
            {group.isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="py-2.5 px-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => openAddType(group.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors" title="Add tax type">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => openEditForm(group)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors" title="Edit">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            {canDelete ? (
              <button onClick={() => setDeleteTarget(group)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button onClick={() => setDeleteTarget(group)} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors" title={group.isSystemCode ? 'System group' : 'Has tax types'}>
                <AlertTriangle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
    )

    if (!isOpen) return [row]
    return [row, ...children.map(child => renderTypeRow(child))]
  }

  const renderTypeRow = (code: TaxCode): React.ReactNode => {
    const isExpired = code.effectiveTo && new Date(code.effectiveTo) < new Date()
    const canDelete = !code.isSystemCode
    return (
      <tr key={code.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${isExpired ? 'opacity-60' : ''}`}>
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2 pl-6">
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-16 shrink-0">{code.code}</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">{code.name}</span>
            {code.isSystemCode && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">System</span>
            )}
          </div>
        </td>
        <td className="py-2.5 px-3">
          <StatusBadge label={taxTypeConfig[code.type].label} color={`${taxTypeConfig[code.type].bg} ${taxTypeConfig[code.type].text}`} />
        </td>
        <td className="py-2.5 px-3">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{code.rate}%</span>
        </td>
        <td className="py-2.5 px-3">
          {code.accountCode ? (
            <span className="text-xs font-mono text-gray-600 dark:text-gray-400">
              {code.accountCode}
              <span className="text-gray-400 dark:text-gray-500 ml-1">
                · {accounts.find(a => a.code === code.accountCode)?.name || ''}
              </span>
            </span>
          ) : (
            <span className="text-xs text-gray-300 dark:text-gray-600 italic">Not set</span>
          )}
        </td>
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
            <Calendar className="w-3 h-3" />
            <span>{code.effectiveFrom.split('T')[0]}</span>
            {code.effectiveTo && <span> → {code.effectiveTo.split('T')[0]}</span>}
            {!code.effectiveTo && <span className="text-green-500 dark:text-green-400"> (ongoing)</span>}
          </div>
        </td>
        <td className="py-2.5 px-3 text-center">
          <span className={`inline-flex text-xs font-medium px-2 py-1 rounded-full ${
            code.isActive && !isExpired ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400' : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
          }`}>
            {code.isActive && !isExpired ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="py-2.5 px-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => openEditForm(code)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors" title="Edit">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            {canDelete ? (
              <button onClick={() => setDeleteTarget(code)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button onClick={() => setDeleteTarget(code)} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors" title="System code">
                <AlertTriangle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  const renderUngrouped = (): React.ReactNode[] => {
    if (ungrouped.length === 0) return []
    return [
      <tr key="ungrouped-header">
        <td colSpan={7} className="py-2.5 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900">
          Ungrouped
        </td>
      </tr>,
      ...ungrouped.map(code => renderTypeRow(code)),
    ]
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Tax Codes</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Tax groups define filing periods; tax types under them own the posting account for VAT.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openAddType} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm">
            <Layers className="w-4 h-4" /> Add Tax Type
          </button>
          <button onClick={openAddGroup} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors shadow-sm">
            <FolderPlus className="w-4 h-4" /> Add Group
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-2.5">
        {(['all', ...taxTypes] as const).map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              typeFilter === t
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}>
            {t === 'all' ? 'All' : t === 'output' ? 'VAT Output' : 'VAT Input'}
          </button>
        ))}
        <div className="flex-1 min-w-0" />
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search by code or name..." className="max-w-xs w-full" compact />
      </div>

      {/* Table */}
      {loading ? (
        <EmptyState icon={<Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />} title="Loading tax codes..." />
      ) : error ? (
        <EmptyState icon={<AlertTriangle className="w-10 h-10 text-red-400 mb-3" />} title={<span className="text-red-600 dark:text-red-400">{error}</span>} action={<button onClick={fetchTaxCodes} className="mt-3 text-sm font-medium text-brand-500">Try again</button>} />
      ) : taxCodes.length === 0 ? (
        <EmptyState icon={<Percent className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />} title="No tax codes defined yet" action={<button onClick={openAddGroup} className="mt-2 text-sm font-medium text-brand-500"><FolderPlus className="w-4 h-4 inline" /> Add your first tax group</button>} />
      ) : (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Code / Name</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rate / Period</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Account</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Effective</th>
                  <th className="text-center py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {groups.flatMap(group => renderGroupRows(group))}
                {renderUngrouped()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- Add/Edit Modal --- */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} className="max-w-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {editingCode ? (formMode === 'group' ? 'Edit Tax Group' : 'Edit Tax Type') : formMode === 'group' ? 'Add Tax Group' : 'Add Tax Type'}
        </h3>
        <div className="space-y-4">
          {/* Code + Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Code <span className="text-red-400">*</span>
              </label>
              <input type="text" value={formData.code}
                onChange={e => setFormData({ ...formData, code: e.target.value })}
                placeholder={formMode === 'group' ? 'e.g. VAT' : 'e.g. VAT15'}
                className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${
                  formTouched && !formData.code.trim() ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'
                }`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input type="text" value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder={formMode === 'group' ? 'e.g. Value Added Tax' : 'e.g. Standard VAT 15%'}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
            </div>
          </div>

          {formMode === 'group' ? (
            <>
              {/* Filing Period */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Filing Period</label>
                <select value={formData.filingPeriod}
                  onChange={e => setFormData({ ...formData, filingPeriod: e.target.value as FilingPeriod })}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                  {filingPeriods.map(p => <option key={p} value={p}>{filingPeriodLabel[p]}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              {/* Parent Group + Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Parent Group <span className="text-red-400">*</span></label>
                  <select value={formData.parentId ?? ''}
                    onChange={e => setFormData({ ...formData, parentId: e.target.value ? Number(e.target.value) : null })}
                    className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${
                      formTouched && !formData.parentId ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'
                    }`}>
                    <option value="">-- Select group --</option>
                    {taxCodes.filter(t => t.isGroup && t.id !== editingCode?.id).map(t => (
                      <option key={t.id} value={t.id}>{t.code} - {t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Type</label>
                  <select value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value as TaxType })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                    {taxTypes.map(t => <option key={t} value={t}>{capitalize(t)} {t === 'output' ? '(collected)' : '(paid)'}</option>)}
                  </select>
                </div>
              </div>

              {/* Rate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Rate (%)</label>
                <div className="relative">
                  <input type="number" value={formData.rate} min="0" max="100" step="0.01"
                    onChange={e => setFormData({ ...formData, rate: Number(e.target.value) || 0 })}
                    placeholder="15"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 pr-7 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">To change a rate, create a new tax type with the new rate — the effective period defaults to today and can be adjusted.</p>
              </div>

              {/* Account Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Posting Account <span className="text-red-400">*</span>
                </label>
                <select value={formData.accountCode}
                  onChange={e => setFormData({ ...formData, accountCode: e.target.value })}
                  className={`w-full rounded-lg border text-sm px-3 py-2 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${
                    formTouched && !formData.accountCode ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'
                  }`}>
                  <option value="">-- Select account --</option>
                  {accounts.filter(a => a.isActive).map(a => (
                    <option key={a.id} value={a.code}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              {/* Effective Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Effective From</label>
                  <DatePicker value={formData.effectiveFrom} onChange={(v) => setFormData({ ...formData, effectiveFrom: v })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Effective To</label>
                  <DatePicker value={formData.effectiveTo} onChange={(v) => setFormData({ ...formData, effectiveTo: v })} />
                  <p className="text-[11px] text-gray-400 mt-0.5">Leave empty for no expiry</p>
                </div>
              </div>
            </>
          )}

          {/* Active toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={formData.isActive}
              onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
          </label>

          {editingCode?.isSystemCode && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-3 py-2">
              <p className="text-xs text-amber-600 dark:text-amber-400">This is a system tax {formMode === 'group' ? 'group' : 'code'}. Some fields are restricted.</p>
            </div>
          )}

          {formError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2">
              <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !formData.code.trim() || !formData.name.trim()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : editingCode ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* --- Delete Confirmation Modal --- */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} className="max-w-md p-6">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-2.5 ${deleteTarget.isSystemCode || hasChildren(deleteTarget.id) ? 'bg-amber-50 dark:bg-amber-950/50' : 'bg-red-50 dark:bg-red-950/50'}`}>
                <AlertTriangle className={`w-5 h-5 ${deleteTarget.isSystemCode || hasChildren(deleteTarget.id) ? 'text-amber-500' : 'text-red-500'}`} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete {deleteTarget.isGroup ? 'Tax Group' : 'Tax Code'}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{deleteTarget.code} - {deleteTarget.name}</p>
              </div>
            </div>
            {deleteTarget.isSystemCode ? (
              <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">This is a system tax {deleteTarget.isGroup ? 'group' : 'code'} and cannot be deleted.</p>
            ) : deleteTarget.isGroup && hasChildren(deleteTarget.id) ? (
              <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">This tax group has tax types. Remove them first before deleting.</p>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">Are you sure you want to delete <strong>{deleteTarget.code}</strong>? This will soft-delete it.</p>
            )}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              {!deleteTarget.isSystemCode && !(deleteTarget.isGroup && hasChildren(deleteTarget.id)) && (
                <Button size="sm" onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Delete</Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: PASS. (`FilingPeriod` must be exported from `src/types/erp.ts` — it is, from Task 2.)

Manually verify at runtime (if dev server running): open Settings → Tax Codes; add a group; add a type under it; confirm the type's posting account shows; expand/collapse groups.

- [ ] **Step 3: Commit**

```bash
git add "NEW ERP/src/app/(admin)/settings/tax-setup/page.tsx"
git commit -m "feat(tax-setup): hierarchical group/type table with Add Group and Add Tax Type"
```

---

### Task 10: Posting Profiles UI — remove VAT fields

**Files:**
- Modify: `src/app/(admin)/settings/posting-profiles/page.tsx`

**Interfaces:**
- Consumes: `PostingProfile` type (VAT fields still in the type but unused), validator change (Task 3).
- Produces: posting-profile form without VAT Output / VAT Input fields (fields list, form types, empty form, edit mapping, restore body).

- [ ] **Step 1: Edit the page**

In `src/app/(admin)/settings/posting-profiles/page.tsx`:

1. Remove from `accountFields` (lines 40-41):
```ts
  { key: 'vatOutputCode', label: 'VAT Output', description: 'VAT collected on sales', required: true },
  { key: 'vatInputCode', label: 'VAT Input', description: 'VAT paid on purchases', required: true },
```

2. Remove from `ProfileFormData` interface (lines 54-55):
```ts
  vatOutputCode: string
  vatInputCode: string
```

3. Remove from `emptyForm()` (lines 70-71):
```ts
  vatOutputCode: '',
  vatInputCode: '',
```

4. Remove from `openEditForm` mapping (lines 165-166):
```ts
      vatOutputCode: profile.vatOutputCode,
      vatInputCode: profile.vatInputCode,
```

5. Remove from `restoreProfile` body (lines 220-221):
```ts
          vatOutputCode: profile.vatOutputCode || '',
          vatInputCode: profile.vatInputCode || '',
```

6. Update the header description (line 314) to drop the VAT mention:
```tsx
            Configure which accounts are used for each transaction type — Cash, AR, AP, Inventory, and more.
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: PASS. (The `PostingProfile` type still declares the fields — the page simply no longer references them.)

- [ ] **Step 3: Commit**

```bash
git add "NEW ERP/src/app/(admin)/settings/posting-profiles/page.tsx"
git commit -m "feat(posting-profiles): remove VAT account fields from the form"
```

---

### Task 11: Invoice pages — drop PostingProfile VAT fields, filter tax pickers to types

**Files:**
- Modify: `src/app/(admin)/invoice/sales/page.tsx` (interface ~103-113, picker ~708-711)
- Modify: `src/app/(admin)/invoice/purchase/page.tsx` (interface ~103-110, picker ~722)
- Modify: `src/app/(admin)/invoice/credit-note/page.tsx` (interface ~113-114, picker ~406)
- Modify: `src/app/(admin)/invoice/debit-note/page.tsx` (interface ~111-112, picker ~315)

**Interfaces:**
- Consumes: `TaxCode.isGroup` (Task 2).
- Produces: local `PostingProfile` interfaces without `vatOutputCode`/`vatInputCode`; tax pickers exclude groups (`!t.isGroup`).

- [ ] **Step 1: Remove the VAT fields from each local `PostingProfile` interface**

For **sales** page, change the interface to:

```ts
interface PostingProfile {
  id: number
  name: string
  invoiceType: string
  accountsReceivableCode: string
  accountsPayableCode: string
  inventoryAccountCode: string | null
  cogsAccountCode: string | null
}
```

For **purchase**, **credit-note**, and **debit-note** pages, remove the same two lines (`vatOutputCode`, `vatInputCode`) from their local `PostingProfile` interfaces.

- [ ] **Step 2: Filter tax pickers to types only**

- **sales** page, `outputTaxCodes` (line 708-711):
```ts
  const outputTaxCodes = useMemo(() => taxCodes
    .filter(t => t.type === 'output' && !t.isGroup)
    .map(t => ({ id: t.id, label: `${t.code} — ${t.name} (${t.rate}%)`, rate: t.rate })),
  [taxCodes])
```

- **purchase** page, `inputTaxCodes` (line ~722): add `&& !t.isGroup`.

- **credit-note** page, `inputTaxCodes` (line ~406): add `&& !t.isGroup`.

- **debit-note** page, `outputTaxCodes` (line ~315): add `&& !t.isGroup`.

- **sales** page also has a second `filter(t => t.type === 'output')` at line 415 in `handleProductSelect`-adjacent logic (`salesTaxCodes`) — add `&& !t.isGroup` there too.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "NEW ERP/src/app/(admin)/invoice/sales/page.tsx" "NEW ERP/src/app/(admin)/invoice/purchase/page.tsx" "NEW ERP/src/app/(admin)/invoice/credit-note/page.tsx" "NEW ERP/src/app/(admin)/invoice/debit-note/page.tsx"
git commit -m "feat(invoices): drop posting profile VAT fields, filter tax pickers to types"
```

---

### Task 12: Product form — tax situation labels, types only

**Files:**
- Modify: `src/app/(admin)/products/page.tsx` (lines 344-361)

**Interfaces:**
- Consumes: `TaxCode.isGroup` (Task 2).
- Produces: product form labels "Tax Situation — Sales" / "Tax Situation — Purchase"; dropdowns list active tax types only.

- [ ] **Step 1: Edit the labels and filters**

In `src/app/(admin)/products/page.tsx`, replace the two VAT select blocks (lines 344-361) with:

```tsx
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tax Situation — Sales</label>
                  <select value={formData.vatCodeId ?? ''} onChange={e => setFormData({ ...formData, vatCodeId: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                    <option value="">-- None --</option>
                    {taxCodes.filter(t => t.isActive && !t.isGroup).map(t => <option key={t.id} value={t.id}>{t.code} ({t.rate}%)</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tax Situation — Purchase</label>
                  <select value={formData.purchaseVatCodeId ?? ''} onChange={e => setFormData({ ...formData, purchaseVatCodeId: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                    <option value="">-- None --</option>
                    {taxCodes.filter(t => t.isActive && !t.isGroup).map(t => <option key={t.id} value={t.id}>{t.code} ({t.rate}%)</option>)}
                  </select>
                </div>
              </div>
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "NEW ERP/src/app/(admin)/products/page.tsx"
git commit -m "feat(products): tax situation labels, types only in pickers"
```

---

### Task 13: Purchase Orders — remove VAT from lines and totals

**Files:**
- Modify: `src/app/(admin)/purchase-orders/page.tsx`
- Modify: `src/lib/repositories/purchaseOrderRepository.ts` (addLine ~78-91, updateTotals ~93-96, mapPOLine ~21-29)
- Modify: `src/app/api/purchase-orders/route.ts` (lines 43-75)
- Modify: `src/app/api/purchase-orders/[id]/route.ts` (lines 68-95)
- Modify: `src/types/erp.ts` (PurchaseOrderLine ~252-273)
- Test: `src/lib/__tests__/repositories/purchaseOrderRepository.test.ts` (update addLine calls + vatAmount assertion)

**Interfaces:**
- Consumes: nothing new.
- Produces: PO lines carry only product/qty/price/discount/line total; PO `vatAmount` stored as 0; PO total = subtotal.

- [ ] **Step 1: Update the `PurchaseOrderLine` type**

In `src/types/erp.ts`, remove these three fields from `PurchaseOrderLine`:

```ts
  vatCodeId: number | null;
  vatRate: number;
  vatAmount: number;
```

(The physical columns stay; `mapPOLine` just stops mapping them.)

- [ ] **Step 2: Update the repository**

In `src/lib/repositories/purchaseOrderRepository.ts`:

- Remove `vatCodeId` from `mapPOLine`:
```ts
function mapPOLine(row: any): PurchaseOrderLine {
  return {
    ...row,
    warehouseId: row.warehouseId || null,
    costCenterId: row.costCenterId || null,
    accountCode: row.accountCode || '',
  };
}
```

- Replace `addLine` (remove the VAT columns from the INSERT — the DB columns keep their defaults):
```ts
  addLine(line: Omit<PurchaseOrderLine, 'id' | 'createdAt' | 'updatedAt'>): number {
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO purchase_order_line (poId, lineNumber, productId, description, quantity, unitPrice, receivedQuantity, invoicedQuantity, discountPercent, lineTotal, lineType, warehouseId, costCenterId, accountCode, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      line.poId, line.lineNumber, line.productId, line.description, line.quantity,
      line.unitPrice, line.receivedQuantity || 0, line.invoicedQuantity || 0,
      line.discountPercent || 0, line.lineTotal, line.lineType || 'stock', line.warehouseId,
      line.costCenterId, line.accountCode, now, now,
    );
    return result.lastInsertRowid as number;
  },
```

- Replace `updateTotals` (set VAT to 0):
```ts
  updateTotals(id: number, subtotal: number, totalAmount: number): void {
    const now = new Date().toISOString();
    db.prepare('UPDATE purchase_order SET subtotal=?, vatAmount=0, totalAmount=?, updatedAt=? WHERE id=?').run(subtotal, totalAmount, now, id);
  },
```

- [ ] **Step 3: Update the API routes**

In `src/app/api/purchase-orders/route.ts`, replace the line loop (lines 43-75):

```ts
    if (lines && Array.isArray(lines)) {
      let subtotal = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineTotal = line.quantity * line.unitPrice * (1 - (line.discountPercent || 0) / 100);

        purchaseOrderRepository.addLine({
          poId, lineNumber: i + 1,
          productId: line.productId,
          description: line.description || '',
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          receivedQuantity: 0, invoicedQuantity: 0,
          discountPercent: line.discountPercent || 0,
          lineTotal,
          lineType: line.lineType || 'stock',
          warehouseId: line.warehouseId ?? warehouseId ?? null,
          costCenterId: line.costCenterId || null,
          accountCode: line.accountCode || '',
        });

        subtotal += lineTotal;
      }

      purchaseOrderRepository.updateTotals(poId, subtotal, subtotal);
    }
```

In `src/app/api/purchase-orders/[id]/route.ts`, replace the line loop (lines 68-95) the same way, using `Number(id)` as `poId` and `purchaseOrderRepository.updateTotals(Number(id), subtotal, subtotal)`.

- [ ] **Step 4: Update the PO page**

In `src/app/(admin)/purchase-orders/page.tsx`:

1. Remove from `POLine` interface (lines 35-36): `vatCodeId`, `vatRate`, `vatAmount`.
2. Remove the `TaxCode` interface (line 43), the `taxCodes` state (line 128), and the tax fetch block (line ~208).
3. Remove from `LineForm` interface (line 48): `vatCodeId`, `vatRate`.
4. Remove from `newLine` (line 98): `vatCodeId: null, vatRate: 0,`.
5. Replace `lineTotals` (lines 231-238):
```ts
  const lineTotals = useMemo(() => {
    let subtotal = 0
    for (const line of formData.lines) {
      const lt = line.quantity * line.unitPrice * (1 - line.discountPercent / 100)
      subtotal += lt
    }
    return { subtotal, total: subtotal }
  }, [formData.lines])
```
6. Remove from `openEditForm` line mapping (line 264): `vatCodeId: l.vatCodeId, vatRate: l.vatRate,`.
7. Replace `handleProductSelect` (lines 277-290) — drop the `inputVat`/`defaultVat` logic:
```ts
  const handleProductSelect = (lineId: string, productId: number | null) => {
    if (productId === null) { updateLine(lineId, { productId: null, productCode: '', productName: '', description: '', unitPrice: 0, lineType: 'stock', warehouseId: null }); return }
    const product = products.find(p => p.id === productId)
    if (product) {
      updateLine(lineId, {
        productId: product.id, productCode: product.code, productName: product.name,
        description: product.name, unitPrice: Math.round(product.purchasePrice / 100),
        lineType: product.itemType, warehouseId: product.defaultWarehouseId || formData.warehouseId,
      })
    }
  }
```
8. Remove from `handleSave` line mapping (line 312): `vatCodeId: l.vatCodeId, vatRate: l.vatRate,`.
9. Remove the VAT summary row (line 698) so the totals card shows only Subtotal + Total:
```tsx
              <div className="flex items-center justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Subtotal</span><span className="text-gray-900 dark:text-white font-medium">${lineTotals.subtotal.toFixed(2)}</span></div>
              <div className="flex items-center justify-between text-base border-t border-gray-200 dark:border-gray-700 pt-1.5"><span className="font-semibold text-gray-900 dark:text-white">Total</span><span className="font-bold text-brand-600 dark:text-brand-400">${lineTotals.total.toFixed(2)}</span></div>
```

- [ ] **Step 5: Update the PO repository tests**

In `src/lib/__tests__/repositories/purchaseOrderRepository.test.ts`, remove `vatCodeId: null, vatRate: 0, vatAmount: 0,` from every `addLine` call, and change `updateTotals` calls to the 2-arg form. For the assertion that expects `po.vatAmount` (line ~109), change it to expect `0`:

```ts
      expect(po.vatAmount).toBe(0);
      expect(po.totalAmount).toBe(...);  // keep existing total expectation
```

Also update any `addLine` calls in `src/lib/__tests__/services/purchaseOrderService.test.ts` the same way (lines 36-37, 196-197, 249-250).

- [ ] **Step 6: Verify**

Run: `npx vitest run src/lib/__tests__/repositories/purchaseOrderRepository.test.ts src/lib/__tests__/services/purchaseOrderService.test.ts; npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "NEW ERP/src/types/erp.ts" "NEW ERP/src/lib/repositories/purchaseOrderRepository.ts" "NEW ERP/src/app/api/purchase-orders/route.ts" "NEW ERP/src/app/api/purchase-orders/[id]/route.ts" "NEW ERP/src/app/(admin)/purchase-orders/page.tsx" "NEW ERP/src/lib/__tests__/repositories/purchaseOrderRepository.test.ts" "NEW ERP/src/lib/__tests__/services/purchaseOrderService.test.ts"
git commit -m "feat(purchase-orders): remove VAT from lines and totals"
```

---

### Task 14: Reports — group-aware tax summary, group filter + subtotals, export group column

**Files:**
- Modify: `src/lib/services/reportingService.ts` (`getInvoiceTaxSummary` ~84-116)
- Modify: `src/app/(admin)/report/tax-summary/page.tsx`
- Modify: `src/lib/services/exportService.ts` (`taxSummary` ~296-327)
- Test: `src/lib/__tests__/services/reportingService.test.ts` (new)

**Interfaces:**
- Consumes: `tax_code.isGroup`/`parentId`/`filingPeriod` (Task 1).
- Produces: `getInvoiceTaxSummary` rows gain `groupName` + `filingPeriod`, ordered by group then code; the report page renders per-group subtotals with a group filter; export includes the Group column.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/services/reportingService.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from '../test-helper';
import { reportingService } from '../../services/reportingService';
import { invoiceRepository } from '../../repositories/invoiceRepository';
import { db } from '../../db';

describe('reportingService.getInvoiceTaxSummary', () => {
  beforeAll(async () => {
    await setupTestDatabase();
    const data = seedTestData();

    const id = invoiceRepository.create({
      type: 'sales', partnerName: 'Tax Customer',
      invoiceDate: '2026-07-01', dueDate: '2026-07-31', createdBy: 'test',
    });
    invoiceRepository.addLine({
      invoiceId: id, lineNumber: 1, productId: data.productIds.service,
      description: 'Taxable service', quantity: 1, unitPrice: 10000,
      discountPercent: 0, vatCodeId: data.taxCodeId, vatRate: 20,
      vatAmount: 2000, lineTotal: 10000, lineType: 'service',
      warehouseId: null, costCenterId: null, accountCode: '',
    });
    invoiceRepository.updateTotals(id, 10000, 2000, 12000);
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('should resolve the group name and filing period for each row', () => {
    const rows = reportingService.getInvoiceTaxSummary('2026-07-01', '2026-07-31');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = rows[0];
    expect(row.groupName).toBe('VAT Group');
    expect(row.filingPeriod).toBe('monthly');
  });

  it('should order rows by group then code', () => {
    const rows = reportingService.getInvoiceTaxSummary('2026-07-01', '2026-07-31');
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1].groupName.localeCompare(rows[i].groupName);
      expect(prev).toBeLessThanOrEqual(0);
    }
  });
});
```

Note: the seed group is named `VAT Group` (per Task 2 test-helper change). Adjust the assertion if the test-helper group name differs.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/services/reportingService.test.ts`
Expected: FAIL — rows have no `groupName`/`filingPeriod`.

- [ ] **Step 3: Update `getInvoiceTaxSummary`**

In `src/lib/services/reportingService.ts`, replace the `getInvoiceTaxSummary` method:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/services/reportingService.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the tax-summary page with group subtotals + filter**

In `src/app/(admin)/report/tax-summary/page.tsx`:

1. Extend the `TaxRow` interface (line 11-18):
```ts
interface TaxRow {
  vatCode: string
  vatName: string
  rate: number
  taxableAmount: number
  taxAmount: number
  invoiceCount: number
  groupName: string
  filingPeriod: string
}
```

2. Add state after `endDate`:
```ts
  const [groupFilter, setGroupFilter] = useState('all')
```

3. Compute the group list and filtered rows (after `fetchData`):
```ts
  const groups = useMemo(() => {
    const set = new Set<string>(['all'])
    rows.forEach(r => set.add(r.groupName || 'Ungrouped'))
    return Array.from(set)
  }, [rows])

  const filteredRows = useMemo(() => {
    if (groupFilter === 'all') return rows
    return rows.filter(r => (r.groupName || 'Ungrouped') === groupFilter)
  }, [rows, groupFilter])
```

4. Add the group filter dropdown next to the date range (after the date-range div, line ~100):
```tsx
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Group</label>
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
            {groups.map(g => <option key={g} value={g}>{g === 'all' ? 'All groups' : g}</option>)}
          </select>
        </div>
```

5. Render grouped rows with per-group subtotals. Replace the `<tbody>` block (lines 142-157) and the `rows.map` with a grouped render. Add a helper above the return:

```tsx
  const groupedRows = useMemo(() => {
    const out: { groupName: string; rows: TaxRow[]; taxable: number; tax: number }[] = []
    for (const r of filteredRows) {
      const name = r.groupName || 'Ungrouped'
      let bucket = out.find(b => b.groupName === name)
      if (!bucket) { bucket = { groupName: name, rows: [], taxable: 0, tax: 0 }; out.push(bucket) }
      bucket.rows.push(r)
      bucket.taxable += r.taxableAmount
      bucket.tax += r.taxAmount
    }
    return out
  }, [filteredRows])
```

6. Replace the `<tbody>` with:

```tsx
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {groupedRows.map(bucket => (
                    <GroupRows key={bucket.groupName} bucket={bucket} />
                  ))}
                </tbody>
```

And define the `GroupRows` component above the default export (or inline as a function component in the same file):

```tsx
function GroupRows({ bucket }: { bucket: { groupName: string; rows: TaxRow[]; taxable: number; tax: number } }) {
  return (
    <>
      <tr className="bg-gray-50/70 dark:bg-gray-800/40">
        <td colSpan={6} className="py-2 px-4 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          {bucket.groupName}
        </td>
      </tr>
      {bucket.rows.map((t, i) => (
        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
          <td className="py-2.5 px-4 text-sm font-mono text-brand-600 dark:text-brand-400">{t.vatCode}</td>
          <td className="py-2.5 px-4 text-sm text-gray-900 dark:text-white">{t.vatName}</td>
          <td className="py-2.5 px-4 text-sm text-center">
            <span className="inline-flex text-xs font-medium px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-300">{t.rate}%</span>
          </td>
          <td className="py-2.5 px-4 text-sm text-right text-gray-600 dark:text-gray-400">{formatCurrency(t.taxableAmount)}</td>
          <td className="py-2.5 px-4 text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(t.taxAmount)}</td>
          <td className="py-2.5 px-4 text-sm text-right text-gray-500 dark:text-gray-400">{t.invoiceCount}</td>
        </tr>
      ))}
      <tr className="bg-gray-50 dark:bg-gray-900/50">
        <td colSpan={3} className="py-2 px-4 text-xs font-medium text-gray-500 dark:text-gray-400">Group subtotal</td>
        <td className="py-2 px-4 text-sm text-right text-gray-700 dark:text-gray-300">{formatCurrency(bucket.taxable)}</td>
        <td className="py-2 px-4 text-sm text-right text-brand-600 dark:text-brand-400">{formatCurrency(bucket.tax)}</td>
        <td className="py-2 px-4 text-sm text-right text-gray-500 dark:text-gray-400">{bucket.rows.reduce((s, r) => s + r.invoiceCount, 0)}</td>
      </tr>
    </>
  )
}
```

Update the totals footer (`tfoot`, lines 158-165) to use `filteredRows` instead of `rows`:

```tsx
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 dark:bg-gray-900/50 font-semibold">
                    <td colSpan={3} className="py-3 px-4 text-sm text-gray-900 dark:text-white">Total</td>
                    <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white">{formatCurrency(filteredRows.reduce((s, r) => s + r.taxableAmount, 0))}</td>
                    <td className="py-3 px-4 text-sm text-right text-brand-600 dark:text-brand-400">{formatCurrency(filteredRows.reduce((s, r) => s + r.taxAmount, 0))}</td>
                    <td className="py-3 px-4 text-sm text-right text-gray-500 dark:text-gray-400">{filteredRows.reduce((s, r) => s + r.invoiceCount, 0)}</td>
                  </tr>
                </tfoot>
```

Update the "Tax Codes" StatCard (line 123) to `filteredRows.length`, and the `totalTaxable`/`totalTax` computations (lines 64-65) to use `filteredRows`. Add `useMemo` to the React import if not present.

- [ ] **Step 6: Update the export with the group column**

In `src/lib/services/exportService.ts`, replace the `taxSummary` headers/rowData/totals:

```ts
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
```

- [ ] **Step 7: Verify**

Run: `npx vitest run src/lib/__tests__/services/reportingService.test.ts; npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "NEW ERP/src/lib/services/reportingService.ts" "NEW ERP/src/lib/services/exportService.ts" "NEW ERP/src/app/(admin)/report/tax-summary/page.tsx" "NEW ERP/src/lib/__tests__/services/reportingService.test.ts"
git commit -m "feat(reports): group-aware tax summary with subtotals, filter, and export column"
```

---

### Task 15: Chart of Accounts — "Used In" indicator (settings only)

**Files:**
- Modify: `src/app/(admin)/accounting/chart-of-accounts/page.tsx`

**Interfaces:**
- Consumes: `GET /api/accounts` now returns `usage` (Task 7), `AccountUsage` type (Task 2).
- Produces: a "Used In" column with Posting Profile (blue) / Tax (purple) chips and a hover tooltip listing profile names+roles and tax code names. Gray "—" when unused. Read-only.

- [ ] **Step 1: Add usage state and fetch**

In `src/app/(admin)/accounting/chart-of-accounts/page.tsx`:

1. Add state near the other state declarations:
```tsx
  const [usageMap, setUsageMap] = useState<Record<string, AccountUsage>>({})
```

2. Update `fetchAccounts` to also capture usage:
```tsx
  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setAccounts(json.data)
      setUsageMap(json.usage || {})
    } catch (err) {
      setError('Failed to load accounts. Make sure the server is running.')
    } finally {
      setLoading(false)
    }
  }, [])
```

3. Add the import:
```tsx
import type { Account, AccountUsage } from '@/types/erp'
```
(replace the existing `import type { Account } ...` if needed — check the current import at the top of the file.)

- [ ] **Step 2: Add a small chip/tooltip component above the page component**

Add this component near the top of the file (after helpers):

```tsx
function UsageCell({ usage }: { usage?: AccountUsage }) {
  const [hover, setHover] = useState(false)
  const hasPosting = (usage?.postingProfiles?.length || 0) > 0
  const hasTax = (usage?.taxCodes?.length || 0) > 0
  if (!hasPosting && !hasTax) return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-center gap-1 flex-wrap">
        {hasPosting && (
          <span className="inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">Posting Profile</span>
        )}
        {hasTax && (
          <span className="inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400">Tax</span>
        )}
      </div>
      {hover && (
        <div className="absolute z-30 left-0 top-full mt-1 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-xl text-xs">
          {hasPosting && (
            <div className="mb-2">
              <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Posting Profiles</p>
              {usage!.postingProfiles.map((p, i) => (
                <p key={i} className="text-gray-500 dark:text-gray-400">{p.name} <span className="text-gray-400 dark:text-gray-500">({p.role})</span></p>
              ))}
            </div>
          )}
          {hasTax && (
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Tax Codes</p>
              {usage!.taxCodes.map((name, i) => (
                <p key={i} className="text-gray-500 dark:text-gray-400">{name}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add the column header and cell**

1. In the `<thead>` (lines 697-705), add a header before Actions:
```tsx
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Used In</th>
```

2. In `renderAccountRows`, add a cell before the Actions `<td>` (line 579):
```tsx
        {/* Used In */}
        <td className="py-2 px-3">
          <UsageCell usage={usageMap[account.code]} />
        </td>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: PASS.

Manually verify at runtime: open Chart of Accounts; accounts referenced in posting profiles show the blue chip, accounts used as tax posting accounts show the purple chip, unused show "—"; hover a chip to see details.

- [ ] **Step 5: Commit**

```bash
git add "NEW ERP/src/app/(admin)/accounting/chart-of-accounts/page.tsx"
git commit -m "feat(chart-of-accounts): settings-only Used In indicator with hover tooltip"
```

---

### Task 16: Final verification — full suite + typecheck + build

**Files:**
- None (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all suites).

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: SUCCESS (no TypeScript or lint-blocking errors).

If the build surfaces any remaining references to removed fields (e.g. a `vatOutputCode` usage missed in an invoice page), fix them in this task before committing.

- [ ] **Step 4: Run ESLint**

Run: `npm run lint`
Expected: PASS (or only pre-existing warnings).

- [ ] **Step 5: Commit any final fixes**

```bash
git add "NEW ERP"
git commit -m "chore: final tax-groups verification"
```

---

## Self-Review Notes

- **Spec coverage:** every spec section maps to a task: S1 data model → T1/T2; S2 API/validation → T3/T4/T5/T6/T7; S3 tax setup UI → T9; S4 posting → T8; S5 posting-profiles UI → T10; S6 invoice pages → T11; S7 product form → T12; S8 purchase orders → T13; S9 reports → T14; S10 tests → distributed across tasks (validators T3, repository T4/T6, invoiceService T8, reportingService T14, PO tests T13); S11 CoA "Used In" → T15.
- **Known conflict resolutions baked in:** duplicate `postingProfileRepository` removed in T4 + import fixed in T5; `accountRepository.isUsedInPostingProfiles` VAT conditions removed in T6; invoice pickers filter `!t.isGroup` in T11; `postInvoice` passes `vatCodeId` in T8; "Ungrouped" section in T9; group seed is `isSystemCode=1` in T1; export group column in T14; `updateTaxCodeSchema = base.partial()` (no superRefine) so restores like `{isActive:true}` pass in T3.
- **Type consistency:** `filingPeriod` is typed as `FilingPeriod` in `erp.ts` and used identically in validators, repository, UI, and reports. `getUsageMap` returns `Record<string, AccountUsage>` and is consumed by `GET /api/accounts` then the CoA page. `getInvoiceTaxSummary` row shape (incl. `groupName`, `filingPeriod`) is shared by the page and `exportService.taxSummary`.
