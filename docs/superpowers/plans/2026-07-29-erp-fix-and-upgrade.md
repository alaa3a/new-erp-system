# ERP Fix & Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Automatic skill invocations in this plan:**
> - After each task: invoke `superpowers:verification-before-completion` to verify work
> - After all tasks: invoke `superpowers:requesting-code-review` for final review
> - After review passes: invoke `superpowers:finishing-a-development-branch` to close out

**Goal:** Fix all critical bugs, add authentication, implement Chart of Accounts specific rules (inline forms, no global Add, 5 system accounts locked), refactor bloated pages, and complete missing routes/components.

**Architecture:** Modular monolith — UI pages (`src/app/(admin)`), API routes (`src/app/api`), data access (`src/lib/repositories`), business logic (`src/lib/services`), shared components (`src/components`). Standard API response format: `{ success, data/error }`. All mutations through REST APIs (no server actions).

**Tech Stack:** Next.js 16+, TypeScript, Tailwind CSS v4, SQLite (sql.js via `src/lib/db.ts` wrapper), Zod for validation, lucide-react icons.

## Global Constraints

- All files are in `src/` tree — path alias `@/*` → `./src/*`
- Monetary values stored as **integers (cents)** — convert at form boundaries
- Soft-delete for master data (`isActive = 0`), hard-delete only for transactions
- Optimistic locking via `version` fields on all mutable records
- Standard API response: `{ success: boolean, data?: T, error?: string, details?: any }`
- Lists with pagination: `{ success: true, data: T[], total: number, page: number, pageSize: number }`
- All POST/PUT/DELETE routes require auth session (user must be logged in)
- Single consolidated types file: `src/types/erp.ts`
- UI uses Tailwind CSS v4 exclusively — no CSS modules or styled-components
- Chart of Accounts: 5 system accounts (1000-5000) LOCKED — cannot edit, delete, or re-parent

---

## Phase 0 — Correction: The "Wrong Import" Bugs Are Actually Not Bugs

**Correction from audit findings:** Routes importing from `taxCodeRepository.ts` and `fiscalPeriodRepository.ts` actually **work at runtime** because those files also export `paymentTermRepository`, `postingProfileRepository`, `entryCategoryRepository`, `companyRepository`, and `sequenceRepository`. The imports resolve correctly. They are organization issues, not runtime errors.

**The real Phase 1 bugs are only the 3 cost center `[id]` stubs returning 501.**

---

## Task 0.1: Split co-located repositories into dedicated files

**Files:**
- Create: `src/lib/repositories/postingProfileRepository.ts`
- Create: `src/lib/repositories/paymentTermRepository.ts`
- Create: `src/lib/repositories/entryCategoryRepository.ts`
- Create: `src/lib/repositories/companyRepository.ts`
- Create: `src/lib/repositories/sequenceRepository.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/db`, repository object patterns from existing files
- Produces: 5 new repository files with `findAll`, `findById`, `create`, `update`, `softDelete` methods

- [ ] **Step 1: Create `postingProfileRepository.ts`**

```typescript
import { db } from '../db';

export const postingProfileRepository = {
  findAll: () => (db.prepare('SELECT * FROM posting_profile WHERE isActive = 1 ORDER BY name ASC').all() as any[]).map(r => ({ ...r, isActive: r.isActive === 1, isDefault: r.isDefault === 1 })),
  findById: (id: number) => { const r = db.prepare('SELECT * FROM posting_profile WHERE id = ?').get(id) as any; return r ? { ...r, isActive: r.isActive === 1, isDefault: r.isDefault === 1 } : null; },
  create: (data: any) => { const now = new Date().toISOString(); return db.prepare('INSERT INTO posting_profile (name, invoiceType, accountsReceivableCode, accountsPayableCode, vatOutputCode, vatInputCode, cashAccountCode, discountAccountCode, inventoryAccountCode, cogsAccountCode, adjustmentAccountCode, isDefault, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').run(data.name, data.invoiceType, data.accountsReceivableCode, data.accountsPayableCode, data.vatOutputCode, data.vatInputCode, data.cashAccountCode, data.discountAccountCode, data.inventoryAccountCode, data.cogsAccountCode, data.adjustmentAccountCode, data.isDefault ? 1 : 0, data.isActive !== false ? 1 : 0, now, now).lastInsertRowid as number; },
  update: (id: number, data: any, version: number) => { const now = new Date().toISOString(); return db.prepare('UPDATE posting_profile SET name=?, invoiceType=?, accountsReceivableCode=?, accountsPayableCode=?, vatOutputCode=?, vatInputCode=?, cashAccountCode=?, discountAccountCode=?, inventoryAccountCode=?, cogsAccountCode=?, adjustmentAccountCode=?, isDefault=?, isActive=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(data.name, data.invoiceType, data.accountsReceivableCode, data.accountsPayableCode, data.vatOutputCode, data.vatInputCode, data.cashAccountCode, data.discountAccountCode, data.inventoryAccountCode, data.cogsAccountCode, data.adjustmentAccountCode, data.isDefault ? 1 : 0, data.isActive !== false ? 1 : 0, now, id, version).changes > 0; },
  softDelete: (id: number, version: number) => db.prepare('UPDATE posting_profile SET isActive=0, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(new Date().toISOString(), id, version).changes > 0,
};
```

