# ERP System — Audit Findings & Upgrade Plan

> Based on actual codebase evaluation vs PROJECT_PLAN.md and PROJECT_PLAN_v2.md.
> Date: July 2026 (Updated after comprehensive codebase audit)

---

## Part 1: Plan vs Reality — Conflicts Found

### Conflict 1: "Server actions" vs REST APIs
- **Plan v1 says:** "Server actions for all data mutations (no client-side fetch calls)"
- **Reality:** All data mutations use REST API routes (`/api/...`). No server actions exist.
- **Status:** v2 already fixed this. No action needed.

### Conflict 2: Tech stack — better-sqlite3 vs sql.js
- **Plan v1 says:** "SQLite (better-sqlite3)"
- **Reality:** The project uses `sql.js` (pure WASM SQLite). `better-sqlite3` failed to compile on Node 24.
- **Status:** Resolved — project uses `sql.js`. No action needed.

### Conflict 3: Report directory name — `report/` vs `reports/`
- **Both plans say:** `src/app/(admin)/reports/`
- **Reality:** `src/app/(admin)/report/` (singular)
- **Status:** Minor. Either rename the folder or leave as-is.

### Conflict 4: API route structure — flat vs nested
- **Both plans say:** Settings routes under `/api/settings/company`, `/api/settings/fiscal-periods`, etc.
- **Reality:** Routes are flat — `/api/company`, `/api/fiscal-periods`, `/api/document-sequences`
- **Status:** Minor. Either move routes under `/api/settings/` or leave as-is.

### Conflict 5: Types structure — consolidated vs split
- **Both plans say:** 21 separate type files
- **Reality:** Single consolidated `src/types/erp.ts`
- **Status:** Consolidated is fine. No action needed.

---

## Part 2: CRITICAL Bugs Found — All Fixed ✅

### Bug 1: Wrong Repository Imports (8 files — RUNTIME ERROR) ✅ FIXED
These route files imported from the **wrong repository module** — likely copy-paste errors:

| Route File | Was Importing From | Now Correctly Uses |
|-----------|-------------|-------------------|
| `api/posting-profiles/route.ts` | `taxCodeRepository` | `postingProfileRepository` |
| `api/posting-profiles/[id]/route.ts` | `taxCodeRepository` | `postingProfileRepository` |
| `api/payment-terms/route.ts` | `taxCodeRepository` | `paymentTermRepository` |
| `api/payment-terms/[id]/route.ts` | `taxCodeRepository` | `paymentTermRepository` |
| `api/entry-categories/route.ts` | `taxCodeRepository` | `entryCategoryRepository` |
| `api/entry-categories/[id]/route.ts` | `taxCodeRepository` | `entryCategoryRepository` |
| `api/company/route.ts` | `fiscalPeriodRepository` | `companyRepository` |
| `api/document-sequences/route.ts` | `fiscalPeriodRepository` | `sequenceRepository` |

### Bug 2: Cost Center [id] Routes were Stubs (501 Not Implemented) ✅ FIXED
- `GET /api/cost-centers/[id]` — now implemented
- `PUT /api/cost-centers/[id]` — now implemented
- `DELETE /api/cost-centers/[id]` — now implemented

### Bug 3: No Authentication on ANY Route ✅ FIXED
- Authentication middleware (`requireAuth()`) added to all POST/PUT/DELETE routes
- Permission checks on relevant routes
- Session validation in `lib/auth/session.ts`

---

## Part 3: API Routes — Status

### Routes that exist and work ✅
| Route | Location |
|-------|----------|
| `POST /api/auth/reset-password` | `api/auth/reset-password/route.ts` |
| `GET /api/partners/[id]/aging` | `api/partners/[id]/aging/route.ts` |
| `GET /api/products/[id]/stock` | `api/products/[id]/stock/route.ts` |
| `GET /api/cost-centers/[id]` | `api/cost-centers/[id]/route.ts` |
| `PUT /api/cost-centers/[id]` | `api/cost-centers/[id]/route.ts` |
| `DELETE /api/cost-centers/[id]` | `api/cost-centers/[id]/route.ts` |
| `GET /api/invoices/[id]/entries` | `api/invoices/[id]/entries/route.ts` |
| `DELETE /api/entries/[id]` | `api/entries/[id]/route.ts` |
| `GET /api/entries/ledger` | `api/entries/ledger/route.ts` |
| `GET /api/reports/inventory-valuation` | `api/reports/inventory-valuation/route.ts` |
| `GET /api/reports/tax-summary` | `api/reports/tax-summary/route.ts` |
| `GET/PUT /api/settings/aging-buckets` | `api/settings/aging-buckets/route.ts` |
| `PUT /api/users/[id]/permissions` | `api/users/[id]/permissions/route.ts` |
| `GET /api/dashboard/summary` | `api/dashboard/summary/route.ts` |

