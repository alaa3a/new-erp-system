# Zod Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all ad-hoc `if (!body.x)` validation with Zod schemas across 57 API routes.

**Architecture:** Create Zod schemas per entity in `src/lib/validators/`, a `validate()` helper that throws typed `ValidationError` with per-field errors (integrating with existing `handleApiError`), then update every POST/PUT route to call `validate(schema, await request.json())` instead of manual checks.

**Tech Stack:** Zod (new dependency), existing `ValidationError` + `handleApiError` in `src/lib/utils/errors.ts`, existing route pattern using `requireAuth()`.

**Standard API format:** `{ success: boolean, data?: T, error?: string, code?: string, fields?: Record<string, string> }` — already in use, Zod validation feeds `fields` on 400.

## Global Constraints

- `zod` must be added to `dependencies` in `package.json`
- All schemas live under `src/lib/validators/`
- `validate()` must throw `ValidationError` (not return a Response) to reuse existing error handling
- PUT schemas use `.partial()` — all fields optional since routes fallback to existing values
- Business rules (uniqueness, balance checks) stay in services/repos — Zod handles shape + type + format only
- Per-field messages use `z.string({ required_error: '...' }).min(1, '...')` pattern
- Money fields validated as non-negative integer cents

---

### Task 1: Infrastructure — zod install + validate.ts + common.ts + index.ts

**Files:**
- Create: `src/lib/validators/validate.ts`
- Create: `src/lib/validators/common.ts`
- Create: `src/lib/validators/index.ts`
- Modify: `package.json` (add zod dependency)

**Interfaces:**
- Consumes: `ValidationError` from `src/lib/utils/errors.ts`
- Produces: `validate<T>(schema: z.ZodSchema<T>, data: unknown): T` — throws `ValidationError` with per-field `fields` on failure
- Produces: Shared schemas — `idSchema`, `moneySchema`, `optionalString`, `dateStringSchema`, `paginationSchema`

- [ ] **Step 1: Install zod**

```bash
npm install zod
```

- [ ] **Step 2: Create `src/lib/validators/common.ts`**

```ts
import { z } from 'zod'

export const idSchema = z.coerce.number().int().positive('ID must be a positive integer')

export const moneySchema = z.number().int().min(0, 'Amount must be non-negative')

export const optionalString = z.string().optional().default('')

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format')

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
})

export const entityNameSchema = z.string({ required_error: 'Name is required' }).min(1, 'Name cannot be empty').max(200)

export const entityCodeSchema = z.string({ required_error: 'Code is required' }).min(1, 'Code cannot be empty').max(50)
```

- [ ] **Step 3: Create `src/lib/validators/validate.ts`**

```ts
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

- [ ] **Step 4: Create `src/lib/validators/index.ts`**

```ts
export { validate } from './validate'
export * from './common'
```

- [ ] **Step 5: Verify build**

```bash
npx next build 2>&1 | Select-String "Compiled successfully"
Expected: ✓ Compiled successfully in ...
```

---

### Task 2: Simple entity schemas — account, costCenter, partner, product, warehouse, taxCode, user, auth

**Files:**
- Create: `src/lib/validators/account.ts`
- Create: `src/lib/validators/costCenter.ts`
- Create: `src/lib/validators/partner.ts`
- Create: `src/lib/validators/product.ts`
- Create: `src/lib/validators/warehouse.ts`
- Create: `src/lib/validators/taxCode.ts`
- Create: `src/lib/validators/user.ts`
- Create: `src/lib/validators/auth.ts`
- Update: `src/lib/validators/index.ts` (re-export new schemas)
- Modify: `src/app/api/accounts/route.ts` (POST), `src/app/api/accounts/[id]/route.ts` (PUT)
- Modify: `src/app/api/cost-centers/route.ts` (POST), `src/app/api/cost-centers/[id]/route.ts` (PUT)
- Modify: `src/app/api/partners/route.ts` (POST), `src/app/api/partners/[id]/route.ts` (PUT)
- Modify: `src/app/api/products/route.ts` (POST), `src/app/api/products/[id]/route.ts` (PUT)
- Modify: `src/app/api/warehouses/route.ts` (POST), `src/app/api/warehouses/[id]/route.ts` (PUT)
- Modify: `src/app/api/tax-codes/route.ts` (POST), `src/app/api/tax-codes/[id]/route.ts` (PUT)
- Modify: `src/app/api/users/route.ts` (POST), `src/app/api/users/[id]/route.ts` (PUT)
- Modify: `src/app/api/auth/signin/route.ts` (POST)

**Interfaces:**
- Consumes: `validate()` from `src/lib/validators/validate.ts`, shared schemas from `common.ts`
- Produces: Per-entity Zod schemas exported from `src/lib/validators/index.ts`

- [ ] **Step 1: Create `account.ts`**

```ts
import { z } from 'zod'
import { entityCodeSchema, entityNameSchema, optionalString } from './common'

