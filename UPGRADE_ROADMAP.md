# NEW ERP System — Upgrade Roadmap

> My own independent assessment and upgrade plan based on codebase analysis.
> Created: August 2026

---

## Phase 0 — Product Category Separation

**Goal:** Separate product categories into their own database table (currently categories are stored as products with `isCategory = 1`).

### Tasks
- [ ] **0.1** Create `product_category` table in `src/lib/db.ts`
  - Columns: `id`, `code`, `name`, `description`, `isActive`, `parentId` (self-ref), `createdAt`, `updatedAt`, `version`
  - Add migration: copy existing categories from `product` table, set `product.categoryId` for child products
- [ ] **0.2** Add `categoryId` column to `product` table
  - `ALTER TABLE product ADD COLUMN categoryId INTEGER REFERENCES product_category(id)`
  - Backfill: set `categoryId` from `parentId` where the parent was a category
- [ ] **0.3** Create `ProductCategory` type in `src/types/erp.ts`
  - Interface with `id`, `code`, `name`, `description`, `isActive`, `parentId`, `createdAt`, `updatedAt`, `version`
- [ ] **0.4** Update `Product` type in `src/types/erp.ts`
  - Remove `parentId`, `isCategory`, `profileId`
  - Add `categoryId: number | null`
- [ ] **0.5** Create `src/lib/repositories/productCategoryRepository.ts`
  - CRUD: `findAll`, `findById`, `create`, `update`, `softDelete`, `restore`, `findChildren`, `getTree`
- [ ] **0.6** Create `src/app/api/product-categories/route.ts`
  - `GET` — list all categories (with tree option)
  - `POST` — create category (requires auth + permission)
- [ ] **0.7** Create `src/app/api/product-categories/[id]/route.ts`
  - `GET` — get category by ID
  - `PUT` — update category (requires auth + permission)
  - `DELETE` — soft delete category (requires auth + permission)
- [ ] **0.8** Update `src/app/api/products/route.ts`
  - Remove `isCategory`, `parentId` query params
  - Add `categoryId` filter support
- [ ] **0.9** Update `src/app/api/products/[id]/route.ts`
  - Remove `isCategory`, `parentId` from create/update
  - Add `categoryId` field
- [ ] **0.10** Update `src/app/api/categories/route.ts`
  - Point to new `product_category` table instead of `product`
- [ ] **0.11** Update `src/app/api/products/categories/route.ts`
  - Point to new `product_category` table
- [ ] **0.12** Update `src/lib/repositories/productRepository.ts`
  - Remove `findCategories`, `findChildren`, `getTree`, `isAncestor`, `getChildCount`
  - Add `categoryId` to `mapRow`, `create`, `update`
- [ ] **0.13** Update `src/app/(admin)/products/page.tsx`
  - Replace "Add Category" button with "Product Category" button that opens a modal with a **table of categories** + "Add Category" button above the table
  - Add **Category** column to product table
  - Change Actions from edit/delete buttons to a **menu** (dropdown)
  - Replace "Parent Category" dropdown + "isCategory" checkbox in product form with a simple **Category** dropdown
- [ ] **0.14** Update `src/components/products/ProductTree.tsx`
  - Use new `product_category` table for tree data
- [ ] **0.15** Update `src/components/products/ProfileSelector.tsx` (if affected)
- [ ] **0.16** Run migration, verify data integrity, run tests

---

## Phase 1 — Complete the Reporting Module

**Goal:** Build the 2 missing report pages and 1 missing API route to complete the reporting module.

### Tasks
- [ ] **1.1** Create `src/app/api/reports/inventory-movements/route.ts`
  - `GET /api/reports/inventory-movements` with query params: `productId`, `warehouseId`, `dateFrom`, `dateTo`, `type`
  - Return movements with product name, warehouse name, quantity, unit cost, total cost
- [ ] **1.2** Create `src/app/(admin)/report/inventory-valuation/page.tsx`
  - Fetch from existing `GET /api/reports/inventory-valuation`
  - Display valuation by product/warehouse with total value
  - Add CSV/Excel export
