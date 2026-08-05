# NEW ERP System Implementation Plan

> **Status:** Active development — see Phases Completed and Remaining Work below.

**Goal:** Create a full-featured ERP application with accounting, invoicing, inventory, and reporting modules using Next.js + React + Tailwind CSS.

**Architecture:** Modular monolith with clear separation between UI pages (src/app), data models (src/types), data access (src/lib/repositories), business logic (src/lib/services), API routes (src/app/api), and shared components (src/components). REST APIs handle all data mutations with transaction boundaries. SQLite provides local persistence via sql.js with a repository pattern for future database migration.

**Tech Stack:** Next.js 16+, TypeScript, Tailwind CSS v4, SQLite (sql.js), Zod for validation, lucide-react for icons.

## Status Summary

### Phases Completed
- **Phase 0:** Split 5 co-located repositories into dedicated files, fixed imports.
- **Phase 1:** Cost center `[id]` routes (GET/PUT/DELETE with validation, circular ref check).
- **Phase 2+3+6+7 (combined):** Standard API format on all route files, `requireAuth()` on POST/PUT/DELETE, Zod validation on all mutation routes, frontend fetch unwrapped to `json.data`.
- **Phase 4:** CoA system accounts locked, no global Add, "Add Sub" per row, action menu with Edit/Toggle/Link CC/Delete.
- **Phase 5:** All settings pages exist (single settings page with sub-sections for document-sequences, entry-categories, posting-profiles, tax-setup).
- **Phase 4 — Missing API Routes (COMPLETE):** 10 routes implemented (DELETE entries, entries/ledger, partners/aging, products/stock, invoices/entries, dashboard/summary, inventory-valuation report, tax-summary report, users/permissions, auth/reset-password).
- **CoA improvements:** Parent subtitle, linked CC column, clickable name to collapse/expand, "Add Sub" + dropdown action menu.
- **Cost center improvements:** Converted flat card grid → hierarchical tree table matching CoA layout; action menu with fixed positioning and viewport-aware flipping.
- **Phase 8 — Pagination (COMPLETE):** Server-side pagination on 5 main list pages (entries, invoices, partners, products, purchase-orders) with page size selection (10/20/50/100) and shared `<Pagination>` component.
- **Phase A — Aging Buckets (COMPLETE):** `aging_bucket` DB table with 5 default buckets (Current, 1-30, 31-60, 61-90, 90+), `AgingBucket` type, repository, `GET/PUT /api/settings/aging-buckets` API route, and editable tab in the settings page.

### Remaining Work
- **Settings sub-pages:** Standalone pages for company, payment-terms, fiscal-periods (currently no individual pages exist — settings is a single combined page).
- **Report pages:** inventory-valuation and tax-summary pages may be missing or incomplete.
- **Bloat refactoring:** Sales invoice page (~1600 lines), purchase invoice page (~1660 lines), entries page (~1044 lines) need component extraction.
- **Missing Libraries (Phase 9):** `src/lib/formatters/`, `src/hooks/`, `src/data/seed/` organization.
- **Aging buckets DB table** — needed for settings/aging-buckets page.
- **Report API routes:** inventory-movements report endpoint.
- **Testing:** Test suite setup and coverage.

## Global Constraints

- Next.js app with admin area in `src/app/(admin)` and auth pages in `src/app/(full-width-pages)/(auth)`
- TypeScript with path alias `@/*` → `./src/*`
- Tailwind CSS v4 for all styling
- SQLite via `src/lib/db.ts` (sql.js wrapper, better-sqlite3-compatible API)
- **REST API routes** (`/api/...`) for all data mutations — NOT server actions
- Soft-delete for master data records (`isActive = 0`); **accounts are the exception — hard-deleted once usage checks pass** (per user decision)
- Optimistic locking with `version` fields on all mutable records
- Transaction boundaries for multi-step operations (posting, settlements)
- All monetary values stored as integers (cents) to avoid floating-point errors
- UTF-8 encoding for all text fields
- Audit trail for all create/update/delete/post/cancel actions
- Standard API response format: `{ success: boolean, data?: T, error?: string }`
- Auth required on all POST/PUT/DELETE routes (session cookie-based)

---

## ERP Workflow Summary