export const accountTypeEnum = z.enum(['asset', 'liability', 'equity', 'revenue', 'expense'])

export const createAccountSchema = z.object({
  code: entityCodeSchema,
  name: entityNameSchema,
  type: accountTypeEnum,
  parentId: z.number().int().positive().nullable().optional().default(null),
  description: optionalString,
})

export const updateAccountSchema = createAccountSchema.partial().extend({
  action: z.enum(['toggleActive', 'linkCostCenter']).optional(),
  isActive: z.boolean().optional(),
  cascade: z.boolean().optional(),
  costCenterId: z.number().int().positive().nullable().optional(),
})
```

- [ ] **Step 2: Create `costCenter.ts`**

```ts
import { z } from 'zod'
import { entityCodeSchema, entityNameSchema, optionalString } from './common'

export const createCostCenterSchema = z.object({
  code: entityCodeSchema,
  name: entityNameSchema,
  parentId: z.number().int().positive().nullable().optional().default(null),
  responsiblePerson: z.string().max(200).optional().default(''),
  description: optionalString,
})

export const updateCostCenterSchema = createCostCenterSchema.partial()
```

- [ ] **Step 3: Create `partner.ts`**

```ts
import { z } from 'zod'
import { entityNameSchema, optionalString } from './common'

export const partnerTypeEnum = z.enum(['customer', 'supplier', 'both'])

export const createPartnerSchema = z.object({
  name: entityNameSchema,
  type: partnerTypeEnum,
  email: z.string().email('Invalid email').optional().default(''),
  phone: z.string().max(50).optional().default(''),
  taxId: z.string().max(50).optional().default(''),
  address: optionalString,
  city: z.string().max(100).optional().default(''),
  country: z.string().max(100).optional().default(''),
  creditLimit: z.number().int().min(0).optional().default(0),
  paymentTermId: z.number().int().positive().nullable().optional().default(null),
})

export const updatePartnerSchema = createPartnerSchema.partial()
```

- [ ] **Step 4: Create `product.ts`**

```ts
import { z } from 'zod'
import { entityCodeSchema, entityNameSchema, optionalString } from './common'

export const createProductSchema = z.object({
  code: entityCodeSchema,
  name: entityNameSchema,
  description: optionalString,
  unit: z.string().max(50).optional().default(''),
  price: z.number().int().min(0, 'Price must be non-negative'),
  cost: z.number().int().min(0).optional().default(0),
  category: z.string().max(100).optional().default(''),
  taxCodeId: z.number().int().positive().nullable().optional().default(null),
  warehouseId: z.number().int().positive().nullable().optional().default(null),
  minStock: z.number().int().min(0).optional().default(0),
})

export const updateProductSchema = createProductSchema.partial()

export const stockAdjustmentSchema = z.object({
  productId: z.number().int().positive(),
  warehouseId: z.number().int().positive(),
  quantity: z.number().int(),
  reason: z.string().min(1, 'Reason is required').max(500),
})
```

- [ ] **Step 5: Create `warehouse.ts`**

```ts
import { z } from 'zod'
import { entityCodeSchema, entityNameSchema, optionalString } from './common'

export const createWarehouseSchema = z.object({
  code: entityCodeSchema,
  name: entityNameSchema,
  location: z.string().max(200).optional().default(''),
  description: optionalString,
})

export const updateWarehouseSchema = createWarehouseSchema.partial()
```

- [ ] **Step 6: Create `taxCode.ts`**

```ts
import { z } from 'zod'
import { entityNameSchema, optionalString } from './common'