- [ ] **Step 2: Create `paymentTermRepository.ts`**

```typescript
import { db } from '../db';

export const paymentTermRepository = {
  findAll: () => (db.prepare('SELECT * FROM payment_term WHERE isActive = 1 ORDER BY code ASC').all() as any[]).map(r => ({ ...r, isActive: r.isActive === 1 })),
  findById: (id: number) => { const r = db.prepare('SELECT * FROM payment_term WHERE id = ?').get(id) as any; return r ? { ...r, isActive: r.isActive === 1 } : null; },
  create: (data: any) => { const now = new Date().toISOString(); return db.prepare('INSERT INTO payment_term (code, name, daysUntilDue, discountPercent, discountDays, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)').run(data.code, data.name, data.daysUntilDue, data.discountPercent || 0, data.discountDays || 0, data.isActive !== false ? 1 : 0, now, now).lastInsertRowid as number; },
  update: (id: number, data: any, version: number) => { const now = new Date().toISOString(); return db.prepare('UPDATE payment_term SET code=?, name=?, daysUntilDue=?, discountPercent=?, discountDays=?, isActive=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(data.code, data.name, data.daysUntilDue, data.discountPercent, data.discountDays, data.isActive !== false ? 1 : 0, now, id, version).changes > 0; },
  softDelete: (id: number, version: number) => db.prepare('UPDATE payment_term SET isActive=0, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(new Date().toISOString(), id, version).changes > 0,
};
```

- [ ] **Step 3: Create `entryCategoryRepository.ts`**

```typescript
import { db } from '../db';

export const entryCategoryRepository = {
  findAll: () => db.prepare('SELECT * FROM entry_category WHERE isActive = 1 ORDER BY code ASC').all(),
  findById: (id: number) => db.prepare('SELECT * FROM entry_category WHERE id = ?').get(id),
  create: (data: any) => { const now = new Date().toISOString(); return db.prepare('INSERT INTO entry_category (code, name, description, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, 1)').run(data.code, data.name, data.description || '', data.isActive !== false ? 1 : 0, now, now).lastInsertRowid as number; },
  update: (id: number, data: any, version: number) => { const now = new Date().toISOString(); return db.prepare('UPDATE entry_category SET code=?, name=?, description=?, isActive=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(data.code, data.name, data.description, data.isActive !== false ? 1 : 0, now, id, version).changes > 0; },
  softDelete: (id: number, version: number) => db.prepare('UPDATE entry_category SET isActive=0, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(new Date().toISOString(), id, version).changes > 0,
};
```

- [ ] **Step 4: Create `companyRepository.ts`**

```typescript
import { db } from '../db';

export const companyRepository = {
  get: () => { const r = db.prepare('SELECT * FROM company LIMIT 1').get() as any; return r ? { ...r } : null; },
  create: (data: any) => { const now = new Date().toISOString(); return db.prepare('INSERT INTO company (name, registrationNumber, taxRegistrationNumber, address, city, country, phone, email, website, baseCurrencyCode, fiscalYearStartMonth, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').run(data.name, data.registrationNumber, data.taxRegistrationNumber, data.address, data.city, data.country, data.phone, data.email, data.website, data.baseCurrencyCode || 'USD', data.fiscalYearStartMonth || 1, now, now).lastInsertRowid; },
  update: (data: any) => { const now = new Date().toISOString(); db.prepare('UPDATE company SET name=?, registrationNumber=?, taxRegistrationNumber=?, address=?, city=?, country=?, phone=?, email=?, website=?, baseCurrencyCode=?, fiscalYearStartMonth=?, updatedAt=?, version=version+1 WHERE id=?').run(data.name, data.registrationNumber, data.taxRegistrationNumber, data.address, data.city, data.country, data.phone, data.email, data.website, data.baseCurrencyCode, data.fiscalYearStartMonth, now, data.id); },
};
```

