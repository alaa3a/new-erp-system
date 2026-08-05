# NEW ERP System — Full Implementation Plan v2

> **For agentic workers:** This plan covers all modules end-to-end. Work through milestones sequentially. Each milestone produces a working, testable deliverable.

**Goal:** Full-featured ERP application with accounting, invoicing, inventory, and reporting modules using Next.js + React + Tailwind CSS.

**Architecture:** Modular monolith — UI pages (`src/app`), data models (`src/types`), data access (`src/lib/repositories`), business logic (`src/lib/services`), API routes (`src/app/api`), shared components (`src/components`). REST APIs for all data mutations. SQLite (sql.js) for local persistence with repository pattern for future migration.

**Tech Stack:** Next.js 16+, TypeScript, Tailwind CSS, SQLite (sql.js), Zod for validation, lucide-react for icons.

---

## Global Constraints

- Next.js app with admin area in `src/app/(admin)` and auth pages in `src/app/(full-width-pages)/(auth)`
- TypeScript with path alias `@/*` → `./src/*`
- Tailwind CSS for all styling (v4)
- SQLite via `src/lib/db.ts` (sql.js wrapper, better-sqlite3-compatible API)
- All data mutations go through **REST API routes** (`/api/...`) — NOT server actions
- Soft-delete for all master data (`isActive = 0` or `status = 'deleted'`)
- Optimistic locking with `version` fields on all mutable records
- Transaction boundaries for multi-step operations (posting, settlements)
- All monetary values stored as **integers (cents)** — never floats
- UTF-8 encoding for all text fields
- Audit trail for all create/update/delete/post/cancel actions

---

## 1. Architecture & Request Flow

```
Browser Page
    │
    ├── GET /api/...  ──►  Route Handler  ──►  Repository  ──►  DB
    │
    ├── POST /api/... ──►  Route Handler  ──►  Service  ──►  Repository(s) ──►  DB
    │                           │                            │
    │                     Validation (Zod)              Transaction scope
    │                           │                            │
    │                     Permission check               Rollback on error
    │
    └── Response: { success: boolean, data?: T, error?: string, details?: any }
```

### API Response Format (ALL endpoints)

```typescript
// Success
{ success: true, data: T }

// Error
{ success: false, error: "Human-readable message", details?: any }

// List with pagination
{ success: true, data: T[], total: number, page: number, pageSize: number }
```

### Error Categories

| Error Type | HTTP Status | Trigger |
|------------|-------------|---------|
| ValidationError | 400 | Zod schema failure |
| NotFoundError | 404 | Entity not found |
| BusinessRuleError | 422 | Business logic violation |
| PermissionError | 403 | User lacks required permission |
| ConflictError | 409 | Version mismatch (optimistic locking) |
| AuthError | 401 | Not authenticated |
| InternalError | 500 | Unexpected server error |

---

## 2. Business Rules — Chart of Accounts ⭐

### 2.1 The 5 Main Accounts (SYSTEM ACCOUNTS)

Created by seed data. **NOT editable** and **NOT deletable**:

| Code | Name | Type |
|------|------|------|
| 1000 | Assets | asset |
| 2000 | Liabilities | liability |
| 3000 | Equity | equity |
| 4000 | Revenue | revenue |
| 5000 | Expenses | expense |

- `isSystemAccount = true` — hard-locked
- Edit button **hidden** in the UI
- Delete button shows warning: "Cannot delete a system account"
- They serve as root parents for each account type

### 2.2 Adding Accounts (NO Global "Add" Button)

- **NO** "Add Account" button in the page header
- Each account row has an **"Add Sub"** button
- Clicking "Add Sub" opens an **inline form** directly below that row (NOT a modal)
- The form auto-inherits the parent's `type` and `parentId`
- The parent dropdown is NOT shown (auto-set to the parent clicked)
- Inline form fields: Code, Name, Description (type is inherited)
- Save/Cancel buttons are inline

### 2.3 Editing Accounts