1. **Master Data First:** Create partners, products, warehouses, accounts, tax codes, and posting profiles
2. **Invoice Creation:** Draft invoices with lines, partner info, warehouse assignment, and posting profile
3. **Preview & Validate:** Users preview generated journal entries and inventory effects before confirming
4. **Posting:** Posting an invoice within a transaction:
   - Creates accounting entries (debits/credits)
   - Updates warehouse stock for stock items (weighted average cost)
   - Records inventory movements
   - Generates VAT entries based on tax codes
5. **Settlement:** Payment entries linked to invoices update partner aging and invoice status
6. **Reporting:** Draw from journal entries, inventory movements, aging balances, and historical snapshots

### Invoice Settlement Rules

- An invoice transitions to `paid` status when: (a) a payment entry is linked to it, AND (b) the sum of linked payment entries equals or exceeds the invoice total
- Settlement is triggered automatically when posting a payment entry that references an invoice
- Manual "mark as paid" requires `invoice.approve` permission
- Partial payments keep invoice status as `partial_paid`
- Credit notes reduce the invoice balance; remaining balance determines final status

### Inventory Valuation Method

- **Weighted Average Cost (WAC)** is the default valuation method
- Each stock receipt recalculates the weighted average: `new_avg = (existing_value + receipt_value) / (existing_qty + receipt_qty)`
- Cost of Goods Sold (COGS) posts at current weighted average at time of sale
- Inventory account debits/credits are generated automatically during invoice posting
- Stock adjustments post to an `Inventory Adjustment` account (loss) or `Inventory Gain` account (gain)

### Transaction Boundaries

- **Invoice Posting:** Single transaction wrapping: validate → create entries → update stock → record movements → update invoice status. Rollback on any failure.
- **Payment Settlement:** Single transaction wrapping: validate → create payment entry → link to invoice → update invoice status → recalculate aging. Rollback on any failure.
- **Period Close:** Single transaction wrapping: validate no unposted documents → lock period → generate closing entries. Rollback on any failure.

---

## Core Modules

### 1. Accounting

- Chart of Accounts (hierarchical, parent/child)
- Cost Centers (hierarchical, parent/child)
- Journal Entries (entries with debit/credit lines)
- Partner Payment Aging (computed from open invoices/entries)
- General Ledger (aggregated from entries)
- Payment Settlement and Invoice Clearing
- Period Close and Year-End Closing

### 2. Invoicing

- Sales Invoices
- Purchase Invoices
- Credit Notes (linked to original invoice)
- Debit Notes (linked to original invoice)
- VAT-enabled transaction lines
- Posting profile driven entry generation
- Document sequencing (automatic invoice numbering)
- Approval workflow (configurable thresholds)

### 2b. Purchase Orders (Extended Procurement)

- Purchase Order creation and lifecycle (draft → approved → partially/fully received → closed)
- Goods Receipt workflow (receive stock items against PO lines)
- Three-way Matching (PO ordered qty vs Receipt received qty vs Invoice invoiced qty)
- Match Invoice to PO (link purchase invoices to POs for procurement matching)
- Unlink Invoice from PO (remove previously established match, reset invoiced quantities)
- Quick-action Match-to-PO / Unlink PO buttons in table actions columns
- Linked Invoices count display and filtering

### 3. Reporting

- General Ledger Report
- Trial Balance
- Income Statement (by period)
- Balance Sheet (as of date)
- Partner Payment Aging Report
- Inventory Valuation Report
- Inventory Movement Report
- Tax Summary Report (VAT collected vs. paid)
- Export to CSV/Excel

### 4. Master Data

- Business Partners (Customer/Vendor/Both)
- Products / Items (Stock items and Service items)
- Warehouses / Inventory Locations
- Chart of Accounts
- Cost Centers
- Tax Codes / Tax Groups
- Posting Profiles
- Payment Terms
- Entry Categories
- Company Settings
- Fiscal Year Configuration
- Currency (base currency for the company)

### 5. Inventory & Warehousing

- Warehouse locations
- Stock levels and reorder points
- Inventory valuation (weighted average cost)
- Transfer tracking between warehouses
- Per-warehouse stock quantities via `ProductWarehouseStock`
- Invoice line warehouse assignment for sales/purchase movements
- Service item support (no stock movement)
- Stock adjustment workflow
- Negative stock prevention (configurable)

### 6. Settings & Configuration

- Posting Profiles (account mappings for invoice types)
- Tax Setup (tax codes, groups, rates)
- Entry Categories (journal entry classification)
- Aging Bucket Settings (configurable aging ranges)
- System Settings (company profile, fiscal year, currency)
- Document Numbering Sequences