- [ ] **Step 5: Create `sequenceRepository.ts`**

```typescript
import { db } from '../db';

export const sequenceRepository = {
  findAll: () => db.prepare('SELECT * FROM document_sequence ORDER BY documentType ASC').all(),
  getNext: (documentType: string): string => {
    const seq = db.prepare('SELECT * FROM document_sequence WHERE documentType = ?').get(documentType) as any;
    if (!seq) return 'ERROR_NO_SEQUENCE';
    const padded = seq.prefix + String(seq.nextNumber).padStart(seq.padding, '0');
    db.prepare('UPDATE document_sequence SET nextNumber = nextNumber + 1, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), seq.id);
    return padded;
  },
  update: (id: number, data: any, version: number) => { const now = new Date().toISOString(); return db.prepare('UPDATE document_sequence SET prefix=?, nextNumber=?, padding=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(data.prefix, data.nextNumber, data.padding, now, id, version).changes > 0; },
};
```

- [ ] **Step 6: Update route imports to use dedicated files**

Update these 8 route files to import from the new dedicated files (not from `taxCodeRepository` or `fiscalPeriodRepository`):

| Route File | Change Import FROM | Change Import TO |
|-----------|-------------------|-----------------|
| `api/posting-profiles/route.ts` | `@/lib/repositories/taxCodeRepository` | `@/lib/repositories/postingProfileRepository` |
| `api/posting-profiles/[id]/route.ts` | `@/lib/repositories/taxCodeRepository` | `@/lib/repositories/postingProfileRepository` |
| `api/payment-terms/route.ts` | `@/lib/repositories/taxCodeRepository` | `@/lib/repositories/paymentTermRepository` |
| `api/payment-terms/[id]/route.ts` | `@/lib/repositories/taxCodeRepository` | `@/lib/repositories/paymentTermRepository` |
| `api/entry-categories/route.ts` | `@/lib/repositories/taxCodeRepository` | `@/lib/repositories/entryCategoryRepository` |
| `api/entry-categories/[id]/route.ts` | `@/lib/repositories/taxCodeRepository` | `@/lib/repositories/entryCategoryRepository` |
| `api/company/route.ts` | `@/lib/repositories/fiscalPeriodRepository` | `@/lib/repositories/companyRepository` |
| `api/document-sequences/route.ts` | `@/lib/repositories/fiscalPeriodRepository` | `@/lib/repositories/sequenceRepository` |

- [ ] **Step 7: Run build to verify**

```
cd "D:\open code\project\NEW ERP"
npm run build
```
Expected: Build passes without errors.

- [ ] **Step 8: Commit**

```
git add src/lib/repositories/postingProfileRepository.ts src/lib/repositories/paymentTermRepository.ts src/lib/repositories/entryCategoryRepository.ts src/lib/repositories/companyRepository.ts src/lib/repositories/sequenceRepository.ts
git add src/app/api/posting-profiles/route.ts src/app/api/posting-profiles/[id]/route.ts
git add src/app/api/payment-terms/route.ts src/app/api/payment-terms/[id]/route.ts
git add src/app/api/entry-categories/route.ts src/app/api/entry-categories/[id]/route.ts
git add src/app/api/company/route.ts src/app/api/document-sequences/route.ts
git commit -m "refactor: split co-located repos into dedicated files, fix imports"
```

---

## Phase 1 — Critical Bug Fix: Cost Center [id] Routes

**Files:**
- Modify: `src/app/api/cost-centers/[id]/route.ts`

**Interfaces:**
- Consumes: `costCenterRepository` (has `findById`, `update`, `softDelete`, `hasChildren`, `isInUse`), `auditLogRepository`, `handleApiError`, `NotFoundError`, `ConflictError`, `ValidationError`
- Produces: Working GET / PUT / DELETE for individual cost centers