- System accounts (5 main) **cannot be edited** — edit button hidden
- Regular accounts:
  - **Code**: editable only if no transactions exist
  - **Name**: always editable
  - **Type**: editable only if no transactions AND no children exist
  - **Parent**: editable freely (but cannot set to self or descendant)
  - **Description**: always editable
- Editing uses **inline form** (replaces row content), NOT a modal

### 2.4 Deleting Accounts

Delete is BLOCKED if ANY:
1. System account → "Cannot delete a system account"
2. Has children → "Remove all child accounts first"
3. Used in journal entries → "Account has posted transactions"
4. Referenced in invoice lines → "Account is referenced in invoices"
5. Used in posting profile → "Account is used in posting profiles"

The confirmation dialog shows the **SPECIFIC reason**.

When none of the conditions apply, the account is **permanently deleted** (hard delete, not soft delete) — the row is removed from the database entirely.

### 2.5 Hierarchy Rules

- Child account type must match parent type
- Cannot create circular reference (A → B → C → A)
- Changing parent with children is blocked

---

## 3. Core Modules

| Module | Sub-Modules |
|--------|-------------|
| Accounting | Chart of Accounts (hierarchical), Cost Centers (hierarchical), Journal Entries, Partner Payment Aging, General Ledger, Settlement, Period Close |
| Invoicing | Sales Invoices, Purchase Invoices, Credit Notes, Debit Notes, VAT, Posting Profiles, Document Sequencing, Approval Workflow, Purchase Orders, Three-Way Matching |
| Reporting | General Ledger, Trial Balance, Income Statement, Balance Sheet, Partner Aging, Inventory Valuation, Inventory Movements, Tax Summary, CSV/Excel Export |
| Master Data | Partners (Customer/Vendor/Both), Products (Stock/Service), Warehouses, Chart of Accounts, Cost Centers, Tax Codes, Posting Profiles, Payment Terms, Entry Categories, Company, Fiscal Year, Currency |
| Inventory | Warehouse Locations, Stock Levels, Reorder Points, WAC Valuation, Transfers, Per-Warehouse Stock, Service Items, Stock Adjustment, Negative Stock Prevention |
| Settings | Posting Profiles, Tax Setup, Entry Categories, Aging Buckets, Company Profile, Fiscal Year, Document Sequences |
| Auth | Sign-in, Reset Password, User Management, Direct Permissions (no roles), Session Handling |
| Audit | Change History, Audit Records, Admin Alerts, Notification Center |

---

## 4. API Endpoints Summary