export const createTaxCodeSchema = z.object({
  code: z.string({ required_error: 'Code is required' }).min(1).max(20),
  name: entityNameSchema,
  rate: z.number().min(0).max(100, 'Rate must be 0-100'),
  type: z.enum(['sales', 'purchase', 'both']).optional().default('both'),
  description: optionalString,
  isDefault: z.boolean().optional().default(false),
})

export const updateTaxCodeSchema = createTaxCodeSchema.partial()
```

- [ ] **Step 7: Create `user.ts`**

```ts
import { z } from 'zod'
import { entityNameSchema } from './common'

export const createUserSchema = z.object({
  name: entityNameSchema,
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['admin', 'user', 'viewer']).optional().default('user'),
  isActive: z.boolean().optional().default(true),
})

export const updateUserSchema = createUserSchema.partial().extend({
  currentPassword: z.string().optional(),
})
```

- [ ] **Step 8: Create `auth.ts`**

```ts
import { z } from 'zod'

export const signInSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
})
```

- [ ] **Step 9: Update `index.ts`**

Replace the content with re-exports of all schema files.

```ts
export { validate } from './validate'
export * from './common'
export * from './account'
export * from './costCenter'
export * from './partner'
export * from './product'
export * from './warehouse'
export * from './taxCode'
export * from './user'
export * from './auth'
```

- [ ] **Step 10: Update account POST route** — `src/app/api/accounts/route.ts`

Find the POST handler. After `const body = await request.json()`, replace the ad-hoc validation with:

```ts
import { validate, createAccountSchema } from '@/lib/validators'

// Inside POST handler, replace:
// if (!body.code || !body.name || !body.type) { throw new ValidationError(...) }
// With:
const body = validate(createAccountSchema, await request.json())
```

- [ ] **Step 11: Update account PUT route** — `src/app/api/accounts/[id]/route.ts`

Similar pattern — replace body destructuring with `validate(updateAccountSchema, await request.json())`.

- [ ] **Step 12-24: Update remaining routes** — same pattern for cost-centers, partners, products, warehouses, tax-codes, users, auth/signin

Pattern for each (`route.ts` POST):
```ts
// Before:
const body = await request.json()
if (!body.x) throw new ValidationError(...)

// After:
import { validate, someSchema } from '@/lib/validators'
const body = validate(someSchema, await request.json())
```

Pattern for each (`[id]/route.ts` PUT):
```ts
// Before:
const body = await request.json()
// ...ad-hoc checks

// After:
import { validate, updateSomeSchema } from '@/lib/validators'
const body = validate(updateSomeSchema, await request.json())
```

- [ ] **Step 25: Verify build**

```bash
npx next build 2>&1 | Select-String "Compiled successfully"
Expected: ✓ Compiled successfully in ...
```

---

### Task 3: Settings schemas — company, fiscalPeriod, paymentTerm, postingProfile, entryCategory, documentSequence

**Files:**
- Create: `src/lib/validators/settings.ts`
- Update: `src/lib/validators/index.ts` (add settings export)
- Modify: `src/app/api/company/route.ts` (POST, PUT)
- Modify: `src/app/api/fiscal-periods/route.ts` (POST), `src/app/api/fiscal-periods/[id]/route.ts` (PUT)
- Modify: `src/app/api/payment-terms/route.ts` (POST), `src/app/api/payment-terms/[id]/route.ts` (PUT)
- Modify: `src/app/api/posting-profiles/route.ts` (POST), `src/app/api/posting-profiles/[id]/route.ts` (PUT)
- Modify: `src/app/api/entry-categories/route.ts` (POST), `src/app/api/entry-categories/[id]/route.ts` (PUT)
- Modify: `src/app/api/document-sequences/route.ts` (POST), `src/app/api/document-sequences/[id]/route.ts` (PUT)

**Interfaces:**
- Consumes: `validate()` from `validate.ts`, shared schemas from `common.ts`
- Produces: Settings schemas exported from `settings.ts`

- [ ] **Step 1: Create `settings.ts`**

```ts
import { z } from 'zod'
import { entityNameSchema, optionalString, dateStringSchema } from './common'

export const companySchema = z.object({
  name: entityNameSchema,
  legalName: z.string().max(200).optional().default(''),
  taxId: z.string().max(50).optional().default(''),
  email: z.string().email().optional().default(''),
  phone: z.string().max(50).optional().default(''),
  address: optionalString,
  currency: z.string().length(3).optional().default('USD'),
  fiscalYearStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().default(''),
})