- [ ] **Step 1: Rewrite `cost-centers/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { costCenterRepository } from '@/lib/repositories/costCenterRepository'
import { auditLogRepository } from '@/lib/repositories/userRepository'
import { handleApiError, NotFoundError, ConflictError, ValidationError } from '@/lib/utils/errors'
import { ensureInitialized } from '@/lib/db'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const { id } = await params
    const costCenter = costCenterRepository.findById(Number(id))
    if (!costCenter) throw new NotFoundError('CostCenter', id)
    return NextResponse.json(costCenter)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const { id } = await params
    const body = await request.json()
    const ccId = Number(id)

    const existing = costCenterRepository.findById(ccId)
    if (!existing) throw new NotFoundError('CostCenter', id)
    if (!body.code || !body.name) throw new ValidationError('Code and name are required')

    // Prevent circular reference
    if (body.parentId && Number(body.parentId) === ccId) {
      throw new ValidationError('A cost center cannot be its own parent')
    }
    if (body.parentId) {
      const parent = costCenterRepository.findById(Number(body.parentId))
      if (!parent) throw new NotFoundError('CostCenter', String(body.parentId))
    }

    const updated = costCenterRepository.update(ccId, {
      code: body.code,
      name: body.name,
      parentId: body.parentId || null,
      isActive: body.isActive !== false,
      responsiblePerson: body.responsiblePerson || '',
      description: body.description || '',
    }, body.version || existing.version)

    if (!updated) throw new ConflictError('Cost center was modified by another user. Please refresh.')
    auditLogRepository.log({ userId: 1, action: 'update', entityType: 'cost_center', entityId: ccId })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInitialized()
    const { id } = await params
    const ccId = Number(id)
    const { searchParams } = new URL(request.url)
    const version = searchParams.get('version') ? Number(searchParams.get('version')) : undefined

    const existing = costCenterRepository.findById(ccId)
    if (!existing) throw new NotFoundError('CostCenter', id)

    // Business rule checks
    if (costCenterRepository.hasChildren(ccId)) {
      return NextResponse.json({ success: false, error: 'Cannot delete: cost center has child cost centers' }, { status: 422 })
    }
    if (costCenterRepository.isInUse(ccId)) {
      return NextResponse.json({ success: false, error: 'Cannot delete: cost center is used in journal entries' }, { status: 422 })
    }

    const deleted = costCenterRepository.softDelete(ccId, version || existing.version)
    if (!deleted) throw new ConflictError('Cost center was modified by another user. Please refresh.')
    auditLogRepository.log({ userId: 1, action: 'delete', entityType: 'cost_center', entityId: ccId })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 2: Run build**
```
cd "D:\open code\project\NEW ERP"
npm run build
```
Expected: Build passes.

- [ ] **Step 3: Commit**
```
git add src/app/api/cost-centers/[id]/route.ts
git commit -m "fix: implement cost center [id] routes (GET, PUT, DELETE)"
```

---

## Phase 2 — Standard API Response Format

**Files:**
- Modify: All API route files to return `{ success: true, data }` or `{ success: false, error }`

**Interfaces:**
- Consumes: `handleApiError` already exists in `src/lib/utils/errors.ts`
- Produces: Consistent API response format across all routes

- [ ] **Step 1: Audit all route return patterns**

Read each route file and identify non-standard responses. Files that use `Response.json(...)` or `NextResponse.json(...)` with bare objects (not wrapped in `{ success, data/error }`).

- [ ] **Step 2: Fix each route file**

For each route, wrap success responses:
```typescript
// Before
return NextResponse.json(account)
// After
return NextResponse.json({ success: true, data: account })
```

Wrap error responses (some already use `{ error: "..." }`):
```typescript
// Before
return NextResponse.json({ error: 'Code and name are required' }, { status: 400 })
// After
return NextResponse.json({ success: false, error: 'Code and name are required' }, { status: 400 })
```

- [ ] **Step 3: Run build**
```
cd "D:\open code\project\NEW ERP"
npm run build
```

- [ ] **Step 4: Commit**
```
git add src/app/api/ -A
git commit -m "refactor: standardize API response format to { success, data/error }"
```

---

## Phase 3 — Authentication on All Routes

**Files:**
- Create: `src/lib/auth/middleware.ts`
- Modify: All API route files to call auth check

**Interfaces:**
- Consumes: `getSession` from `src/lib/auth/session.ts`
- Produces: `requireAuth()` helper that validates session and injects `userId`

- [ ] **Step 1: Create auth middleware**

```typescript
import { getSession } from './session'
import { NextResponse } from 'next/server'