| Module | Endpoints |
|--------|-----------|
| Auth | `POST /api/auth/signin`, `POST /api/auth/signout`, `POST /api/auth/reset-password`, `GET /api/auth/me` |
| Partners | `GET /api/partners`, `POST /api/partners`, `GET /api/partners/[id]`, `PUT /api/partners/[id]`, `DELETE /api/partners/[id]`, `GET /api/partners/[id]/aging` |
| Products | `GET /api/products`, `POST /api/products`, `GET /api/products/[id]`, `PUT /api/products/[id]`, `DELETE /api/products/[id]`, `GET /api/products/[id]/stock` |
| Warehouses | `GET /api/warehouses`, `POST /api/warehouses`, `GET /api/warehouses/[id]`, `PUT /api/warehouses/[id]`, `DELETE /api/warehouses/[id]` |
| Accounts | `GET /api/accounts`, `POST /api/accounts`, `GET /api/accounts/[id]`, `PUT /api/accounts/[id]`, `DELETE /api/accounts/[id]` |
| Cost Centers | `GET /api/cost-centers`, `POST /api/cost-centers`, `GET /api/cost-centers/[id]`, `PUT /api/cost-centers/[id]`, `DELETE /api/cost-centers/[id]` |
| Invoices | `GET /api/invoices`, `POST /api/invoices`, `GET /api/invoices/[id]`, `PUT /api/invoices/[id]`, `DELETE /api/invoices/[id]`, `POST /api/invoices/[id]/preview`, `POST /api/invoices/[id]/post`, `POST /api/invoices/[id]/approve`, `GET /api/invoices/[id]/entries`, `POST /api/invoices/[id]/link-payment` |
| Entries | `GET /api/entries`, `POST /api/entries`, `GET /api/entries/[id]`, `PUT /api/entries/[id]`, `DELETE /api/entries/[id]`, `POST /api/entries/[id]/post`, `GET /api/entries/ledger` |
| Tax Codes | `GET /api/tax-codes`, `POST /api/tax-codes`, `GET /api/tax-codes/[id]`, `PUT /api/tax-codes/[id]`, `DELETE /api/tax-codes/[id]` |
| Posting Profiles | `GET /api/posting-profiles`, `POST /api/posting-profiles`, `GET /api/posting-profiles/[id]`, `PUT /api/posting-profiles/[id]`, `DELETE /api/posting-profiles/[id]` |
| Payment Terms | `GET /api/payment-terms`, `POST /api/payment-terms`, `GET /api/payment-terms/[id]`, `PUT /api/payment-terms/[id]`, `DELETE /api/payment-terms/[id]` |
| Entry Categories | `GET /api/entry-categories`, `POST /api/entry-categories`, `GET /api/entry-categories/[id]`, `PUT /api/entry-categories/[id]`, `DELETE /api/entry-categories/[id]` |
| Reports | `GET /api/reports/trial-balance`, `GET /api/reports/income-statement`, `GET /api/reports/balance-sheet`, `GET /api/reports/aging`, `GET /api/reports/inventory-valuation`, `GET /api/reports/inventory-movements`, `GET /api/reports/tax-summary`, `GET /api/reports/export/[reportType]` |
| Settings | `GET /api/settings/company`, `PUT /api/settings/company`, `GET /api/settings/fiscal-periods`, `POST /api/settings/fiscal-periods`, `PUT /api/settings/fiscal-periods/[id]`, `POST /api/settings/fiscal-periods/[id]/close`, `GET /api/settings/aging-buckets`, `PUT /api/settings/aging-buckets`, `GET /api/settings/sequences`, `PUT /api/settings/sequences/[id]` |
| Users | `GET /api/users`, `POST /api/users`, `GET /api/users/[id]`, `PUT /api/users/[id]`, `DELETE /api/users/[id]`, `PUT /api/users/[id]/permissions`, `GET /api/permissions` |
| Notifications | `GET /api/notifications`, `PUT /api/notifications/[id]/read`, `PUT /api/notifications/read-all` |
| Audit Log | `GET /api/audit-log` |
| Dashboard | `GET /api/dashboard/summary` |
| Purchase Orders | `GET /api/purchase-orders`, `POST /api/purchase-orders`, `GET /api/purchase-orders/[id]`, `PUT /api/purchase-orders/[id]`, `DELETE /api/purchase-orders/[id]`, `POST /api/purchase-orders/[id]/approve`, `POST /api/purchase-orders/[id]/receive`, `POST /api/purchase-orders/[id]/close`, `POST /api/purchase-orders/[id]/match-invoice/[invoiceId]`, `DELETE /api/purchase-orders/[id]/match-invoice/[invoiceId]` |

---

## 5. Frontend Architecture

### 5.1 Page Patterns

Every list page:
```
PageHeader (title + action button if applicable)
    ├── FilterBar (tabs, search, status/type dropdowns, clear button)
    ├── SummaryCards (counts by status/type)
    └── DataDisplay
        ├── DataTable (with inline row actions)
        └── EmptyState (when no data)
```

Every form:
```
FormHeader (title)
    └── FormFields (grouped logically)
        ├── Input fields with inline validation errors
    └── FormActions (Save + Cancel)
```

### 5.2 Shared Components

**UI Primitives** (`src/components/ui/`):
Button, Modal, Badge, Card, Tabs, Tooltip, Spinner

**Common** (`src/components/common/`):
PageHeader, CRUDPageLayout, SearchFilter, Pagination, StatusBadge, EmptyState

