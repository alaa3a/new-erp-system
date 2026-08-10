# ERP v3 Upgrade Roadmap — Master Design

> **Status:** APPROVED (2026-08-11). Master roadmap for the v3 upgrade program.
> **Scope:** 6 feature modules + 3 cross-cutting tracks. Each module gets its own
> spec → plan → implementation cycle (SDD) and ships independently.

## Problem

The ERP (v2.3.0) has strong core accounting, inventory, invoicing, and reporting,
but is missing several business capabilities (fixed assets, payroll, POS, cash
flow) and has room to harden security, surface KPIs, and add automated testing.
Requests: "upgrade the app and new features" across Reporting & Analytics,
Performance & UX, Security & Auth, Notifications, new business modules, and
Testing & Reliability.

## Guiding principles

- **Independent shipping units.** Every module is designed so it can land on its
  own branch → spec → plan → SDD → review → merge to master without blocking the
  others.
- **Follow existing architecture.** Modular monolith: UI (`src/app/(admin)`),
  API (`src/app/api`), repositories (`src/lib/repositories`), services
  (`src/lib/services`), shared components (`src/components`), single types file
  (`src/types/erp.ts`), sql.js DB wrapper (`src/lib/db.ts`), Zod validation,
  `{ success, data/error }` API responses, integer-cents money, soft-delete
  master data with `version` optimistic locking.
- **No new dependencies unless required.** Prefer lucide-react + Tailwind; only
  add chart/export/e2e libs where genuinely needed (noted per module).
- **Backward compatible schema.** All new tables via idempotent migration ALTERs
  / CREATE TABLE IF NOT EXISTS in `src/lib/db.ts`; existing data untouched.

## Module order

1. **Security & Auth Hardening** (M1) — protects everything; lowest risk.
2. **Reporting & Analytics** (M2) — makes existing data actionable.
3. **Fixed Assets** (M3) — first new business module, self-contained.
4. **Cash Flow** (M4) — depends on reporting patterns from M2.
5. **Payroll** (M5) — largest module; planned but later milestone.
6. **POS** (M6) — largest module; later milestone.
7. **Notifications** (M7) — cross-cutting; depends on events existing (M1–M6).
8. **Performance & UX** (M8) — cross-cutting, continuous.
9. **Testing & Reliability** (M9) — cross-cutting, can start in parallel.

---

## Module 1 — Security & Auth Hardening

### Purpose
Harden authentication, sessions, and permissions before adding more surface area.

### Scope
- **Password reset:** secure token-based reset flow. No email infra in v3.0 —
  admin-initiated reset that returns/prints a one-time token (or optional SMTP
  later). Uses existing `user` table + new token storage.
- **Two-factor auth (TOTP):** authenticator-app TOTP for admin-role users.
  New columns on `user` (`totpSecret`, `totpEnabled`). Enrollment + verify flow.
- **Session hardening:** session expiry, sliding renewal, and brute-force login
  lockout (max failed attempts → temporary lock). Audit failed attempts.
- **RBAC verification pass:** audit every API route's `requirePermission` gate
  against the permission matrix; fix gaps found.
- **Auth endpoint rate limiting:** `POST /api/auth/*` throttling.
- **Security headers:** baseline headers middleware.

### New/changed files (indicative)
- `src/lib/auth/*` (session, totp, rate-limit helpers)
- `src/app/api/auth/*` (reset-password, 2fa enable/verify)
- `src/lib/db.ts` (user table columns + token tables)
- `src/app/(admin)/profile/page.tsx`, `src/app/(admin)/users/page.tsx` (2FA/reset UI)
- `src/lib/middleware.ts` (security headers)

### Success criteria
- Admin can reset any user's password with a single-use token.
- Admin-role users can enroll/verify TOTP; login requires 6-digit code when enabled.
- 5 failed logins in 5 minutes → 15-minute lockout.
- All POST/PUT/DELETE routes verified against permission matrix.

---

## Module 2 — Reporting & Analytics

### Purpose
Turn existing data into dashboards, exports, and a cash flow statement.

### Scope
- **KPI dashboard (`/dashboard`):** revenue, AR/AP balances, low-stock count,
  overdue invoices, recent activity; small SVG charts (lucide-based, no heavy
  chart dep unless needed).
- **Cash flow statement** (`/report/cash-flow`): operating / investing /
  financing sections derived from journal entries + invoices.
- **Export:** Excel (CSV/XLSX) + PDF export buttons on existing reports (ledger,
  trial balance, income statement, balance sheet, aging, inventory valuation,
  tax summary). Evaluate `exceljs`/`pdf-lib`; if heavy, ship CSV + browser-print
  PDF first.
- **Drill-down:** report rows link to source entries/invoices where cheap.

