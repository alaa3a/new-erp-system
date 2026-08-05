# Zod Validation — Design Spec

## Problem

All 57 API routes use ad-hoc `if (!body.x)` validation — inconsistent, missing type/format checks, no per-field error messages. Rated **HIGH severity** in UPGRADE_PLAN.md.

## Solution

Install `zod` and create entity schemas + a `validate()` middleware that integrates with the existing `handleApiError` + `ValidationError` infrastructure.

## Architecture

```
src/lib/validators/
├── index.ts         — re-exports all schemas + validate()
├── validate.ts      — validate(schema, data) helper
├── common.ts        — shared: id, date, money (cents), optionalString, pagination
├── account.ts       — Account POST/PUT schemas
├── costCenter.ts    — CostCenter POST/PUT schemas
├── invoice.ts       — Invoice + InvoiceLine POST/PUT schemas
├── entry.ts         — Entry + EntryLine schemas
├── partner.ts       — Partner POST/PUT schemas
├── product.ts       — Product + StockAdjustment schemas
├── purchaseOrder.ts — PurchaseOrder + POLine schemas
├── taxCode.ts       — TaxCode POST/PUT schemas
├── warehouse.ts     — Warehouse POST/PUT schemas
├── user.ts          — User POST/PUT schemas
├── settings.ts      — Company, FiscalPeriod, PaymentTerm, PostingProfile, EntryCategory, DocumentSequence schemas
├── auth.ts          — Sign-in schema
└── reports.ts       — Report filter/params schemas
```

## Key Pattern

```ts
// validate.ts
import { z } from 'zod'
import { ValidationError } from '@/lib/utils/errors'

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const fields: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const path = issue.path.join('.')
      if (!fields[path]) fields[path] = issue.message
    }
    throw new ValidationError('Validation failed', fields)
  }
  return result.data
}
```

Integrates perfectly with existing `handleApiError()` — it already catches `ValidationError` and returns `{ success: false, error, code, fields }` with 400 status.

## Per-route usage

```ts
// Before (ad-hoc):
const body = await request.json()
if (!body.code || !body.name) throw new ValidationError('Code and name required')

// After (Zod):
const body = validate(accountSchema, await request.json())
// body is typed: { code: string, name: string, type: AccountType, ... }
```

## Schema design principles

1. **POST schemas** — all required fields, full validation
2. **PUT schemas** — same fields but partial (`.partial()`) or with fallbacks, since PUT often sends only changed fields
3. **IDs, dates, money** — use common.ts shared schemas (e.g., `moneySchema` validates non-negative integer cents)
4. **Per-field messages** — use `z.string({ required_error: 'Name is required' }).min(1, 'Name cannot be empty')`
5. **Business rules** stay in services/repos — Zod handles shape+type validation only

## Implementation order (batches)

1. Install zod, create `common.ts` + `middleware.ts` + `index.ts`
2. **Batch A** — 8 core entity schemas: account, costCenter, partner, product, warehouse, taxCode, user, auth (add validation to their POST/PUT routes)
3. **Batch B** — 6 settings schemas: company, fiscalPeriod, paymentTerm, postingProfile, entryCategory, documentSequence (add validation to their POST/PUT routes)
4. **Batch C** — 3 complex schemas: invoice, entry, purchaseOrder (add validation to their POST/PUT routes — these have nested line arrays)
5. **Batch D** — remaining routes (reports filters, notifications, inventory movements, permissions, audit-log)

## Routes with no POST/PUT (read-only — no validation needed)

- `GET /api/accounts/[id]`, `GET /api/cost-centers/[id]`, `GET /api/invoices/[id]`, etc.
- All `GET /api/reports/*` routes
- `POST /api/invoices/[id]/preview` (preview is server-computed, no user data to validate)
- `POST /api/entries/[id]/post`, `POST /api/invoices/[id]/approve`, `POST /api/invoices/[id]/post`, `POST /api/invoices/[id]/link-payment` (action endpoints — validate via params not body)