### Still missing 🚫
| Route | Notes |
|-------|-------|
| `GET /api/reports/inventory-movements` | Never built |

---

## Part 4: Pages — Status

### Settings pages that exist ✅
| Page | Location |
|------|----------|
| Main settings | `settings/page.tsx` |
| Document sequences | `settings/document-sequences/page.tsx` |
| Entry categories | `settings/entry-categories/page.tsx` |
| Posting profiles | `settings/posting-profiles/page.tsx` |
| Tax setup | `settings/tax-setup/page.tsx` |

### Report pages that exist ✅
| Page | Location |
|------|----------|
| Aging report | `report/aging/page.tsx` |
| Balance sheet | `report/balance-sheet/page.tsx` |
| Income statement | `report/income-statement/page.tsx` |
| Ledger report | `report/ledger/page.tsx` |
| Trial balance | `report/trial-balance/page.tsx` |

### Still missing 🚫
| Page | Notes |
|------|-------|
| `report/inventory-valuation/page.tsx` | Never built |
| `report/tax-summary/page.tsx` | Never built |

> **Note:** The original plan listed `settings/company`, `settings/payment-terms`, `settings/fiscal-periods`, and `settings/aging-buckets` as individually missing pages. These have all been merged into the combined `settings/page.tsx` (see Phase 6 for details). The settings sub-pages listed above (document-sequences, entry-categories, posting-profiles, tax-setup) are additional dedicated pages.

---

## Part 5: Components — Status

### Already built ✅

| Component | Location |
|-----------|----------|
| `Button` | `components/ui/button/Button.tsx` |
| `Dropdown` | `components/ui/dropdown/Dropdown.tsx` |
| `DropdownItem` | `components/ui/dropdown/DropdownItem.tsx` |
| `Modal` | `components/ui/modal/index.tsx` |
| `InputField` | `components/form/input/InputField.tsx` |
| `Checkbox` | `components/form/input/Checkbox.tsx` |
| `Label` | `components/form/Label.tsx` |
| `Pagination` | `components/Pagination.tsx` |
| `RecordPaymentModal` | `components/invoices/RecordPaymentModal.tsx` |
| `SignInForm` | `components/auth/SignInForm.tsx` |
| `NotificationDropdown` | `components/header/NotificationDropdown.tsx` |
| `UserDropdown` | `components/header/UserDropdown.tsx` |

### Still missing 🚫

**Directories entirely missing:**
| Directory | Expected Files |
|-----------|---------------|
| `components/tables/` | DataTable.tsx, HierarchicalTable.tsx, InlineEditableRow.tsx |
| `components/modals/` | ConfirmModal.tsx, FormModal.tsx, PreviewModal.tsx |
| `components/dashboard/` | MetricCard.tsx, OverdueReceivables.tsx, OverduePayables.tsx, OpenInvoices.tsx |
| `components/entries/` | EntryForm.tsx, EntryLines.tsx, LedgerView.tsx |

**Individual missing files:**
| File | Purpose |
|------|---------|
| `common/PageHeader.tsx` | Page header with title + action button |
| `common/CRUDPageLayout.tsx` | Orchestrates filters + table + modals |
| `common/SearchFilter.tsx` | Search input with debounce + filter chips |
| `common/StatusBadge.tsx` | Colored status label |
| `common/EmptyState.tsx` | Empty state placeholder |
| `form/TextField.tsx` | Text input field with label + error |
| `form/SelectField.tsx` | Select dropdown with label + error |
| `form/DateField.tsx` | Date input |
| `form/NumberField.tsx` | Numeric input |
| `form/CurrencyField.tsx` | Currency input (cents ↔ dollars) |
| `form/FormValidation.tsx` | Validation error display |
| `invoices/InvoiceForm.tsx` | Shared invoice form |
| `invoices/InvoiceLines.tsx` | Line items editor |
| `invoices/InvoicePreview.tsx` | Invoice detail view |
| `invoices/PostingPreview.tsx` | Posting effects preview |
| `ui/Table.tsx` | Base table component |
| `ui/Card.tsx` | Base card component |
| `ui/Badge.tsx` | Base badge component |
| `ui/Tabs.tsx` | Tab component |
| `ui/Tooltip.tsx` | Tooltip component |
| `ui/Spinner.tsx` | Loading spinner |

---

## Part 6: Libraries — Status

### Already built ✅