**Form** (`src/components/form/`):
TextField, SelectField, DateField, NumberField, CurrencyField, CheckboxField, FormValidation

**Tables** (`src/components/tables/`):
DataTable (sortable, sticky header), HierarchicalTable (expandable rows), InlineEditableRow

**Modals** (`src/components/modals/`):
ConfirmModal (delete with reason), FormModal, PreviewModal

**Domain** (`src/components/invoices/`, `entries/`, `dashboard/`):
InvoiceForm, InvoiceLines, InvoicePreview, PostingPreview, EntryForm, EntryLines, LedgerView, MetricCard

### 5.3 Data Fetching Pattern

```typescript
const [data, setData] = useState<T[]>([])
const [loading, setLoading] = useState(true)

const fetchData = useCallback(async () => {
  setLoading(true)
  try {
    const res = await fetch('/api/...')
    const json = await res.json()
    if (json.success) setData(json.data)
  } finally { setLoading(false) }
}, [])

useEffect(() => { fetchData() }, [fetchData])
```

### 5.4 Error Display

- **Form validation**: Inline below each field (red text)
- **API errors**: Toast notification top-right
- **Network errors**: Toast with retry button
- **Permission denied**: Toast + redirect to dashboard
- **Version conflict**: Toast "Please refresh and try again"

### 5.5 Loading States

- **Initial load**: Spinner or skeleton rows
- **Table fetch**: Skeleton rows (gray animated bars)
- **Save/Submit**: Button spinner + "Saving..." text, disabled
- **Delete**: Button spinner, disabled
- **Post/Preview**: Button spinner + "Posting..." text

---

## 6. Business Rules

### Invoice Status Transitions

```
draft ──[post]──► posted ──[payment]──► partial_paid ──[payment]──► paid
draft ──[cancel]──► cancelled
posted ──[payment full]──► paid
```

### Settlement Rules

- Paid when linked payments >= totalAmount
- Auto-triggered on payment entry posting linking to invoice
- Manual "mark as paid" requires `invoice.approve` permission
- Partial payments → `partial_paid`
- Credit notes reduce balance

### WAC Inventory Valuation

- Receipt: `new_avg = (existing_value + receipt_value) / (existing_qty + receipt_qty)`
- COGS at current weighted average
- Adjustments post to Adjustment or Gain accounts

### Transaction Boundaries

| Operation | Wrapped Operations |
|-----------|-------------------|
| Invoice Posting | validate → create entries → update stock → record movements → update status |
| Payment Settlement | validate → create payment entry → link to invoice → update status → recalculate aging |
| Period Close | validate no unposted documents → lock period → generate closing entries |
| PO Receive | validate → update stock → create movements → update PO line received qty |

---

## 7. Milestones

### Milestone 1 — Foundation & Database
- [ ] Project scaffold (Next.js + TS + Tailwind)
- [ ] SQLite (sql.js) connection with wrapper
- [ ] All tables created in `db.ts`
- [ ] 5 main accounts seeded (system-locked, not editable/deletable)
- [ ] Seed data: users, permissions, accounts
- [ ] Shared UI components (Button, Modal, Badge, Table, etc.)
- [ ] `npm run build` passes

### Milestone 2 — Authentication & Users
- [ ] Sign-in page with session
- [ ] Password handling (hash/verify)
- [ ] Protected admin layout (redirect to signin)
- [ ] User CRUD with permission assignment
- [ ] Permission checking in API routes

### Milestone 3 — Chart of Accounts (with ALL specific rules) ⭐
- [ ] Hierarchical tree table with expand/collapse
- [ ] NO global "Add" button — only "Add Sub" per row
- [ ] Inline add form (NOT modal) below parent row
- [ ] Inline edit form (NOT modal) replacing row
- [ ] 5 main accounts: edit hidden, delete blocked with reason
- [ ] Delete checks: children, transactions, invoices, posting profiles
- [ ] Delete shows SPECIFIC reason
- [ ] Parent type auto-inherits; dropdown filtered by type
- [ ] Circular reference prevention
- [ ] Tabs: All, Asset, Liability, Equity, Revenue, Expense
- [ ] Search by code or name