### 7. Authentication & Permissions

- Sign-in / Reset Password
- User Management
- Direct permission assignment per user (no roles)
- Permission support for pages and API actions
- Session handling with JWT or server sessions

### 8. Audit Trail & Notifications

- Change history for create/update/delete actions
- Audit records for invoice posting and inventory movements
- Admin alerts for critical updates and deletes
- Notification center for key events (configurable: in-app, email)

---

## Core Data Models

### BusinessPartner

```typescript
interface BusinessPartner {
  id: string;
  code: string;                    // Unique partner code (BP-001)
  name: string;
  type: 'customer' | 'vendor' | 'both';
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  taxRegistrationNumber: string;
  defaultVatCodeId: string | null;
  paymentTermId: string | null;
  creditLimit: number;             // In cents
  isActive: boolean;
  tags: string[];                  // For filtering/reporting
  createdAt: Date;
  updatedAt: Date;
  version: number;                 // Optimistic locking
}
```

### Account (Chart of Accounts)

```typescript
interface Account {
  id: string;
  code: string;                    // e.g., "1100" for Cash
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parentId: string | null;         // For hierarchical accounts
  isActive: boolean;
  isSystemAccount: boolean;        // Prevents deletion of required accounts
  description: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

### CostCenter

```typescript
interface CostCenter {
  id: string;
  code: string;                    // e.g., "CC-SALES"
  name: string;
  parentId: string | null;         // For hierarchical cost centers
  isActive: boolean;
  responsiblePerson: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

### Product

```typescript
interface Product {
  id: string;
  code: string;                    // SKU or item code
  name: string;
  description: string;
  itemType: 'stock' | 'service';  // Service items have no stock movement
  unitOfMeasure: string;           // e.g., "pcs", "kg", "hrs"
  salesPrice: number;              // In cents
  purchasePrice: number;           // In cents
  vatCodeId: string | null;        // Default tax code for sales
  purchaseVatCodeId: string | null; // Default tax code for purchases
  defaultWarehouseId: string | null;
  reorderPoint: number;            // Minimum stock level
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

### ProductWarehouseStock

```typescript
interface ProductWarehouseStock {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  averageCost: number;             // Weighted average cost in cents
  lastUpdated: Date;
  version: number;
}
```

### Warehouse

```typescript
interface Warehouse {
  id: string;
  code: string;                    // e.g., "WH-MAIN"
  name: string;
  address: string;
  manager: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

### Invoice

```typescript
interface Invoice {
  id: string;
  invoiceNumber: string;           // Auto-generated sequence
  type: 'sales' | 'purchase' | 'credit_note' | 'debit_note';
  status: 'draft' | 'posted' | 'partial_paid' | 'paid' | 'cancelled';
  businessPartnerId: string;
  postingProfileId: string;
  invoiceDate: Date;
  dueDate: Date;
  paymentTermId: string | null;
  currencyCode: string;            // ISO 4217 currency code
  exchangeRate: number;            // Rate to base currency
  subtotal: number;                // In cents, before VAT
  vatAmount: number;               // In cents
  totalAmount: number;             // In cents, including VAT
  paidAmount: number;              // In cents, sum of linked payments
  notes: string;
  referenceNumber: string;         // External reference (PO number, etc.)
  linkedInvoiceId: string | null;  // For credit/debit notes, links to original
  warehouseId: string | null;      // Default warehouse for stock items
  approvedBy: string | null;       // User ID if approval required
  approvedAt: Date | null;
  postedBy: string | null;         // User ID who posted
  postedAt: Date | null;
  createdBy: string;               // User ID
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

### InvoiceLine

```typescript
interface InvoiceLine {
  id: string;
  invoiceId: string;
  lineNumber: number;
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;               // In cents
  discountPercent: number;         // 0-100
  vatCodeId: string;               // Tax code for this line
  vatRate: number;                 // Snapshot of rate at time of posting
  vatAmount: number;               // Calculated VAT in cents
  lineTotal: number;               // In cents, after discount, before VAT
  warehouseId: string | null;      // For stock items, which warehouse
  costCenterId: string | null;     // Optional cost center assignment
  accountCode: string;             // Account code for posting
  createdAt: Date;
  updatedAt: Date;
}
```

### Entry (Journal Entry)

```typescript
interface Entry {
  id: string;
  entryNumber: string;             // Auto-generated sequence
  type: 'journal' | 'payment' | 'receipt' | 'adjustment' | 'closing';
  status: 'draft' | 'posted' | 'cancelled';
  entryDate: Date;
  description: string;
  referenceNumber: string;
  totalDebit: number;              // In cents
  totalCredit: number;             // In cents
  currencyCode: string;
  exchangeRate: number;
  linkedInvoiceId: string | null;  // For payment entries linked to invoices
  periodId: string;                // Fiscal period this entry belongs to
  costCenterId: string | null;
  postedBy: string | null;
  postedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

### EntryLine

```typescript
interface EntryLine {
  id: string;
  entryId: string;
  lineNumber: number;
  accountCode: string;
  description: string;
  debitAmount: number;             // In cents (0 if credit)
  creditAmount: number;            // In cents (0 if debit)
  businessPartnerId: string | null;
  costCenterId: string | null;
  vatCodeId: string | null;
  vatAmount: number;               // In cents
  createdAt: Date;
  updatedAt: Date;
}
```

### PostingProfile

```typescript
interface PostingProfile {
  id: string;
  name: string;                    // e.g., "Standard Sales", "Cash Purchase"
  invoiceType: 'sales' | 'purchase' | 'credit_note' | 'debit_note';
  accountsReceivableCode: string;  // AR account for sales
  accountsPayableCode: string;     // AP account for purchases
  vatOutputCode: string;           // VAT output account
  vatInputCode: string;            // VAT input account
  cashAccountCode: string;         // Cash/bank account
  discountAccountCode: string;     // Discount allowed/account
  inventoryAccountCode: string | null; // For stock items
  cogsAccountCode: string | null;  // Cost of goods sold
  adjustmentAccountCode: string | null; // Inventory adjustment
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

### TaxCode

```typescript
interface TaxCode {
  id: string;
  code: string;                    // e.g., "VAT15", "VAT0"
  name: string;
  rate: number;                    // Percentage (e.g., 15 for 15%)
  type: 'output' | 'input';       // VAT collected vs. VAT paid
  parentId: string | null;         // For tax groups
  accountCode: string;             // Account to post this tax
  isActive: boolean;
  isSystemCode: boolean;           // Prevents deletion of required codes
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

### PaymentTerm

```typescript
interface PaymentTerm {
  id: string;
  code: string;                    // e.g., "NET30"
  name: string;
  daysUntilDue: number;
  discountPercent: number;         // Early payment discount %
  discountDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

### EntryCategory

```typescript
interface EntryCategory {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

### InventoryMovement

```typescript
interface InventoryMovement {
  id: string;
  movementNumber: string;
  type: 'receipt' | 'issue' | 'transfer' | 'adjustment' | 'return';
  productId: string;
  warehouseId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  referenceType: 'invoice' | 'entry' | 'adjustment' | 'transfer';
  referenceId: string;
  referenceNumber: string;
  postedBy: string;
  postedAt: Date;
  createdAt: Date;
}
```

### FiscalPeriod

```typescript
interface FiscalPeriod {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: 'open' | 'closed' | 'locked';
  closedBy: string | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

### Company

```typescript
interface Company {
  id: string;
  name: string;
  registrationNumber: string;
  taxRegistrationNumber: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  baseCurrencyCode: string;
  fiscalYearStartMonth: number;
  logoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

### User

```typescript
interface User {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  permissionIds: string[];
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

### Permission

```typescript
interface Permission {
  id: string;
  key: string;
  module: string;
  action: string;
  description: string;
}
```

### AuditLog

```typescript
interface AuditLog {
  id: string;
  userId: string;
  action: 'create' | 'update' | 'delete' | 'post' | 'cancel';
  entityType: string;
  entityId: string;
  entityNumber: string;
  changes: Record<string, { from: any; to: any }>;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
}
```

### Notification

```typescript
interface Notification {
  id: string;
  userId: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: Date;
}
```

### DocumentSequence

```typescript
interface DocumentSequence {
  id: string;
  documentType: 'invoice' | 'entry' | 'movement';
  prefix: string;
  nextNumber: number;
  padding: number;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

---

## API Endpoints

### Authentication
- `POST /api/auth/signin` - Sign in
- `POST /api/auth/signout` - Sign out
- `POST /api/auth/reset-password` - Reset password
- `GET /api/auth/me` - Current user

### Business Partners
- `GET /api/partners` - List (search, filter, paginate)
- `GET /api/partners/:id` - Get by ID
- `POST /api/partners` - Create
- `PUT /api/partners/:id` - Update
- `DELETE /api/partners/:id` - Soft delete
- `GET /api/partners/:id/aging` - Aging summary

### Products
- `GET /api/products` - List
- `GET /api/products/:id` - Get by ID
- `POST /api/products` - Create
- `PUT /api/products/:id` - Update
- `DELETE /api/products/:id` - Soft delete
- `GET /api/products/:id/stock` - Stock levels

### Warehouses
- `GET /api/warehouses` - List
- `GET /api/warehouses/:id` - Get by ID
- `POST /api/warehouses` - Create
- `PUT /api/warehouses/:id` - Update
- `DELETE /api/warehouses/:id` - Soft delete

### Accounts (Chart of Accounts)
- `GET /api/accounts` - List (hierarchical)
- `GET /api/accounts/:id` - Get by ID
- `POST /api/accounts` - Create account
- `PUT /api/accounts/:id` - Update account
- `DELETE /api/accounts/:id` - Hard delete (blocked for system accounts, accounts with children, accounts used in entries/invoice lines/posting profiles)

### Cost Centers
- `GET /api/cost-centers` - List (hierarchical)
- `GET /api/cost-centers/:id` - Get by ID
- `POST /api/cost-centers` - Create
- `PUT /api/cost-centers/:id` - Update
- `DELETE /api/cost-centers/:id` - Hard delete (blocked for cost centers with children, used in entries, invoice lines, linked to accounts, or used in purchase order lines)

### Invoices
- `GET /api/invoices` - List
- `GET /api/invoices/:id` - Get with lines
- `POST /api/invoices` - Create (draft)
- `PUT /api/invoices/:id` - Update (draft only)
- `DELETE /api/invoices/:id` - Cancel (draft only)
- `POST /api/invoices/:id/preview` - Preview posting
- `POST /api/invoices/:id/post` - Post invoice
- `POST /api/invoices/:id/approve` - Approve
- `GET /api/invoices/:id/entries` - Get generated entries
- `POST /api/invoices/:id/link-payment` - Link payment

### Entries
- `GET /api/entries` - List
- `GET /api/entries/:id` - Get with lines
- `POST /api/entries` - Create (draft)
- `PUT /api/entries/:id` - Update (draft only)
- `DELETE /api/entries/:id` - Cancel (draft only)
- `POST /api/entries/:id/post` - Post
- `GET /api/entries/ledger` - General ledger

### Tax Codes, Posting Profiles, Payment Terms, Entry Categories
- Standard CRUD for each (GET list, GET by id, POST, PUT, DELETE)

### Reporting
- `GET /api/reports/trial-balance` - Trial balance
- `GET /api/reports/income-statement` - Income statement
- `GET /api/reports/balance-sheet` - Balance sheet
- `GET /api/reports/aging` - Partner aging
- `GET /api/reports/inventory-valuation` - Inventory valuation
- `GET /api/reports/inventory-movements` - Movements
- `GET /api/reports/tax-summary` - VAT summary
- `GET /api/reports/export/:reportType` - Export CSV/Excel

### Settings
- `GET/PUT /api/settings/company` - Company settings
- `GET/POST /api/settings/fiscal-periods` - Fiscal periods
- `PUT /api/settings/fiscal-periods/:id` - Update period
- `POST /api/settings/fiscal-periods/:id/close` - Close period
- `GET/PUT /api/settings/aging-buckets` - Aging config
- `GET/PUT /api/settings/sequences` - Document sequences

### Users & Permissions
- `GET /api/users` - List users
- `GET /api/users/:id` - Get user
- `POST /api/users` - Create
- `PUT /api/users/:id` - Update
- `DELETE /api/users/:id` - Soft delete
- `PUT /api/users/:id/permissions` - Update permissions
- `GET /api/permissions` - List all permissions

### Notifications
- `GET /api/notifications` - List
- `PUT /api/notifications/:id/read` - Mark read
- `PUT /api/notifications/read-all` - Mark all read

### Audit Log
- `GET /api/audit-log` - List (filter, paginate)

### Dashboard
- `GET /api/dashboard/summary` - Dashboard metrics

---

## Folder Structure

```
src/
├── app/
│   ├── (admin)/
│   │   ├── layout.tsx                 # Admin shell with sidebar/header
│   │   ├── page.tsx                   # Dashboard
│   │   ├── accounting/
│   │   │   ├── chart-of-accounts/
│   │   │   │   └── page.tsx
│   │   │   ├── cost-centers/
│   │   │   │   └── page.tsx
│   │   │   └── entries/
│   │   │       └── page.tsx
│   │   ├── business-partners/
│   │   │   └── page.tsx
│   │   ├── products/
│   │   │   └── page.tsx
│   │   ├── inventory/
│   │   │   ├── warehouses/
│   │   │   │   └── page.tsx
│   │   │   ├── stock-adjustments/
│   │   │   │   └── page.tsx
│   │   │   └── movements/
│   │   │       └── page.tsx
│   │   ├── invoice/
│   │   │   ├── sales/
│   │   │   │   └── page.tsx
│   │   │   ├── purchase/
│   │   │   │   └── page.tsx
│   │   │   ├── credit-note/
│   │   │   │   └── page.tsx
│   │   │   └── debit-note/
│   │   │       └── page.tsx
│   │   ├── reports/
│   │   │   ├── general-ledger/
│   │   │   │   └── page.tsx
│   │   │   ├── trial-balance/
│   │   │   │   └── page.tsx
│   │   │   ├── income-statement/
│   │   │   │   └── page.tsx
│   │   │   ├── balance-sheet/
│   │   │   │   └── page.tsx
│   │   │   ├── partner-aging/
│   │   │   │   └── page.tsx
│   │   │   ├── inventory-valuation/
│   │   │   │   └── page.tsx
│   │   │   └── tax-summary/
│   │   │       └── page.tsx
│   │   └── settings/
│   │       ├── company/
│   │       │   └── page.tsx
│   │       ├── posting-profiles/
│   │       │   └── page.tsx
│   │       ├── tax-setup/
│   │       │   └── page.tsx
│   │       ├── entry-categories/
│   │       │   └── page.tsx
│   │       ├── payment-terms/
│   │       │   └── page.tsx
│   │       ├── fiscal-periods/
│   │       │   └── page.tsx
│   │       ├── aging-buckets/
│   │       │   └── page.tsx
│   │       ├── document-sequences/
│   │       │   └── page.tsx
│   │       └── users/
│   │           └── page.tsx
│   ├── (full-width-pages)/
│   │   └── (auth)/
│   │       ├── signin/
│   │       │   └── page.tsx
│   │       └── reset-password/
│   │           └── page.tsx
│   └── api/
│       ├── auth/
│       ├── partners/
│       ├── products/
│       ├── warehouses/
│       ├── accounts/
│       ├── cost-centers/
│       ├── invoices/
│       ├── entries/
│       ├── tax-codes/
│       ├── posting-profiles/
│       ├── payment-terms/
│       ├── entry-categories/
│       ├── reports/
│       ├── settings/
│       ├── users/
│       ├── permissions/
│       ├── notifications/
│       ├── audit-log/
│       └── dashboard/
├── components/
│   ├── common/
│   │   ├── PageHeader.tsx
│   │   ├── CRUDPageLayout.tsx
│   │   ├── SearchFilter.tsx
│   │   ├── Pagination.tsx
│   │   └── StatusBadge.tsx
│   ├── form/
│   │   ├── TextField.tsx
│   │   ├── SelectField.tsx
│   │   ├── DateField.tsx
│   │   ├── NumberField.tsx
│   │   ├── CurrencyField.tsx
│   │   ├── CheckboxField.tsx
│   │   └── FormValidation.tsx
│   ├── tables/
│   │   ├── DataTable.tsx
│   │   ├── HierarchicalTable.tsx
│   │   └── InlineEditableRow.tsx
│   ├── modals/
│   │   ├── ConfirmModal.tsx
│   │   ├── FormModal.tsx
│   │   └── PreviewModal.tsx
│   ├── invoices/
│   │   ├── InvoiceForm.tsx
│   │   ├── InvoiceLines.tsx
│   │   ├── InvoicePreview.tsx
│   │   └── PostingPreview.tsx
│   ├── entries/
│   │   ├── EntryForm.tsx
│   │   ├── EntryLines.tsx
│   │   └── LedgerView.tsx
│   ├── dashboard/
│   │   ├── MetricCard.tsx
│   │   ├── OverdueReceivables.tsx
│   │   ├── OverduePayables.tsx
│   │   └── OpenInvoices.tsx
│   ├── header/
│   │   ├── AppHeader.tsx
│   │   ├── NotificationBell.tsx
│   │   └── UserMenu.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Modal.tsx
│       ├── Table.tsx
│       ├── Card.tsx
│       ├── Badge.tsx
│       ├── Tabs.tsx
│       └── Tooltip.tsx
├── context/
│   ├── AuthContext.tsx
│   ├── SidebarContext.tsx
│   └── ThemeContext.tsx
├── lib/
│   ├── db.ts                        # Database connection and setup
│   ├── repositories/
│   │   ├── partnerRepository.ts
│   │   ├── productRepository.ts
│   │   ├── warehouseRepository.ts
│   │   ├── accountRepository.ts
│   │   ├── costCenterRepository.ts
│   │   ├── invoiceRepository.ts
│   │   ├── entryRepository.ts
│   │   ├── taxCodeRepository.ts
│   │   ├── postingProfileRepository.ts
│   │   ├── paymentTermRepository.ts
│   │   ├── entryCategoryRepository.ts
│   │   ├── inventoryRepository.ts
│   │   ├── fiscalPeriodRepository.ts
│   │   ├── companyRepository.ts
│   │   ├── userRepository.ts
│   │   ├── permissionRepository.ts
│   │   ├── auditLogRepository.ts
│   │   ├── notificationRepository.ts
│   │   └── sequenceRepository.ts
│   ├── services/
│   │   ├── invoiceService.ts
│   │   ├── entryService.ts
│   │   ├── inventoryService.ts
│   │   ├── agingService.ts
│   │   ├── reportingService.ts
│   │   ├── auditService.ts
│   │   ├── notificationService.ts
│   │   └── sequenceService.ts
│   ├── validators/
│   │   ├── invoiceValidator.ts
│   │   ├── entryValidator.ts
│   │   ├── partnerValidator.ts
│   │   └── commonValidator.ts
│   ├── formatters/
│   │   ├── currencyFormatter.ts
│   │   ├── dateFormatter.ts
│   │   └── numberFormatter.ts
│   ├── auth/
│   │   ├── session.ts
│   │   ├── permissions.ts
│   │   └── password.ts
│   └── utils/
│       ├── idGenerator.ts
│       └── errors.ts
├── types/
│   ├── index.ts
│   ├── businessPartner.ts
│   ├── account.ts
│   ├── costCenter.ts
│   ├── product.ts
│   ├── warehouse.ts
│   ├── invoice.ts
│   ├── entry.ts
│   ├── taxCode.ts
│   ├── postingProfile.ts
│   ├── paymentTerm.ts
│   ├── entryCategory.ts
│   ├── inventory.ts
│   ├── fiscalPeriod.ts
│   ├── company.ts
│   ├── user.ts
│   ├── permission.ts
│   ├── auditLog.ts
│   ├── notification.ts
│   ├── documentSequence.ts
│   └── reports.ts
├── hooks/
│   ├── useAuth.ts
│   ├── usePartners.ts
│   ├── useProducts.ts
│   ├── useInvoices.ts
│   ├── useEntries.ts
│   └── useReports.ts
└── data/
    └── seed/
        ├── accounts.ts
        ├── taxCodes.ts
        ├── postingProfiles.ts
        ├── paymentTerms.ts
        ├── entryCategories.ts
        └── users.ts
```

---

## Design Principles

- Keep the admin shell reusable and responsive
- Use shared UI components for buttons, tables, forms, and modals
- Separate data models from presentation
- Build each ERP module as a clear CRUD flow
- Add strong navigation and status feedback in each page
- Provide strong search and filter support for partners, invoices, entries, and reports
- Include settings for company profile, fiscal year, currency, and posting defaults
- Add dashboard summary cards for overdue receivables, payables, and open invoices
- Validate inputs early and show clear error/success feedback
- Apply VAT at the transaction/invoice/entry level, with partner defaults only as guidance
- Use soft-delete for all master data to preserve referential integrity
- Implement optimistic locking to prevent concurrent modification conflicts
- Wrap multi-step operations in transactions to ensure data consistency

## UI/UX Approach

- Use a clear admin layout with a fixed sidebar, top header, and contextual breadcrumbs
- Design dashboard cards for key metrics and quick actions (Create Invoice, New Entry, Add Partner)
- Keep tables scannable with sticky headers, compact rows, status chips, and inline row actions
- Use sectioned forms for invoices and entries, with inline validation and friendly error messages
- Provide contextual help and tooltips for tax, posting profiles, and payment types
- Show status badges and activity history on important records
- Make mobile/tablet layouts responsive by collapsing the sidebar and stacking filters above tables
- Show loading skeletons during data fetches
- Display optimistic updates for mutations with rollback on error

---

## Milestones

### Milestone 1 — Foundation & Database ✅
**Goal:** Establish the project structure, database connection, and core utilities.
**Deliverables:** Working Next.js app with SQLite database, seed data utility, shared UI components.

### Milestone 2 — Authentication & Users ✅
**Goal:** Implement sign-in, session management, and user management with direct permissions.
**Deliverables:** Working sign-in flow, protected admin pages, user CRUD, permission assignment.

### Milestone 3 — Permissions & Audit Trail ✅
**Goal:** Add fine-grained permissions and audit logging.
**Deliverables:** Permission checks on pages and APIs, audit log for all mutations, notification system.

### Milestone 4 — Master Data: Chart of Accounts & Cost Centers ✅
**Goal:** Build hierarchical chart of accounts and cost centers with full CRUD.
**Deliverables:** Working accounts and cost centers pages, tree-table components, delete protections.

### Milestone 5 — Master Data: Partners, Products, Warehouses ✅
**Goal:** Build business partners, products, and warehouses with search/filter.
**Deliverables:** Partner CRUD (customer/vendor/both), product CRUD (stock/service), warehouse CRUD.

### Milestone 6 — Settings: Tax, Posting Profiles, Payment Terms ✅
**Goal:** Build tax setup, posting profiles, payment terms, and entry categories.
**Deliverables:** Tax code hierarchy, posting profile configuration, payment terms, entry categories.

### Milestone 7 — Invoicing: Sales & Purchase ✅
**Goal:** Build sales and purchase invoice creation with posting preview.
**Deliverables:** Invoice form with lines, VAT calculation, posting preview, draft/posted/cancelled workflows.

### Milestone 8 — Accounting: Entries & Posting ✅
**Goal:** Build journal entries, payment entries, and invoice posting with transaction boundaries.
**Deliverables:** Entry form, payment linking, invoice posting with stock updates, weighted average cost calculation.

### Milestone 9 — Inventory & Stock Management ✅
**Goal:** Build inventory movements, stock adjustments, and warehouse transfers.
**Deliverables:** Stock level tracking, inventory movements, stock adjustments, negative stock prevention.

### Milestone 10 — Credit Notes, Debit Notes & Returns ✅
**Goal:** Build credit/debit note workflows with invoice linking and reversal logic.
**Deliverables:** Credit note creation linked to original invoice, debit notes, return processing with stock updates.

### Milestone 11 — Reporting ✅
**Goal:** Build all financial and inventory reports with export.
**Deliverables:** Trial balance, income statement, balance sheet, aging report, inventory valuation, tax summary, CSV/Excel export.

### Milestone 12 — Dashboard, Period Close & Polish 🟡
**Goal:** Build dashboard metrics, fiscal period management, and final polish.
**Deliverables:** Dashboard metrics API exists, fiscal period routes exist. Period close, year-end closing, responsive design, loading states, and error handling polish remain.

---

## Self-Review Checklist

- [x] All data models defined with fields and types
- [x] All API endpoints enumerated
- [x] Folder structure matches module definitions
- [x] Persistence layer placed before data-consuming milestones
- [x] Transaction boundaries defined for multi-step operations
- [x] Invoice settlement rules clarified (manual vs. automatic)
- [x] Inventory valuation method defined (weighted average cost)
- [x] Naming inconsistencies resolved (Entry, Aging, Products)
- [x] Missing models added (User, CostCenter, TaxCode, AuditLog, Notification, etc.)
- [x] Credit/debit note reversal mechanics added
- [x] Period-close workflow added
- [x] Settings folder reorganized
- [x] Products page added to folder structure
- [x] Aging report consolidated to single page
- [x] Soft-delete policy defined
- [x] Optimistic locking defined
- [x] Document sequencing defined
- [x] Approval workflow mentioned for invoices