### New/changed files (indicative)
- `src/app/api/dashboard/*` (summary aggregation)
- `src/app/api/reports/*` (export endpoints)
- `src/components/charts/*` (light SVG chart primitives)
- Report pages: export buttons + links
- `src/app/(admin)/dashboard/page.tsx` or reuse `/`

### Success criteria
- Dashboard loads with real aggregates; each KPI correct vs source reports.
- Every listed report exports to a file and to printable PDF.
- Cash flow statement ties out to income statement + balance sheet deltas.

---

## Module 3 — Fixed Assets

### Purpose
Register assets, run monthly depreciation, and post to the GL.

### Scope
- **Data model:** `fixed_asset` (code, name, category, purchase date/cost,
  useful life months, salvage value, depreciation method — straight-line,
  status); `asset_depreciation` (period, amount, accumulated, book value).
  Depreciation accounts from asset category → account mapping (reuse profile/
  account patterns) or explicit account fields on the asset.
- **Asset register:** list, add/edit, dispose (sale/retirement) with GL impact.
- **Depreciation run:** manual monthly "run depreciation" that creates journal
  entries (`Dr Depreciation Expense / Cr Accumulated Depreciation`) per asset,
  idempotent per period, and writes `asset_depreciation` rows.
- **Reports:** schedule + net book value per asset/category.

### New/changed files (indicative)
- `src/types/erp.ts` (FixedAsset, AssetDepreciation)
- `src/lib/db.ts` (tables + seed account defaults)
- `src/lib/repositories/fixedAssetRepository.ts`
- `src/lib/services/depreciationService.ts`
- `src/app/api/fixed-assets/*`
- `src/app/(admin)/accounting/fixed-assets/page.tsx`

### Success criteria
- Create asset → run depreciation for 3 periods → GL shows correct depreciation
  entries and asset net book value; disposal posts gain/loss.
- Depreciation cannot double-post the same period.

---

## Module 4 — Cash Flow

### Purpose
Cash flow visibility and a short-term forecast.

### Scope
- **Cash flow statement:** operating/investing/financing sections from journal
  entries (account type / category based classification).
- **90-day forecast:** expected receipts from AR aging, expected payments from
  AP aging, fixed recurring costs; simple rolling projection.

### New/changed files (indicative)
- `src/app/api/reports/cash-flow/*`
- `src/lib/services/cashFlowService.ts`
- Report page `/report/cash-flow`

### Success criteria
- Statement reconciles with bank/cash account movements for a sample period.
- Forecast lists expected receipts/payments by week with assumptions shown.

---

## Module 5 — Payroll *(later milestone)*

### Purpose
Salary configuration, pay runs, and payroll journal posting.

### Scope
- Employee salary config linked to existing employees (base, allowances,
  deductions, social insurance, income-tax hooks).
- Monthly pay run: gross/net calc → payroll journal entry → payslip view.

### New/changed files (indicative)
- `src/types/erp.ts`, payroll repos/services/APIs
- `src/app/(admin)/payroll/*`

### Success criteria
- Pay run produces correct net amounts and a balanced payroll GL entry; payslips
  printable.

---

## Module 6 — POS *(later milestone)*

### Purpose
Fast quick-sale checkout for retail scenarios.

### Scope
- Product lookup (scan/barcode or search), cart, payment methods, checkout that
  posts a sales invoice + payment through the existing invoice service.
- Receipt printing (browser print), cash drawer signal (optional).

### New/changed files (indicative)
- `src/app/(admin)/pos/page.tsx`
- `src/app/api/pos/*` (reuses invoice/payment services)

### Success criteria
- A POS sale creates a posted sales invoice with payment in one action; receipt
  prints.

---

## Cross-cutting tracks

### Module 7 — Notifications
- In-app alert center: low stock, overdue invoices, failed/due tasks.
- Trigger checks on relevant mutations + a daily sweep; email optional (deferred).
- `src/app/api/notifications/*`, notification store, bell UI in the app shell.

### Module 8 — Performance & UX
- Code splitting for large pages; memoized/filtered large lists; consistent
  empty/loading/error states; keyboard + focus polish.
- No new patterns that fight the existing Tailwind v4 / lucide stack.

### Module 9 — Testing & Reliability
- Playwright e2e for core flows (login, COA, invoice post, backup/restore).
- GitHub Actions CI: lint + typecheck + vitest + build (+ e2e when ready).
- Coverage targets; lint hardening (no-unused-vars, import order).

---

## Non-goals (explicitly out for v3.0)

- Multi-currency and localization.
- Replacing the sql.js storage engine.
- Email/SMS delivery infrastructure (notifications stay in-app).
- Bank reconciliation module (may follow in a later roadmap).

## Execution model

- Each module: own branch → spec → plan (writing-plans) → subagent-driven
  implementation → code review → merge to master.
- Order executed sequentially M1 → M2 → M3 → M4 → M5 → M6; M7–M9 can start
  whenever their dependencies exist.
- Global constraints apply to every module (see Guiding principles).