- [ ] **1.3** Create `src/app/(admin)/report/tax-summary/page.tsx`
  - Fetch from existing `GET /api/reports/tax-summary`
  - Display VAT collected vs. paid by tax code
  - Add expandable per-row details (supplier name, tax ID, invoice #/date)
  - Add CSV/Excel export
- [ ] **1.4** Create `src/app/(admin)/report/inventory-movements/page.tsx`
  - Display movements in a table with filters
  - Add CSV/Excel export
- [ ] **1.5** Verify all report pages are linked in the sidebar navigation

---

## Phase 2 — Shared UI Component Library

**Goal:** Build the missing shared components to reduce duplication and improve consistency.

### Tasks
- [ ] **2.1** Create `components/ui/` primitives
  - `Table.tsx` — base table with sticky header, sortable columns
  - `Card.tsx` — container with header, body, footer slots
  - `Badge.tsx` — colored status labels
  - `Tabs.tsx` — tabbed interface
  - `Tooltip.tsx` — hover tooltip
  - `Spinner.tsx` — loading spinner
- [ ] **2.2** Create `components/common/` utilities
  - `PageHeader.tsx` — title + action button + breadcrumbs
  - `CRUDPageLayout.tsx` — orchestrates filters + table + modals
  - `SearchFilter.tsx` — search input with debounce + filter chips
  - `StatusBadge.tsx` — colored status label (draft/posted/paid/cancelled)
  - `EmptyState.tsx` — empty state placeholder with CTA
- [ ] **2.3** Create `components/tables/` components
  - `DataTable.tsx` — sortable, sticky header, row actions
  - `HierarchicalTable.tsx` — expandable rows for CoA/cost centers
  - `InlineEditableRow.tsx` — inline editing in table rows
- [ ] **2.4** Create `components/modals/` components
  - `ConfirmModal.tsx` — delete confirmation with reason
  - `FormModal.tsx` — form in a modal dialog
  - `PreviewModal.tsx` — read-only preview of a record
- [ ] **2.5** Create `components/entries/` components
  - `EntryForm.tsx` — shared entry form (header + lines)
  - `EntryLines.tsx` — line items editor with Normal/Tax/Payment types
  - `LedgerView.tsx` — general ledger view with filters
- [ ] **2.6** Create `components/invoices/` components
  - `InvoiceForm.tsx` — shared invoice form
  - `InvoiceLines.tsx` — line items editor
  - `InvoicePreview.tsx` — invoice detail view
  - `PostingPreview.tsx` — posting effects preview (entries + stock)
- [ ] **2.7** Create `components/dashboard/` components
  - `MetricCard.tsx` — KPI metric card
  - `OverdueReceivables.tsx` — overdue AR summary
  - `OverduePayables.tsx` — overdue AP summary
  - `OpenInvoices.tsx` — open invoices counter

---

## Phase 3 — Refactor Bloated Pages

**Goal:** Reduce page file sizes by extracting reusable components.

### Tasks
- [ ] **3.1** Refactor sales invoice page
  - Extract `InvoiceForm` + `InvoiceLines` + `PostingPreview` from `invoice/sales/page.tsx`
  - Target: reduce from ~1600 lines to <400 lines
- [ ] **3.2** Refactor purchase invoice page
  - Extract `InvoiceForm` + `InvoiceLines` + `PostingPreview` from `invoice/purchase/page.tsx`
  - Target: reduce from ~1660 lines to <400 lines
- [ ] **3.3** Refactor entries page
  - Extract `EntryForm` + `EntryLines` + `LedgerView` from `accounting/entries/page.tsx`
  - Target: reduce from ~1044 lines to <400 lines
- [ ] **3.4** Eliminate duplicate SearchSelect components
  - Identify all 6 copies across invoice/entry pages
  - Create a single shared `SearchSelect` in `components/form/`
  - Replace all 6 copies
- [ ] **3.5** Verify all refactored pages pass `tsc` and tests

---

## Phase 4 — Missing Libraries, Hooks & Seed Data

**Goal:** Create the missing library modules, hooks, and seed data files.

### Tasks
- [ ] **4.1** Create `lib/formatters/`
  - `currencyFormatter.ts` — cents → currency string (e.g., `123456` → `$1,234.56`)
  - `dateFormatter.ts` — date formatting
  - `numberFormatter.ts` — number formatting with locale
- [ ] **4.2** Create `hooks/`
  - `useAuth.ts` — authentication state hook
  - `usePartners.ts` — fetch/search partners
  - `useProducts.ts` — fetch/search products
  - `useInvoices.ts` — fetch/search invoices
  - `useEntries.ts` — fetch/search entries
  - `useReports.ts` — fetch report data
- [ ] **4.3** Extract seed data to `data/seed/`
  - `accounts.ts` — 5 system accounts + common chart of accounts
  - `taxCodes.ts` — default tax codes (VAT 15%, VAT 0%, etc.)
  - `postingProfiles.ts` — default posting profiles for each invoice type
  - `paymentTerms.ts` — default payment terms (NET30, NET60, etc.)
  - `entryCategories.ts` — default entry categories (Sales, Purchases, etc.)
  - `users.ts` — default admin user
- [ ] **4.4** Create missing repositories
  - `permissionRepository.ts` — permission CRUD
  - `auditLogRepository.ts` — audit log queries
  - `notificationRepository.ts` — notification CRUD
- [ ] **4.5** Create missing services
  - `auditService.ts` — audit log creation
  - `notificationService.ts` — notification creation
  - `sequenceService.ts` — document sequence management

---

## Phase 5 — Server-Side Filtering

**Goal:** Move filtering from client-side to server-side for better performance.

### Tasks
- [ ] **5.1** Add `search` query param to `GET /api/partners` (code, name, email, phone)
- [ ] **5.2** Add `search` query param to `GET /api/products` (code, name, description)
- [ ] **5.3** Add `search` query param to `GET /api/invoices` (invoice number, partner name, reference)
- [ ] **5.4** Add `search` query param to `GET /api/entries` (entry number, description, partner, invoice)
- [ ] **5.5** Add `search` query param to `GET /api/purchase-orders` (PO number, partner, reference)
- [ ] **5.6** Update frontend pages to use server-side search instead of client-side filtering

---

## Phase 6 — Money Accuracy & Data Integrity

**Goal:** Harden money calculations and data integrity.

### Tasks
- [ ] **6.1** Define rounding strategy for tax lines
  - Compute tax per line, round to 2 decimals, allow manual tweak
  - Validate at post: sum of tax lines matches expected invoice tax (±$0.01)
- [ ] **6.2** Block over-allocation on payment lines
  - Block allocations exceeding invoice remaining balance (`totalAmount - paidAmount`)
- [ ] **6.3** Make posted entries immutable
  - `PUT /api/entries/[id]` refuses edits to posted/cancelled entries
  - Return: "Reversal required — posted entries cannot be edited"
- [ ] **6.4** Add version conflict test
  - Two users editing same draft → second gets "conflict"
- [ ] **6.5** Add audit log on entry lifecycle (create/edit/post/cancel/reverse)

---

## Phase 7 — GL Posting Table (Architectural)

**Goal:** Implement immutable `ledger_post` table for instant reporting.

### Tasks
- [ ] **7.1** Create `ledger_post` table in `src/lib/db.ts`
  - Columns: `id`, `accountCode`, `entryId`, `entryLineId`, `date`, `periodId`, `debitAmount`, `creditAmount`, `costCenterId`, `businessPartnerId`, `lineType`, `vatCodeId`, `vatAmount`, `createdAt`
  - Add indexes: `accountCode`, `periodId`, `businessPartnerId`, `costCenterId`, `entryId`
- [ ] **7.2** Write to `ledger_post` during entry posting (in `entryService.postEntry`)
- [ ] **7.3** Write to `ledger_post` during invoice posting (in `invoiceService.postInvoice`)
- [ ] **7.4** Refactor `reportingService` to read from `ledger_post`
  - `getGeneralLedger`, `getTrialBalance`, `getIncomeStatement`, `getBalanceSheet`
- [ ] **7.5** Add period-end locking using `ledger_post`

---

## Phase 8 — Fiscal Period Enforcement

**Goal:** Wire up the dormant fiscal period feature.

### Tasks
- [ ] **8.1** Auto-assign `periodId` on entry creation (`entryRepository.create`)
- [ ] **8.2** Enforce period status at post time (`entryService.postEntry` rejects closed/locked)
- [ ] **8.3** Validate period close (no draft entries, all balanced)
- [ ] **8.4** Add period filter to reports (trial balance, income statement, balance sheet)
- [ ] **8.5** Add period column + filter to entries list page

---

## Phase 9 — Naming Consistency & Cleanup

**Goal:** Fix naming inconsistencies and clean up technical debt.

### Tasks
- [ ] **9.1** Rename `report/` → `reports/` (directory name mismatch with plan)
- [ ] **9.2** Move flat API routes under `/api/settings/`
  - `/api/company` → `/api/settings/company`
  - `/api/fiscal-periods` → `/api/settings/fiscal-periods`
  - `/api/document-sequences` → `/api/settings/sequences`
- [ ] **9.3** Fix document sequence label/key mismatch
  - Canonicalize keys, update settings page registry
- [ ] **9.4** Add version/optimistic locking to invoice PUT
  - Currently `PUT /api/invoices/:id` ignores `version`
- [ ] **9.5** Remove `account.costCenterId` column (after all read paths use `linkType`/`linkId`)

---

## Phase 10 — New Features & Enhancements

**Goal:** Add high-value features from the roadmap.

### Tasks
- [ ] **10.1** Opening Balance entry
  - Seed "Opening Balance" category + one-time flow to post existing balances
- [ ] **10.2** Partner ledger report
  - All lines for one partner, split by line type, with running balance
- [ ] **10.3** Cost-center ledger report
  - All lines for one cost center (and sub-cost-centers), with running balance
- [ ] **10.4** Enhanced entries search
  - Extend search to match partner name and linked invoice number
- [ ] **10.5** Entry reversal feature
  - Create mirrored entry (debits/credits swapped), copy dimensions, decrement paidAmount
- [ ] **10.6** Memorized/recurring entries
  - Save entry as template, create new from template
- [ ] **10.7** Entry voucher print/export
  - Printable view with signature lines, PDF export

---

## Phase 11 — Testing & Validation

**Goal:** Ensure all changes are properly tested and validated.

### Tasks
- [ ] **11.1** Run full test suite after each phase
  - `npx tsc --noEmit`, `npx vitest run`, `npx eslint`
- [ ] **11.2** Add tests for new features
  - GL posting table, fiscal period enforcement, money accuracy, entry reversal
- [ ] **11.3** Add integration tests
  - Full workflow: entry → post → verify ledger_post → verify reports
  - Full workflow: invoice → post → record payment → verify aging
- [ ] **11.4** Manual smoke tests
  - Create draft → generate tax line → add payment allocation → post → verify invoice paid + ageing

---

## Phase 12 — Documentation & Polish

**Goal:** Update documentation and polish the user experience.

### Tasks
- [ ] **12.1** Update `PROJECT_PLAN.md` with completed phases
- [ ] **12.2** Update `UPGRADE_PLAN.md` with new status
- [ ] **12.3** Add loading states to all pages (skeletons, button spinners)
- [ ] **12.4** Add error handling to all pages (toasts, retry, permission redirects)
- [ ] **12.5** Responsive design pass (collapse sidebar, stack filters)
- [ ] **12.6** Add tooltips and contextual help (tax, posting profiles, payment types)

---

## Execution Order Recommendation

1. **Phase 1** (Missing reports) — Quick wins, high user value
2. **Phase 2** (Shared components) — Foundation for refactoring
3. **Phase 3** (Component extraction) — Reduces tech debt, enables reuse
4. **Phase 4** (Libraries & hooks) — Enables cleaner code
5. **Phase 5** (Server-side filtering) — Performance improvement
6. **Phase 6** (Money accuracy) — Data integrity
7. **Phase 7** (GL posting table) — Biggest architectural improvement
8. **Phase 8** (Fiscal periods) — Completes dormant feature (depends on Phase 7)
9. **Phase 9** (Naming cleanup) — Code quality
10. **Phase 10** (New features) — User value
11. **Phase 11** (Testing) — Quality assurance
12. **Phase 12** (Documentation) — Polish

> **Note:** Phase 8 (fiscal periods) depends on Phase 7 (GL posting table) for period-end locking. Phases 6, 7, and 8 can be implemented together for maximum synergy.