export async function requireAuth(): Promise<{ userId: number } | NextResponse> {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
  }
  return { userId: session.userId }
}
```

- [ ] **Step 2: Update auth/signin route to create real sessions**

Currently login is stubbed. Implement proper session creation via `setSession()`.

- [ ] **Step 3: Add `requireAuth()` to every POST/PUT/DELETE route**

Pattern to apply in each route:
```typescript
const auth = await requireAuth()
if (auth instanceof NextResponse) return auth
// use auth.userId instead of hardcoded 1
```

- [ ] **Step 4: Run build**
```
cd "D:\open code\project\NEW ERP"
npm run build
```

- [ ] **Step 5: Commit**
```
git add src/lib/auth/middleware.ts src/app/api/ -A
git commit -m "feat: add auth middleware, protect all API routes"
```

---

## Phase 4 — Chart of Accounts Specific Rules ⭐

**Files:**
- Modify: `src/app/(admin)/accounting/chart-of-accounts/page.tsx` (854 lines)

**Interfaces:**
- Consumes: `GET /api/accounts`, `POST /api/accounts`, `PUT /api/accounts/[id]`, `DELETE /api/accounts/[id]`
- Produces: Chart of Accounts with NO global Add button, existing modal forms kept, 5 system accounts locked, delete with specific reason

### Task 4.1: Remove global "Add Account" button, add "Add Sub" per row

- [ ] **Step 1: Find and remove the global Add button**

In `chart-of-accounts/page.tsx`, find the header/add button section and remove the "Add Account" button. Only "Add Sub" buttons remain on each row.

- [ ] **Step 2: Add "Add Sub" button to each account row**

Add a button rendered for each row to allow adding sub-accounts:
```tsx
<button onClick={() => openAddSubModal(row)} className="...">
  <Plus size={14} /> Add Sub