**Validators — `lib/validators/` (16 files):**
| File | Purpose |
|------|---------|
| `account.ts` | Account validation |
| `auth.ts` | Auth validation |
| `common.ts` | Common/pagination schemas |
| `costCenter.ts` | Cost center validation |
| `entry.ts` | Entry validation |
| `invoice.ts` | Invoice validation |
| `partner.ts` | Partner validation |
| `product.ts` | Product validation |
| `purchaseOrder.ts` | Purchase order validation |
| `reports.ts` | Report params validation |
| `settings.ts` | Settings validation |
| `taxCode.ts` | Tax code validation |
| `user.ts` | User validation |
| `warehouse.ts` | Warehouse validation |
| `validate.ts` | Middleware helper |
| `index.ts` | Barrel exports |

**Repositories — `lib/repositories/` (18 files):**
All repositories exist including:
- ✅ `postingProfileRepository.ts` — plan said missing, actually EXISTS
- ✅ `paymentTermRepository.ts` — plan said missing, actually EXISTS
- ✅ `entryCategoryRepository.ts` — plan said missing, actually EXISTS
- ✅ `companyRepository.ts` — plan said missing, actually EXISTS
- ✅ `sequenceRepository.ts` — plan said missing, actually EXISTS
- ❌ `permissionRepository.ts` — still missing
- ❌ `auditLogRepository.ts` — still missing
- ❌ `notificationRepository.ts` — still missing

**Services — `lib/services/` (7 files):**
- ✅ `agingService.ts`, `entryService.ts`, `exportService.ts`, `inventoryService.ts`, `invoiceService.ts`, `purchaseOrderService.ts`, `reportingService.ts`
- ❌ `auditService.ts`, `notificationService.ts`, `sequenceService.ts` — still missing

### Still missing 🚫
| Directory | Expected |
|-----------|----------|
| `lib/formatters/` | currencyFormatter.ts, dateFormatter.ts, numberFormatter.ts |
| `hooks/` | useAuth.ts, usePartners.ts, useProducts.ts, useInvoices.ts, useEntries.ts, useReports.ts |
| `data/seed/` | accounts.ts, taxCodes.ts, postingProfiles.ts, paymentTerms.ts, entryCategories.ts, users.ts |

---

## Part 7: Cross-Cutting Technical Debt

| Issue | Severity | Status | Details |
|-------|----------|--------|---------|
| No Zod validation | **HIGH** | ✅ **RESOLVED** | All routes now use Zod schemas via `validate.ts` middleware |
| No pagination | **MEDIUM** | ✅ **RESOLVED** | Pagination added to 5 list APIs + Pagination.tsx on 6 pages |
| No standard API response format | **HIGH** | ✅ **RESOLVED** | Standard `{ success, data/error }` format applied |
| Duplicate SearchSelect component | **MEDIUM** | 🚫 **Open** | 6 copies across invoice/entry pages |
| Massive page files | **MEDIUM** | 🚫 **Open** | sales (~1600 lines), purchase (~1660 lines), entries (~1044 lines) |
| Client-side filtering from full dataset | **MEDIUM** | 🚫 **Open** | Most pages load ALL data then filter in JS |
| Unit confusion not documented | **LOW** | 🚫 **Open** | Prices in cents in API, dollars in forms |
| No version/optimistic locking on invoices | **MEDIUM** | 🚫 **Open** | Invoice PUT ignores version |
| `report/` vs `reports/` naming mismatch | **LOW** | 🚫 **Open** | Directory name differs from plan |
| `(admin)/users/` exists but plan says `settings/users/` | **LOW** | 🚫 **Open** | Path mismatch |

---

## Part 8: Upgraded Milestone Plan

### Phase 1 — CRITICAL BUG FIXES ✅ DONE
- [x] Fix wrong repository imports in 8 route files
- [x] Implement cost center [id] routes (GET, PUT, DELETE)
- [x] Add standard API response format to all routes (`{ success, data/error }`)

### Phase 2 — Missing Shared Components 🟡 PARTIALLY DONE

**Built so far:**
- [x] `components/ui/button/Button.tsx`
- [x] `components/ui/dropdown/Dropdown.tsx` + `DropdownItem.tsx`
- [x] `components/ui/modal/index.tsx`
- [x] `components/form/input/InputField.tsx` + `Checkbox.tsx`
- [x] `components/form/Label.tsx`
- [x] `components/Pagination.tsx`
- [x] `components/invoices/RecordPaymentModal.tsx`
- [x] `components/auth/SignInForm.tsx`