export const fiscalPeriodSchema = z.object({
  name: entityNameSchema,
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  isOpen: z.boolean().optional().default(true),
})

export const paymentTermSchema = z.object({
  name: entityNameSchema,
  dueDays: z.number().int().min(0, 'Due days must be non-negative'),
  discountDays: z.number().int().min(0).optional().default(0),
  discountPercent: z.number().min(0).max(100).optional().default(0),
})

export const postingProfileSchema = z.object({
  name: entityNameSchema,
  description: optionalString,
  rules: z.any().optional(),
})

export const entryCategorySchema = z.object({
  name: entityNameSchema,
  type: z.enum(['revenue', 'expense', 'asset', 'liability', 'equity']).optional().default('expense'),
  description: optionalString,
})

export const documentSequenceSchema = z.object({
  name: entityNameSchema,
  prefix: z.string().max(10).optional().default(''),
  nextNumber: z.number().int().min(1).optional().default(1),
  padding: z.number().int().min(0).max(10).optional().default(0),
})
```

- [ ] **Step 2: Update `index.ts`** — add `export * from './settings'`

- [ ] **Step 3-14: Update each settings route** — same `validate(schema, await request.json())` pattern as Task 2

- [ ] **Step 15: Verify build**

```bash
npx next build 2>&1 | Select-String "Compiled successfully"
Expected: ✓ Compiled successfully in ...
```

---

### Task 4: Complex nested schemas — invoice, entry, purchaseOrder

**Files:**
- Create: `src/lib/validators/invoice.ts`
- Create: `src/lib/validators/entry.ts`
- Create: `src/lib/validators/purchaseOrder.ts`
- Update: `src/lib/validators/index.ts` (add new exports)
- Modify: `src/app/api/invoices/route.ts` (POST), `src/app/api/invoices/[id]/route.ts` (PUT)
- Modify: `src/app/api/invoices/[id]/approve/route.ts` (POST), `src/app/api/invoices/[id]/post/route.ts` (POST)
- Modify: `src/app/api/invoices/[id]/link-payment/route.ts` (POST)
- Modify: `src/app/api/entries/route.ts` (POST), `src/app/api/entries/[id]/route.ts` (PUT, DELETE)
- Modify: `src/app/api/purchase-orders/route.ts` (POST), `src/app/api/purchase-orders/[id]/route.ts` (PUT)
- Modify: `src/app/api/purchase-orders/[id]/approve/route.ts` (POST), `src/app/api/purchase-orders/[id]/receive/route.ts` (POST)
- Modify: `src/app/api/purchase-orders/[id]/close/route.ts` (POST)

**Interfaces:**
- Consumes: `validate()` from `validate.ts`, shared schemas from `common.ts`
- Produces: Invoice, Entry, PurchaseOrder Zod schemas

- [ ] **Step 1: Create `invoice.ts`**

```ts
import { z } from 'zod'
import { moneySchema, optionalString, dateStringSchema } from './common'

const invoiceLineSchema = z.object({
  description: z.string().min(1, 'Line description is required').max(500),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unitPrice: moneySchema,
  taxRate: z.number().min(0).max(100).optional().default(0),
  accountCode: z.string().max(50).optional().default(''),
  warehouseId: z.number().int().positive().nullable().optional().default(null),
  productId: z.number().int().positive().nullable().optional().default(null),
})

export const invoiceTypeEnum = z.enum(['sales', 'purchase'])

export const createInvoiceSchema = z.object({
  type: invoiceTypeEnum,
  invoiceNumber: z.string().max(50).optional().default(''),
  invoiceDate: dateStringSchema,
  dueDate: dateStringSchema.optional(),
  businessPartnerId: z.number().int().positive('Partner is required'),
  partnerName: z.string().max(200).optional().default(''),
  partnerTaxId: z.string().max(50).optional().default(''),
  currency: z.string().length(3).optional().default('USD'),
  notes: optionalString,
  lines: z.array(invoiceLineSchema).min(1, 'At least one line is required'),
  costCenterId: z.number().int().positive().nullable().optional().default(null),
})

export const updateInvoiceSchema = createInvoiceSchema.partial()
```

- [ ] **Step 2: Create `entry.ts`**

```ts
import { z } from 'zod'
import { moneySchema, optionalString, dateStringSchema } from './common'