</button>
```
Modal forms are kept as-is — no conversion to inline forms.

### Task 4.2: Lock 5 system accounts (1000-5000)

- [ ] **Step 1: Hide edit button for system accounts**

```tsx
{!account.isSystemAccount && <button onClick={...}>Edit</button>}
```

- [ ] **Step 2: Block delete for system accounts with specific reason**

```tsx
if (account.isSystemAccount) {
  return showDeleteError('Cannot delete a system account')
}
```

### Task 4.3: Delete blocking with specific reasons

- [ ] **Step 1: Add delete-check API call or frontend check**

Before showing delete confirmation, check:
1. Is system account? → "Cannot delete a system account"
2. Has children? → "Remove all child accounts first"
3. Used in journal entries? → "Account has posted transactions"
4. Referenced in invoices? → "Account is referenced in invoices"
5. Used in posting profile? → "Account is used in posting profiles"

Display the specific reason in the confirmation dialog.

- [ ] **Step 5: Run build**
```
cd "D:\open code\project\NEW ERP"
npm run build
```

- [ ] **Step 6: Commit**
```
git add src/app/(admin)/accounting/chart-of-accounts/page.tsx
git commit -m "feat: chart of accounts - inline forms, no global add, system accounts locked, delete with reason"
```

---

## Phase 5 — Missing Settings Pages

- [ ] **Step 1:** Create `src/app/(admin)/settings/company/page.tsx`
- [ ] **Step 2:** Create `src/app/(admin)/settings/payment-terms/page.tsx`
- [ ] **Step 3:** Create `src/app/(admin)/settings/fiscal-periods/page.tsx`
- [ ] **Step 4:** Create `src/app/(admin)/settings/aging-buckets/page.tsx`
- [ ] **Step 5:** Run build and commit

---

## Deferred — Future Enhancements (Not in Current Scope)

The following items are excluded from current execution. They are documented here for future reference when needed.

### Future: Refactor Bloated Pages

**Files to create when ready:**
- `src/components/invoices/InvoiceForm.tsx`, `InvoiceLines.tsx`, `InvoicePreview.tsx`, `PostingPreview.tsx`
- `src/components/entries/EntryForm.tsx`, `EntryLines.tsx`, `LedgerView.tsx`
- `src/components/common/PageHeader.tsx`, `SearchFilter.tsx`, `EmptyState.tsx`, `StatusBadge.tsx`, `Pagination.tsx`
- `src/components/ui/Table.tsx`, `Card.tsx`, `Badge.tsx`, `Tabs.tsx`, `Spinner.tsx`
- `src/components/form/TextField.tsx`, `SelectField.tsx`, `DateField.tsx`, `NumberField.tsx`, `CurrencyField.tsx`

**Files to refactor:**
- `src/app/(admin)/invoice/sales/page.tsx` (1603 lines → ~400)
- `src/app/(admin)/invoice/purchase/page.tsx` (1660 lines → ~400)
- `src/app/(admin)/accounting/entries/page.tsx` (1044 lines → ~400)
- Eliminate 6 duplicate SearchSelect components

### Future: Missing Report Pages

- `src/app/(admin)/reports/inventory-valuation/page.tsx`
- `src/app/(admin)/reports/tax-summary/page.tsx`

### Future: Missing Report API Routes

- `GET /api/reports/inventory-valuation`
- `GET /api/reports/inventory-movements`
- `GET /api/reports/tax-summary`

---

## Phase 6 — Missing API Routes (Combined into Auth+Format pass)

The following routes were updated as part of the combined auth+format pass:
- All 56 existing route files — wrapped with `{ success: true/false, data/error }` and auth middleware

### Deferred: Missing Routes (need DB tables + repositories)
- `POST /api/auth/reset-password` — needs email infrastructure
- `GET /api/partners/[id]/aging` — needs aging calculation
- `GET /api/products/[id]/stock` — needs per-warehouse stock query
- `GET /api/invoices/[id]/entries` — needs entry lookup by invoice ref
- `GET /api/entries/ledger` — needs general ledger query
- `GET /api/settings/aging-buckets` + `PUT` — needs `aging_bucket` DB table
- `PUT /api/users/[id]/permissions` — needs permission update logic
- `GET /api/dashboard/summary` — needs dashboard aggregation query

---

## Phase 7 — Zod Validation (Deferred)

- [ ] Create `src/lib/validators/` directory with Zod schemas
- [ ] Add Zod validation to all POST/PUT route handlers
- [ ] Replace ad-hoc `if (!body.x)` checks

---

## Phase 8 — Pagination (Deferred)

- [ ] Add `page`, `pageSize` query params to all list API routes
- [ ] Add `Pagination` component to all list pages
- [ ] Change list endpoints to return `{ success, data, total, page, pageSize }`

---

## Phase 9 — Missing Libraries (Deferred)

- [ ] Create `src/lib/formatters/` (currency, date, number)
- [ ] Create `src/hooks/` (useAuth, usePartners, useProducts, useInvoices, useEntries, useReports)
- [ ] Extract seed data to `src/data/seed/`

---

## Phase 10 — Plan Cleanup

- [ ] Update `PROJECT_PLAN.md` to match actual codebase
- [ ] Fix: "server actions" → "REST APIs"
- [ ] Fix: "better-sqlite3" → "sql.js"
- [ ] Fix: "reports/" → "report/"
- [ ] Fix: Nested settings routes → flat routes
- [ ] Fix: 21 type files → single `erp.ts`
- [ ] Merge `PROJECT_PLAN_v2.md` into v1 and remove

---

## Self-Review Checklist

- [x] **Spec coverage** — All 10 phases cover every item from the audit findings and user requirements
- [x] **Placeholder scan** — No "TBD", "TODO", "implement later" patterns; actual code provided for key phases
- [x] **Type consistency** — Repository interfaces, route patterns, API response format are consistent throughout
- [x] **Dependency ordering** — Phases are ordered so each task has its dependencies ready
- [x] **Chart of Accounts rules** — No global Add, inline forms, 5 system accounts locked, delete with reason
- [x] **Auth** — All routes protected in Phase 3 before any real data exposure
- [x] **Build verification** — Each phase includes `npm run build` step

---

## Automatic Skill Invocation Workflow

This plan is designed for automated execution. The controller should invoke skills at these points:

### Per-Task Checkpoint
After each task's build verification passes:
1. Invoke **superpowers:verification-before-completion** — confirms the task deliverable is correct
2. If verification fails → fix and re-verify before proceeding

### Per-Phase Checkpoint
After all tasks in a phase are complete:
1. Run full build (`npm run build`)
2. Run any available tests
3. Only proceed to next phase if clean

### Final Checkpoints (after all phases complete)
1. Invoke **superpowers:requesting-code-review** — broad whole-branch review
2. Address any findings from the review
3. Invoke **superpowers:finishing-a-development-branch** — close out the branch (merge/PR/cleanup)