**Still to build:**
- [ ] `components/ui/Table.tsx`, `Card.tsx`, `Badge.tsx`, `Tabs.tsx`, `Tooltip.tsx`, `Spinner.tsx`
- [ ] `components/common/PageHeader.tsx`, `CRUDPageLayout.tsx`, `SearchFilter.tsx`, `StatusBadge.tsx`, `EmptyState.tsx`
- [ ] `components/form/TextField.tsx`, `SelectField.tsx`, `DateField.tsx`, `NumberField.tsx`, `CurrencyField.tsx`, `FormValidation.tsx`
- [ ] `components/tables/DataTable.tsx`, `HierarchicalTable.tsx`, `InlineEditableRow.tsx`
- [ ] `components/modals/ConfirmModal.tsx`, `FormModal.tsx`, `PreviewModal.tsx`
- [ ] `components/invoices/InvoiceForm.tsx`, `InvoiceLines.tsx`, `InvoicePreview.tsx`, `PostingPreview.tsx`
- [ ] `components/entries/EntryForm.tsx`, `EntryLines.tsx`, `LedgerView.tsx`
- [ ] `components/dashboard/MetricCard.tsx`, `OverdueReceivables.tsx`, `OverduePayables.tsx`, `OpenInvoices.tsx`

### Phase 3 — Refactor Bloated Pages 🟡 DEFERRED
- [ ] Eliminate 6 duplicate SearchSelect components
- [ ] Refactor sales/purchase pages to use shared InvoiceForm
- [ ] Refactor entries page to use shared EntryForm
- [ ] Reduce file sizes (split 1600+ line pages into manageable components)

### Phase 4 — Missing API Routes ✅ DONE (all but 1)
- [x] `POST /api/auth/reset-password`
- [x] `GET /api/partners/[id]/aging`
- [x] `GET /api/products/[id]/stock`
- [x] `GET /api/invoices/[id]/entries`
- [x] `DELETE /api/entries/[id]` + `GET /api/entries/ledger`
- [x] `GET /api/reports/inventory-valuation`, `GET /api/reports/tax-summary`
- [x] `GET/PUT /api/settings/aging-buckets`
- [x] `PUT /api/users/[id]/permissions`
- [x] `GET /api/dashboard/summary`
- [ ] `GET /api/reports/inventory-movements` — still missing

### Phase 5 — Authentication & Authorization ✅ DONE
- [x] Add session validation (`requireAuth()`) to ALL POST/PUT/DELETE routes
- [x] Permission checks on relevant routes

### Phase 6 — Missing Pages 🟡 PARTIALLY DONE

**Settings pages built:**
- [x] `settings/page.tsx` — combined settings (company, payment-terms, fiscal-periods, aging-buckets, users)
- [x] `settings/document-sequences/page.tsx`
- [x] `settings/entry-categories/page.tsx`
- [x] `settings/posting-profiles/page.tsx`
- [x] `settings/tax-setup/page.tsx`

**Report pages built:**
- [x] `report/aging/page.tsx`
- [x] `report/balance-sheet/page.tsx`
- [x] `report/income-statement/page.tsx`
- [x] `report/ledger/page.tsx`
- [x] `report/trial-balance/page.tsx`

**Still missing:**
- [ ] `report/inventory-valuation/page.tsx`
- [ ] `report/tax-summary/page.tsx`

### Phase 7 — Zod Validation ✅ DONE
- [x] Create `src/lib/validators/` with Zod schemas (16 files)
- [x] Add Zod validation to all POST/PUT route handlers

### Phase 8 — Pagination ✅ DONE
- [x] Add pagination support to 5 list API routes (entries, invoices, partners, products, purchase-orders)
- [x] Create `Pagination.tsx` component
- [x] Add Pagination component to 6 list pages

### Phase 9 — Missing Libraries 🟡 DEFERRED
- [ ] Create `lib/formatters/` (currency, date, number formatters)
- [ ] Create `hooks/` (useAuth, usePartners, useProducts, useInvoices, useEntries, useReports)
- [ ] Extract seed data to `data/seed/`

### Phase 10 — Plan Cleanup 🟡 PARTIALLY DONE
- [x] `PROJECT_PLAN.md` updated with status summary, completed phases, and remaining work
- [x] `UPGRADE_PLAN.md` updated with accurate codebase audit (this file)
- [ ] Fix remaining plan-reality conflicts
- [ ] Remove `PROJECT_PLAN_v2.md` (or merge into v1)

---

## Summary Stats

| Category | Count | Status |
|----------|-------|--------|
| Critical bugs (runtime errors) | 11 bugs | ✅ **All fixed** |
| Missing API routes | 1 remaining | ✅ 16/17 done |
| Missing pages | 2 remaining | ✅ Original 7 missing pages: 5 built/merged, 2 left |
| Missing components | ~28 remaining | 🟡 11 built, ~28 to go |
| Missing hooks | 6 | 🚫 Not started |
| Missing formatters | 3 | 🚫 Not started |
| Missing repositories | 3 (permission, auditLog, notification) | 🟡 15/18 exist |
| Missing services | 3 (audit, notification, sequence) | 🟡 7/10 exist |
| Missing seed data files | 6 | 🚫 Not started |
| Plan-reality conflicts | 5 | 🟡 Mostly resolved |
| Technical debt items | 3 resolved, 7 remaining | 🟡 Progress made |