const entryLineSchema = z.object({
  accountCode: z.string().min(1, 'Account code is required'),
  debitAmount: moneySchema,
  creditAmount: moneySchema,
  description: z.string().max(500).optional().default(''),
  costCenterId: z.number().int().positive().nullable().optional().default(null),
})

export const createEntrySchema = z.object({
  entryDate: dateStringSchema,
  description: z.string().min(1, 'Description is required').max(500),
  reference: optionalString,
  lines: z.array(entryLineSchema).min(2, 'At least two lines are required for a balanced entry'),
  entryCategoryId: z.number().int().positive().nullable().optional().default(null),
})

export const updateEntrySchema = createEntrySchema.partial()
```

- [ ] **Step 3: Create `purchaseOrder.ts`**

```ts
import { z } from 'zod'
import { moneySchema, optionalString, dateStringSchema } from './common'

const poLineSchema = z.object({
  description: z.string().min(1, 'Line description is required').max(500),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unitPrice: moneySchema,
  taxRate: z.number().min(0).max(100).optional().default(0),
  accountCode: z.string().max(50).optional().default(''),
  productId: z.number().int().positive().nullable().optional().default(null),
  warehouseId: z.number().int().positive().nullable().optional().default(null),
})

export const createPurchaseOrderSchema = z.object({
  orderDate: dateStringSchema,
  expectedDate: dateStringSchema.optional(),
  businessPartnerId: z.number().int().positive('Partner is required'),
  partnerName: z.string().max(200).optional().default(''),
  notes: optionalString,
  lines: z.array(poLineSchema).min(1, 'At least one line is required'),
})

export const updatePurchaseOrderSchema = createPurchaseOrderSchema.partial()

export const receivePurchaseOrderSchema = z.object({
  receivedItems: z.array(z.object({
    lineIndex: z.number().int().min(0),
    quantity: z.number().int().min(1),
  })).min(1, 'At least one received item is required'),
})
```

- [ ] **Step 4: Update `index.ts`** — add `export * from './invoice'`, `export * from './entry'`, `export * from './purchaseOrder'`

- [ ] **Step 5-18: Update each route** — same `validate(schema, await request.json())` pattern

- [ ] **Step 19: Verify build**

```bash
npx next build 2>&1 | Select-String "Compiled successfully"
Expected: ✓ Compiled successfully in ...
```

---

### Task 5: Remaining routes — notifications, inventory, permissions, audit-log, reports

**Files:**
- Create: `src/lib/validators/reports.ts` (report filter schemas)
- Update: `src/lib/validators/index.ts` (add reports export)
- Modify: `src/app/api/notifications/[id]/read/route.ts` (POST)
- Modify: `src/app/api/notifications/read-all/route.ts` (POST)
- Modify: `src/app/api/notifications/route.ts` (POST)
- Modify: `src/app/api/inventory/stock-adjustments/route.ts` (POST)
- Modify: `src/app/api/inventory/movements/route.ts` (POST — if it has one)
- Modify: `src/app/api/permissions/route.ts` (POST)
- Modify: `src/app/api/audit-log/route.ts` (POST — if it has one)
- Modify: `src/app/api/reports/*/route.ts` (add filter query param validation)

**Interfaces:**
- Consumes: `validate()` from `validate.ts`

- [ ] **Step 1: Create `reports.ts`**

```ts
import { z } from 'zod'
import { dateStringSchema } from './common'

export const reportDateRangeSchema = z.object({
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  periodId: z.number().int().positive().optional(),
})

export const agingReportSchema = reportDateRangeSchema.extend({
  partnerId: z.number().int().positive().optional(),
  partnerType: z.enum(['customer', 'supplier', 'both']).optional().default('customer'),
})

export const ledgerReportSchema = z.object({
  accountCode: z.string().optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  costCenterId: z.number().int().positive().optional(),
})
```

- [ ] **Step 2: Update `index.ts`** — add `export * from './reports'`

- [ ] **Step 3-10: Update each remaining route**

For POST routes: `validate(schema, await request.json())`
For GET/filter routes: validate query params with `validate(schema, Object.fromEntries(url.searchParams))`

- [ ] **Step 11: Final build verification**

```bash
npx next build 2>&1 | Select-String "Compiled successfully"
Expected: ✓ Compiled successfully in ...
```