### Milestone 4 — Cost Centers
- [ ] Hierarchical CRUD (tree or grid)
- [ ] Expand/collapse, search
- [ ] Active/inactive toggle
- [ ] Responsible person field
- [ ] Delete with usage check
- [ ] Delete is **permanent** (hard delete) once checks pass: blocked for cost centers with children, used in journal entries, referenced in invoice lines, linked to accounts, or used in purchase order lines

### Milestone 5 — Master Data (Partners, Products, Warehouses)
- [ ] Partner CRUD (customer/vendor/both)
- [ ] Product CRUD (stock/service)
- [ ] Warehouse CRUD
- [ ] Search, filter, pagination on all list pages
- [ ] Summary cards with counts by status/type

### Milestone 6 — Settings
- [ ] Tax code CRUD (rate, account mapping, effective dates)
- [ ] Posting profile CRUD (account mappings per invoice type)
- [ ] Payment term CRUD
- [ ] Entry category CRUD
- [ ] Company settings page
- [ ] Fiscal period management
- [ ] Document sequence management

### Milestone 7 — Invoicing (Sales & Purchase)
- [ ] Sales invoice form with line items
- [ ] Purchase invoice form with line items
- [ ] VAT calculation per line
- [ ] Posting preview (entries + stock effects)
- [ ] Invoice posting (create entries, update stock, record movements)
- [ ] Invoice status management (draft → posted → cancelled)
- [ ] Credit notes linked to original
- [ ] Debit notes linked to original
- [ ] Record Payment modal

### Milestone 8 — Purchase Orders & Three-Way Matching
- [ ] PO CRUD (draft → approve → receive → close)
- [ ] Goods Receipt against PO lines
- [ ] Match invoice to PO / Unlink
- [ ] Three-way matching display
- [ ] Quick Match-to-PO / Unlink buttons

### Milestone 9 — Accounting (Journal Entries)
- [ ] Entry form with debit/credit lines
- [ ] Entry posting (validate balanced)
- [ ] Entry cancellation
- [ ] General Ledger view

### Milestone 10 — Inventory Management
- [ ] Stock level tracking per warehouse
- [ ] Stock adjustments
- [ ] Warehouse transfers
- [ ] Inventory movement report
- [ ] Negative stock prevention

### Milestone 11 — Reporting
- [ ] Trial Balance
- [ ] Income Statement
- [ ] Balance Sheet
- [ ] Partner Aging
- [ ] Inventory Valuation
- [ ] Tax Summary
- [ ] CSV/Excel export

### Milestone 12 — Dashboard, Period Close & Polish
- [ ] Dashboard with KPIs
- [ ] Aging overview cards
- [ ] Open invoices counter
- [ ] Fiscal period close
- [ ] Year-end closing
- [ ] Responsive design pass
- [ ] Loading states on all pages
- [ ] Error handling on all pages
- [ ] Audit log viewer

---

## 8. Self-Review Checklist

- [x] Data models — all entities defined
- [x] API endpoints — all enumerated
- [x] Folder structure — complete and aligned
- [x] Frontend architecture — page patterns, component tree, data fetching
- [x] Chart of Accounts — **SPECIFIC rules** (5 system accounts, inline forms, no global add, delete reasons)
- [x] Error handling — response format, categories, display strategy
- [x] Loading states — skeleton/spinner patterns defined
- [x] Transaction boundaries — all multi-step operations
- [x] Invoice settlement rules — auto vs manual, partial payments
- [x] Inventory valuation — WAC method documented
- [x] Soft-delete policy — `isActive=0` or `status='deleted'`
- [x] Optimistic locking — version fields on all mutable records
- [x] Document sequencing — auto-numbering with prefix + padding
- [x] Approval workflow — configurable thresholds for invoices
- [x] Seed data strategy — auto-seed on first startup
- [x] REST API pattern — **corrected** (not server actions)
- [x] SQLite via sql.js — pure JS, no native compilation needed
