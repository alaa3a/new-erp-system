# Journal Entries — Upgrade Plan

> Consolidated plan for the New Journal Entry redesign.
> Date: August 2026 — based on conversation with the product owner + codebase audit.

---

## 0. Status dashboard

| Phase | Title | Status |
|-------|-------|--------|
| 1 | Remove Entry Type (foundation) | ✅ **DONE** (2026-08-03) — tsc clean, 256/256 tests green |
| 2 | Category replaces Type filter | ✅ **DONE** (2026-08-03) — "No category" filter option + `'none'` semantics removed |
| 3 | Page polish (chevron expand + app style) | ✅ **DONE** (2026-08-03) — chevron-only expand, app-standard filter bar / EmptyState |
| 4 | Line editor modal (normal / tax / payment) | ✅ **DONE** (2026-08-03) — line types, tax/WHT generation, payment allocations, CC rule |
| 5 | Posting engine side effects | ✅ **DONE** (2026-08-03) — shared payment engine, transaction post, period wiring, per-category numbering |
| 6 | AR/AP `partnerRole` flag | ✅ **DONE** (2026-08-03) — account flag + contradiction guards, flag-wins precedence |
| 7 | Posting profile upgrades | ✅ **DONE** (2026-08-03) — resolver, direction-aware form, stock toggle, dead columns dropped |
| 8 | Invoice pages cut-over | ✅ **DONE** (2026-08-03) — RecordPaymentModal posts payment-line entries with allocations |
| 9 | Reports groundwork | ✅ **DONE** (2026-08-03) — ledger cost-center/partner/line-type filters (+ export). GL posting table stays roadmap (§7.1) |
| 10 | Tests & validation | ✅ **DONE** (2026-08-03) — 295/295 tests, tsc clean, eslint baseline only |

> **Open decisions pending** (§10.7): credit-note application on payment lines; debit_note/credit_note direction mapping.

---

## 1. Requirements (from the owner)

1. **Line info columns** — the entry line table must show whether each line has a cost center, a supplier, a customer, or nothing — this feeds future cost-center ledgers and customer/supplier ledgers.
2. **Remove Entry Type** — the "Entry Type" field is not needed; use **Category** instead.
3. **Remove Type filter** — replace it with a **Category filter**, and remove the "No category" option from the list.
4. **Remove click-on-row-to-expand** — expand only via a dedicated button.
5. **Page style = app style** — match the standard app look (Products / Business Partners).
6. **Add-line modal** (rich line editor):
   - **Tax support** — a tax line auto-generates a tax line per tax type, and must carry supplier name, supplier tax ID, invoice number, invoice date.
   - **Payment support** — payment lines affect ageing and invoice paid amounts; must link to a supplier/customer **and** invoices (choose invoice + paid amount per invoice + info).
   - **Mix tax & payment** — e.g. WHT is a payment related to withholding tax.
   - **Cost-center rule** — when the selected account is linked to a cost center, show all sub cost centers at all levels under it; if the account is not linked, disable the cost-center field.
   - **AR/AP rule** — AR account → choose customer; AP account → choose supplier ("how do we do that practically?").

---

## 2. Decisions locked in

| Decision | Choice |
|----------|--------|
| Entry Type | **Remove completely** (DB column + all code) — every entry becomes a journal entry (`JE-`) |
| Payments | **Replace quick-pay** — all payments flow through journal-entry payment lines; `RecordPaymentModal` is removed |
| AR/AP detection | **Both** — new `partnerRole` flag on accounts + posting-profile fallback |
| Tax lines | **"Generate tax line" button** — user picks a tax type, clicks to insert the computed line |
| Posting profiles | Need a **resolver + default uniqueness + drop dead VAT columns** (see §6) |

---

## 3. Current state (verified in code)

| Area | Reality |
|------|---------|
| `entry_line` | Already stores `businessPartnerId`, `costCenterId`, `vatCodeId`, `vatAmount` — partner & cost-center dimensions exist per line |
| `entry.type` | **REMOVED in Phase 1 (2026-08-03)** — was driving prefixes (`JE-`/`PAY-`/`REC-`/`ADJ-`/`CLS-`); all entries are now plain journal entries (`JE-`, `entry_journal` sequence) |
| Payment flow | `RecordPaymentModal` hardcodes accounts `1000` (cash) / `1100` (AR) / `2000` (AP), posts an entry, then `POST /api/invoices/[id]/link-payment` → `invoiceService.linkPayment` updates `paidAmount` + status → ageing |
| Tax codes | `tax_code` has `rate`, `type` (`output`/`input`), `accountCode` (the tax account), `parentId`, `isGroup` — invoice posting already auto-creates VAT lines from `taxCode.accountCode` |
| Cost centers | Hierarchical (`parentId`); `account.costCenterId` links an account to a (parent) cost center |
| Posting | `entryService.postEntry` only validates balance + marks posted — **no fiscal-period check, no account/partner validation** |
| Reports | Trial balance / income statement / balance sheet / GL re-sum `entry_line` on the fly — no ledger-posting table |
| Posting profiles | `vatOutputCode`/`vatInputCode` columns are **dead** (form removed, VAT resolves from tax-code account) — confirmed nothing reads them |

---

## 4. Data model changes (migrations in `src/lib/db.ts`)

| Change | Detail |
|--------|--------|
| `entry` | `ALTER TABLE entry DROP COLUMN type` (same pattern as the existing `entry_category.type` drop) |
| `entry_line` | `ADD COLUMN lineType TEXT NOT NULL DEFAULT 'normal'` — semantics: `normal` (P&L / balance lines), `tax` (VAT/WHT control lines, `vatCodeId` + `vatAmount` set), `payment` (AR/AP clearing lines, carry `businessPartnerId` + allocations). **WHT = a `tax` line, NOT a 4th type** — a WHT payment = one `payment` line + one `tax` line + one `normal` cash line; the "mix" is expressed at entry level ✅ |
| `entry_line` | `ADD COLUMN supplierName TEXT`, `supplierTaxId TEXT`, `invoiceNumber TEXT`, `invoiceDate TEXT` ✅ |
| NEW table | `entry_line_payment_allocation (id, entryLineId, invoiceId, amount, notes, createdAt)` — per-invoice allocations (auditable, reportable) ✅ |
| `account` | `ADD COLUMN partnerRole TEXT NOT NULL DEFAULT 'none'` (`none` \| `ar` \| `ap` \| `both` — `both` = shared control account used for AR and AP) |
| `posting_profile` | Drop dead columns: `vatOutputCode`, `vatInputCode`, `adjustmentAccountCode` (all unused — see §6.3) |
| `posting_profile` | `ADD COLUMN entryCategoryId INTEGER` (nullable) — default entry category applied to entries auto-created via this profile (see §6.6) |
| `document_sequence` | Canonicalize keys (fix the settings-page `invoice_*` label mismatch — real rows use `sales`/`purchase`/…); auto-create on entity creation; purge orphaned `entry_payment`/`entry_receipt`/… rows after the type removal (see §10.8) |
| Indexes | `entry_line(accountCode)`, `entry_line(entryId)`, `entry_line(costCenterId)`, `entry_line(businessPartnerId)`, `entry_line(vatCodeId)`, `entry(status, entryDate)`, `entry(categoryId)`, `entry(periodId)` |

> **Backup first:** copy `erp.sqlite` (the project already keeps `.bak-*` files) before applying migrations.

---

## 5. Implementation phases

### Phase 1 — Remove Entry Type (cross-cutting foundation) ✅ DONE (2026-08-03)
- [x] `src/lib/db.ts` — migration to drop `entry.type` (`ALTER TABLE entry DROP COLUMN type`); removed from `CREATE TABLE` for fresh installs; purged orphan `entry_payment`/`entry_receipt`/`entry_adjustment`/`entry_closing` `document_sequence` rows.
- [x] `src/types/erp.ts` — removed `EntryType`; removed `type` from `Entry`.
- [x] `src/lib/utils/idGenerator.ts` — `generateEntryNumber()` takes no arg, always `JE-` via the `entry_journal` sequence (per-category numbering arrives in Phase 5).
- [x] `src/lib/repositories/entryRepository.ts` — `mapEntry`, `create()`, `buildEntryWhere`, `findAll`/`paginate` drop `type`.
- [x] `src/lib/services/invoiceService.ts` — posting entries are plain journal entries (removed the receipt/payment conditional).
- [x] `src/app/api/entries/route.ts` — `POST` drops `type`; `GET` drops the `type` query param.
- [x] `src/app/(admin)/accounting/entries/page.tsx` — removed type chips, `entryTypeLabels`, the Type column, the Type field in the form, `EntryType` import; colSpans 9→8 (incl. the expanded-line sub-row cell count).
- [x] **RUNTIME BREAKAGE FIXED:** `src/lib/services/reportingService.ts` — `getGeneralLedger` no longer selects `e.type AS entryType`; dropped unused `entryType` from `LedgerRow` in `src/app/(admin)/report/ledger/page.tsx`.
- [x] **RUNTIME BREAKAGE FIXED:** `src/app/api/reports/dashboard/route.ts` — "recent entries" no longer selects `type`; removed `type` from the dashboard `recentEntries` interface in `src/app/(admin)/page.tsx`.
- [x] `src/lib/services/exportService.ts` — verified: ledger export headers already exclude `type`; safe.
- [x] Tests updated: `entryRepository.test.ts` (receipt/payment/type-filter tests removed or converted to linked-invoice + JE- assertions), `entryService.test.ts`, `entryCategoryRepository.test.ts`, `costCenterRepository.test.ts`, `taxCodeRepository.test.ts` — no more entry `type` inserts/asserts.
- [x] Validation: `npx tsc --noEmit` clean, `npx vitest run` 256/256 green, eslint no new errors (only pre-existing `no-explicit-any` baseline).

### Phase 2 — Category replaces Type filter ✅ DONE (2026-08-03)
- [x] Entries page: removed the **"No category"** option from the Category select (and the `'none'` filter semantics).
- [x] Dropped the `null` category semantics from `entryRepository.buildEntryWhere` / `findAll` / `paginate` (dead code once `'none'` was gone) and the `'none'` branch in `/api/entries` GET; removed the obsolete null-category repository test (suite: 256 → 255).
- [x] Keep `categoryId` query param → repository filter (already implemented).

### Phase 3 — Page polish ✅ DONE (2026-08-03)
- [x] Removed whole-row `onClick` expand + `cursor-pointer` → dedicated chevron button in the Actions column (only the chevron toggles; chevron highlights brand when open).
- [x] Restyled to app standard: filter bar in a card container (`rounded-2xl border … px-4 py-2.5`), status chips match Products/Partners, `SearchInput compact`, `EmptyState` for loading + empty states (with "Create your first entry" CTA).

### Phase 4 — Line editor modal (the core UI) ✅ DONE (2026-08-03)
> Implemented inside the entries page's line cards (each card carries a Normal / Tax / Payment type selector) rather than a separate component — less indirection, same capabilities. `SearchSelect` gained optional `groupLabel` support for the grouped tax-type picker. Invoices API gained `businessPartnerId` + `open=1` filters for the payment card's open-invoice sub-table.

- [x] **Normal line** — account (`SearchSelect`), description, debit/credit, cost center (rule-based, disabled when account has no linked CC).
- [x] **Tax line** — the user picks the tax type (grouped picker, active non-group only), enters the base, fills supplier fields, clicks **Generate tax line** → the card converts into the computed tax line:
  - account = `taxCode.accountCode`, amount = `round(base × rate)` cents-exact, direction by output/input (`input` → debit, `output` → credit).
  - Marked `tax`, sets `vatCodeId` + `vatAmount`; the generated amount stays editable.
  - Line carries `supplierName`, `supplierTaxId`, `invoiceNumber`, `invoiceDate`.
- [x] **Tax-type picker (shared by Tax & Payment lines)** — dropdown of **active, non-group tax codes only**, rendered grouped by tax group (`groupLabel`), showing `code — name (rate%)`. Groups are headers, NOT selectable.
- [x] **Payment line** — partner picker (auto-constrained by the control account's AR/AP role) + sub-table of that partner's **open invoices** (`/api/invoices?businessPartnerId=&open=1`, cached + refreshable) with per-invoice **paid amount** + notes; **Generate Payment Lines** materializes: the AR/AP clearing (`payment`, carries partner + allocations), optional WHT `tax` line, and the net `normal` cash line (cash account defaults from the posting profile).
- [x] **WHT mix** — payment line with a tax type generates AR/AP clearing + WHT as a **`tax`** line + net cash line; WHT direction follows the cash side (AP → credit, AR → debit) so entries always balance. Supplier doc fields (name / tax ID from partner + invoice # / date inputs) are copied onto the WHT tax line.
- [x] **Cost-center rule** — on account select: if `account.costCenterId` is set, the CC picker shows that cost center + **all descendants at all levels** (client-side from `/api/cost-centers`); otherwise the field is **disabled**.
- [x] **AR/AP → partner** — fallback: match the account against active posting-profile AR/AP codes (AR in one profile + AP in another → both); default both. (Account-level `partnerRole` flag arrives in Phase 6; the resolver slots in front of this fallback.)
- [x] **Live balance indicator** — existing debit/credit balance bar kept; per-line type badges + allocation summaries added.
- [x] **§10.6 #4** — `entryService.validateLineAllocations` enforces **Σ allocations = payment line amount** on POST/PUT.
- [x] **§10.6 #1/#2/#3** — PUT persists new line fields + replaces allocations; DELETE clears allocations (via `deleteLines`); `mapLine` maps the new columns.

### Phase 5 — Posting engine side effects ✅ DONE (2026-08-03)

- [x] **Shared payment engine** — `invoiceService.linkPayment` refactored into `applyPaymentAllocation` (increment, guards: cancelled + **draft** invoices and over-allocation `amount > remaining`) + `reversePaymentAllocation` (decrement **with status recompute** `paid → partial_paid → posted`, floor at 0). Both used by `postEntry` and the legacy `link-payment` route; the unused `entryId` param dropped from the route + `linkPaymentSchema`.
- [x] **`postEntry` transaction** — applies payment allocations to each invoice's `paidAmount`/status inside `db.transaction()` (ageing correct by construction; each application re-checks the remaining balance, so a two-line allocation to the same invoice can't overpay), then marks the entry posted.
- [x] **Fiscal period wiring** — `entryRepository.create` auto-assigns `periodId` from `entryDate` via `fiscalPeriodRepository.findOpenPeriod` (manual + invoice-posted entries); `postEntry` rejects posting into a **closed/locked** period (drafts stay preparable). Activates the dormant period feature — see §7.1.
- [x] **Validate references at save** (`entryService.validateReferences`, wired into POST/PUT) — account exists & active; cost center & partner exist & active; **AR/AP rule** — payment lines on AR/AP accounts (from active posting-profile codes) now **require** a partner, and the partner's type must match the role (`ar` → customer, `ap` → vendor).
- [x] **Entry category from profile** — `posting_profile.entryCategoryId` column + type + repo mapping; `invoiceService.postInvoice` sets the auto-created entry's `categoryId` from the profile (fallback: null) so generated entries are NOT invisible under the Category filter.
- [x] **Per-category numbering** — shared `ensureSequence`/`sanitizeCategoryCode`/`ensureCategorySequence` in `db.ts`; `generateEntryNumber(category)` now numbers via the category's `entry_cat_<id>` sequence (prefix `JE-<CODE>-`, sanitized), uncategorized falls back to `entry_journal`; `entryCategoryRepository.create` ensures the sequence; migration backfills sequences for existing categories; entry form shows the number hint (`JE-<CODE>-NNNNNN`) once a category is picked.
- [x] **`invoiceService.postInvoice`** sets `lineType` on generated lines (`'tax'` when `vatCodeId`, else `'normal'`) so ledger filters work uniformly across invoice- and entry-generated lines.
- [x] **Review fixes** (code-review pass): `generateEntryNumber` reuses `sanitizeCategoryCode` (no duplicated sanitize logic); `open=1` invoice filter drops `draft` status (only posted/partial_paid payable); `applyPaymentAllocation` blocks draft invoices server-side; payment lines on AR/AP accounts require a partner. Status recompute boundary (`>= totalAmount → paid`) verified consistent with the open filter.

> **Deferred from the original checklist:** partner soft-delete guard (§10.5) — still open, tracked with Phase 6/7.

### Phase 6 — AR/AP `partnerRole` flag ✅ DONE (2026-08-03)
- [x] `account.partnerRole` column (`none | ar | ap | both` — `both` = shared control account) + migration + `AccountPartnerRole` type + `Account` field.
- [x] `accountRepository` maps/persists the flag (`create`/`update`); added `getActiveProfileRoles(code)` (active-profile AR/AP usage).
- [x] Validator (`createAccountSchema`/`updateAccountSchema` include `partnerRole`) + account API routes (POST persists; PUT persists + returns a **non-blocking contradiction warning** when the flag contradicts active-profile AR/AP usage — §6.8).
- [x] Chart of Accounts UI: Partner Role select in the add/edit modal (with live usage hint), badge column in the table, `toast.info` shows the server warning on save.
- [x] **Precedence wired (§6.8):** `entryService.resolvePartnerRoleForAccount` and the entries-page `partnerRoleForAccount` now check the account flag first, then the posting-profile fallback, default `both`.

> **Deferred:** `partnerRepository.softDelete` usage guards (partner on posted entries/invoices can't be deleted) — still open, tracked with §10.5.

### Phase 7 — Posting profile upgrades ✅ DONE (2026-08-03)
- [x] **Sequence auto-creation** — `postingProfileService.ensureProfileSequence(invoiceType)` (shared `ensureSequence`) runs on profile create/update; entry-category sequences already ensured (Phase 5).
- [x] **Entry category mapping** — `entryCategoryId` added to the profile form (active-category picker), validator, repo CRUD, and card display; `postInvoice` + Record-payment flow apply it to auto-created entries.
- [x] **Direction-aware fields (§6.1)** — AR-side profiles (`sales`, `debit_note`) show only AR; AP-side (`purchase`, `credit_note`) show only AP; server-side `validateProfile` enforces the side-appropriate account + cash.
- [x] **Optional stock mappings toggle (§6.2)** — "Enable stock account mappings" switch reveals Inventory/COGS; when off they are hidden and saved empty.
- [x] **Remove Inventory Adjustment** — `adjustmentAccountCode` dropped from form/type/repo/validator/usage map, and the column dropped via migration. `vatOutputCode`/`vatInputCode` columns + type fields dropped in the same migration.
- [x] **Account resolver service** — new `postingProfileService.ts` (`getDefaultProfile`, `resolveAr`, `resolveAp`, `resolveCash`, `resolveDiscount`); order = explicit profile → per-type default → global default → seeded-account fallback (`102`/`201`/`101`/`502` — the plan's `1000/1100/2000` were legacy quick-pay codes that don't exist in the seed chart). `invoiceService.previewPosting` now resolves AR/AP through the resolver.
- [x] **Default uniqueness (§6.5)** — `clearOtherDefaults(id, invoiceType)` clears other same-type defaults when a profile is set default (API POST/PUT).
- [x] **AR≠AP + partnerRole contradiction guards (§6.8)** — `validateProfile` rejects AR==AP and warns when the AR account is flagged `ap` (or AP flagged `ar`).
- [x] Payment-line editor already lets the user override the cash/bank account (default from profile) — no schema change.

### Phase 8 — Invoice pages ✅ DONE (2026-08-03)
- [x] `RecordPaymentModal` **rewritten onto the new payment flow** (kept as the "Record payment" action): it now creates a journal entry with a `payment` AR/AP clearing line carrying the per-invoice **allocation** + a `normal` cash line, using profile-resolved accounts (invoice's profile → default → fallback) — **no hardcoded `1000`/`1100`/`2000`**, **no `link-payment` call** (posting applies the allocation via `postEntry`).
- [x] Sales/purchase pages unchanged (same props), but the payment now flows through journal payment lines — the legacy quick-pay path is gone.
- [x] **Sequencing satisfied** — shipped with Phase 5 (payment lines live before the modal was cut over).

### Phase 9 — Reports groundwork ✅ DONE (2026-08-03)
- [x] `reportingService.getGeneralLedger` now accepts **account / cost-center / partner / line-type filters** and returns the dimension columns (`costCenterId`, `businessPartnerId`, `lineType`, `costCenterName`, `partnerName`) — cost-center & customer/supplier ledgers are now straightforward filter queries.
- [x] Ledger route passes all filters through (validated); ledger page gained **Cost Center / Partner / Line Type** filter dropdowns + line-type badges and partner/CC tags in rows; CSV/Excel ledger export passes the filters too.
- ⬜ **GL posting table** (`ledger_post`) — explicitly optional / roadmap (§7.1); **deferred**, not in v1.

### Phase 10 — Tests & validation
- Update all touched tests; add: type removal, line types, tax-generation math, payment-allocation posting, AR/AP detection, cost-center descendant filtering, profile resolver.
- Validate: `npx tsc --noEmit`, `npx vitest run`, `npx eslint` on touched files.

---

## 6. Posting profiles — exact changes needed

### 6.1 Required — direction-aware fields
- **Sales side (`sales`, `debit_note`)**: form shows **Accounts Receivable**, Cash/Bank, Discount (+ optional stock section). **Accounts Payable is hidden.**
- **Purchase side (`purchase`, `credit_note`)**: form shows **Accounts Payable**, Cash/Bank, Discount (+ optional stock section). **Accounts Receivable is hidden.**
- Matches the app's current direction mapping (`sales`/`debit_note` → AR, `purchase`/`credit_note` → AP). Validation enforces only the side-appropriate required fields.

### 6.2 Required — optional stock mappings toggle
- Add an **"Enable stock account mappings"** toggle to the profile form. Off → Inventory / COGS hidden and saved empty; On → fields shown.
- Keeps the form clean for service businesses that never touch inventory.

### 6.3 Required cleanup — remove Inventory Adjustment (why)
`adjustmentAccountCode` is **dead today** — verified in code:
- No posting path reads it: `invoiceService.previewPosting`/`postInvoice` use each invoice line's own `accountCode`, never the profile's adjustment/COGS/inventory accounts.
- Stock adjustments (`inventoryService`) only record inventory movements — they **never post a GL entry**, so an adjustment account is never used.
- The upcoming auto tax/payment engine does not need it either.
- Remove it from the form, `PostingProfile` type, repository CRUD, validator, and the account-usage map; drop the column in the same migration as the VAT columns.
- **When to bring it back:** when stock adjustments are wired to post GL entries (debit/credit Inventory, offset to a Gain/Loss account), add a dedicated field with a real consumer — not an orphan.

### 6.4 Required — resolver for non-invoice-linked entries
- `getDefaultProfile` / `resolveAr` / `resolveAp` / `resolveCash` / `resolveDiscount` with order: invoice's own `postingProfileId` → global `isDefault` profile → hardcoded fallbacks (`1000`/`1100`/`2000`).
- Applies to journal entries **without** `linkedInvoiceId` (the common case) and to payment lines; entries linked to an invoice use that invoice's profile.

### 6.5 Required — default uniqueness
- Enforce **one default per invoice type + one global default** in the profile API so journal entries resolve deterministically.

### 6.6 Required — entry category mapping
- Each posting profile picks a default **Entry Category** (`entryCategoryId`) in the profile form.
- `invoiceService.postInvoice` sets the auto-created entry's `categoryId` from the profile (fallback: null) — with Entry Type removed, Category is the primary classifier, so auto-generated entries must not be left uncategorized.
- Journal entries: the user still picks the Category manually in the entry header; the "Record payment" flow (Phase 8) pre-fills it from the profile.

### 6.7 Optional
- Cash/bank account overridable on payment lines (multi-bank support, no schema change).
- WHT modeled as a tax code (rate + `accountCode`) — reuses the tax-line engine; no profile field.
- Optional `bankChargeAccountCode` for payment-line bank fees (later).

### 6.8 Required — AR/AP flag vs profile consistency (no silent conflicts)
Two mechanisms define an account's partner role: the account-level `partnerRole` flag (chart of accounts) and the posting-profile AR/AP codes. Rules to avoid contradictions:
- **Precedence:** line editor — flag wins → profile fallback → both; invoice posting — the invoice's own profile mapping wins.
- **Profile save guard:** `accountsReceivableCode ≠ accountsPayableCode` within the same profile; warn/block if the AR/AP account's `partnerRole` flag says the opposite role (flag `ar` used as AP, etc.).
- **Account flag save guard:** warn if the account is referenced as the opposite role in any active profile.
- **Shared control account** (same code as AR in one profile and AP in another): allow explicitly via `partnerRole = 'both'` — the line editor then shows customers + vendors.
- Cash / discount / inventory / COGS roles do NOT interact with the flag — no conflict.

**Unchanged:** AR/AP/cash/discount already exist and are wired; Inventory/COGS stay (behind the toggle).

---

## 7. Strong & practical suggestions (roadmap — not in v1 core)

### 7.1 Ledger & posting integrity (highest value)
- **Immutable GL posting table** (`ledger_post`): account, date, period, debit/credit, entry ref, cost center, partner, lineType — written inside the post transaction. Powers instant reports, running balances, trial balance by period, and period-end locking. Replaces on-the-fly rescanning in `reportingService`.
- **Fiscal periods ↔ entries (dormant today — wire it):** `entry.periodId` FK exists but is **never set** (all entries are `periodId = NULL`), `postEntry` ignores period status, and period `close` validates nothing — so period-filtered trial balance returns empty. Fix: auto-assign `periodId` from `entryDate` on create (`findOpenPeriod`), enforce `open` at post (reject closed/locked/backdated), and validate on period close (no draft entries in the period, no postings after close).
- **Validate references at save** (account/cost center/partner existence + active).
- **Rounding & auto-balance**: add a "Split difference" control (adjust last line so debits = credits) and a defined rounding rule for tax math.
- **Line rules**: debit XOR credit (never both), amounts > 0, posted lines immutable.

### 7.2 Corrections & reversals
- **Reverse entry**: creates a mirrored entry linked via `reversalOf`/`reversedBy`; **debits and credits are swapped automatically** (all dimensions — account, cost center, partner, tax — are copied). If the original had payment allocations, the reversal **decrements** each invoice's `paidAmount`, **recomputes the invoice status** (`paid` → `partial_paid` → `posted`), and restores ageing. Posted entries are never hard-deleted.

### 7.3 Document control & traceability
- Extend source-document links beyond `linkedInvoiceId` (PO, goods receipt, partner; `sourceRef` on lines).
- **Per-fiscal-period numbering** (JE-2026-00001) via `document_sequence`.
- Line-level audit diffs on edit.

### 7.4 Payment engine
- **On-account / unapplied payments** (deposits before invoices) with a later "apply" flow.
- **Settlement discounts**: use the already-modeled `discountAccountCode` (e.g. pay $990 on $1,000).
- **Smart allocation defaults**: oldest invoices first, pre-fill balances, running totals, block over-allocation.
- **WHT certificate/reference** field on the WHT line for tax filings.

### 7.5 Tax engine
- Tax-on-tax cascade; tax base = amount-excluding vs including tax (country-dependent).

### 7.6 UX / productivity
- **Memorized/recurring entries** (monthly rent, depreciation) — save as template + create from template.
- **Duplicate draft**; line template picker.
- **Entry voucher print/export** (printable view with signature lines).

---

## 8. Validation strategy

- `npx tsc --noEmit` — clean after each phase.
- `npx vitest run` — full suite (currently **256** tests after Phase 1 removed 2 entry-type tests) must stay green.
- `npx eslint` on touched files — no new warnings beyond the documented pre-existing baseline.
- `git diff --stat` sanity check on each phase.
- Manual smoke test: create draft → generate tax line → add payment allocation → post → verify invoice paid status + ageing.

---

## 9. Suggested build order

1. ✅ **Phase 1** (remove Entry Type) — **DONE**. Riskiest part (DB + tests) is behind us; foundation is in place.
2. ✅ **Phase 2 + 3** (category filter + page polish) — **DONE** (2026-08-03) — tsc clean, 255/255 tests green, eslint no new issues.
3. ✅ **Phase 4** (line editor modal) — **DONE** (2026-08-03) — tsc clean, 261/261 tests green.
4. ✅ **Phase 5** (posting engine) — **DONE** (2026-08-03) — tsc clean, 277/277 tests green.
5. ✅ **Phase 6 + 7** (AR/AP flag + profile resolver) — **DONE** (2026-08-03) — tsc clean, 295/295 tests green.
6. ✅ **Phase 8** (invoice pages) — **DONE** (2026-08-03) — payment cut-over onto payment lines.
7. ✅ **Phase 9 + 10** (reports filters + tests) — **DONE** (2026-08-03) — 295/295 tests green, eslint no new issues.

> **All 10 phases complete.** Roadmap leftovers (§7.1 GL posting table, §10.5 partner soft-delete guard, §10.7 credit-note negative allocations) tracked for follow-up.

> Roadmap items (§7) can be folded in later — §7.1 (GL posting table + period enforcement) is the recommended next big investment after v1.

---

## 10. Cross-module impact & conflicts (verified in code)

### 10.1 Runtime breakages if `entry.type` is dropped without these fixes ✅ RESOLVED in Phase 1
| # | File | Issue | Fix | Status |
|---|------|-------|-----|--------|
| 1 | `reportingService.getGeneralLedger` | `SELECT … e.type AS entryType` | Remove from SQL; drop unused `entryType` in ledger page `LedgerRow` | ✅ Fixed |
| 2 | `/api/reports/dashboard` | "recent entries" `SELECT … type` | Remove `type` from the SELECT | ✅ Fixed |
| 3 | `exportService.ledger` | Consumes `getGeneralLedger` | Verify mapping (headers already exclude type) | ✅ Verified safe |
| 4 | `src/app/(admin)/page.tsx` (dashboard) | `recentEntries` interface declares `type` (the table never renders it) | Remove the field from the interface | ✅ Fixed |

### 10.2 Conflicts / sequencing
- **Payment engine ↔ RecordPaymentModal removal** — Phase 5 + Phase 8 must ship together (see Phase 8).
- **Reversal ↔ invoice status** — decrementing `paidAmount` must recompute status; current `linkPayment` only increments.
- **Tax line timing** — generate WHT lines in the line editor, not at post time, so users see the full entry pre-post.
- **Two dashboard endpoints** — `/api/dashboard/summary` and `/api/reports/dashboard` overlap; only the latter reads `entry.type`. Consolidate during Phase 1.

### 10.3 Affected tests / helpers (must update)
- `entryRepository.test.ts` (asserts `entry.type`, `findAll('journal')`), `entryService.test.ts`, `entryCategoryRepository.test.ts`, `costCenterRepository.test.ts`, `taxCodeRepository.test.ts` — all insert/assert entry `type`.
- `test-helper.ts` — `posting_profile` INSERT includes `adjustmentAccountCode` → update when the column is dropped (Phase 7).

### 10.4 Not affected (scope guard — do NOT touch)
- `inventory_movement.type` (receipt/issue/…) and `purchaseOrderService` movement `'receipt'` — inventory movements, separate table.
- `tax_code.type` (output/input), `account.type`, `invoice.type` — unrelated enums, keep.
- Dashboard revenue/expense queries use `account.type` — unaffected.

### 10.5 Suggestions (new)
- **Partner soft-delete guard** — add usage checks (invoice, `entry_line`, purchase_order) to `partnerRepository.softDelete` in Phase 5.
- **Orphan sequences** — ✅ **DONE in Phase 1**: `entry_payment`/`entry_receipt`/`entry_adjustment`/`entry_closing` `document_sequence` rows purged by migration.
- **Invoice-generated lines get `lineType`** — keeps ledger filters uniform (Phase 5).
- **Unify payment engine** — `applyPaymentAllocation` / `reversePaymentAllocation` shared by entries + any invoice flow; drop the unused `linkPayment` `entryId` param.

### 10.6 Second-pass findings (API & data integrity)
| # | Area | Finding | Action |
|---|------|---------|--------|
| 1 | `PUT /api/entries/[id]` | Doesn't persist the new line fields (`lineType`, supplier docs) and doesn't replace payment allocations; header update also skips `costCenterId` | Extend in Phase 4/5: persist new fields, replace allocations with lines, keep `linkedInvoiceId`/`periodId` handling |
| 2 | `DELETE /api/entries/[id]` | Draft deletion leaves `entry_line_payment_allocation` rows orphaned (FKs not enforced in sql.js) | `entryRepository.deleteLines`/`delete` must also clear allocations |
| 3 | `entryRepository.mapLine` + `EntryLine` type | New columns not mapped | Add `lineType`, `supplierName`, `supplierTaxId`, `invoiceNumber`, `invoiceDate` |
| 4 | Allocation totals | Must equal the payment line amount, else the entry balances but ageing ≠ cash flow | Enforce `Σ allocations = line amount` at save/post |
| 5 | Reversal | Decrementing `paidAmount` below 0 must be blocked | Guard in `reversePaymentAllocation` |
| 6 | Payment direction | Receipt vs payment must be derived (AR account → cash debit + AR credit; AP account → AP debit + cash credit) | Make explicit in Phase 4 line generation |
| 7 | Entry header `costCenterId` | Duplicates line-level CC; keep header optional/default — line-level CC is the reporting dimension | Phase 4 note |
| 8 | Permissions | No conflict — entries actions aren't permission-gated today; `hasPermission` infra exists | Optionally gate reversal like post/cancel |
| 9 | Fiscal periods | `entry.periodId` never set (all NULL) → trial-balance-by-period returns empty; `close` doesn't validate; `postEntry` ignores status | Wire in Phase 5: auto-assign on create, enforce `open` at post, validate on close (see §7.1) |

### 10.7 Open decisions
- **Credit-note application** — the aging model treats credit/debit notes as standalone documents (excluded from receivables aging). Should payment lines support **negative allocations** (apply a credit note against an invoice), or are credit notes handled as separate documents? Recommendation: support negative allocations so a customer balance can be settled by credit note.
- **Note direction** — confirm `debit_note → AR-side`, `credit_note → AP-side` (current app convention) for §6.1 field visibility.

### 10.8 Document sequences — conflict & fix (verified)
- **Label/key mismatch:** the Document Sequences page labels `invoice_sales`/`invoice_purchase`/… but `idGenerator` actually creates rows under `sales`/`purchase`/`credit_note`/`debit_note` → invoice rows render with raw names, and the page's nicer labels never match a row.
- **Inconsistent fallback:** `sequenceRepository.getNext` returns `'ERROR_NO_SEQUENCE'` for a missing row, while `idGenerator` auto-creates one — two behaviors for the same table.
- **Orphan rows:** after the entry-type removal, `entry_payment`/`entry_receipt`/`entry_adjustment`/`entry_closing` rows are dead.
- **Fix:** one shared `ensureSequence(documentType, prefix, padding)` (idGenerator + entity creation + `getNext`); a registry `{ label, defaultPrefix, defaultPadding }` for the settings page; purge orphans in Phase 1.
- **Per-category entry numbering** — each entry category auto-creates `entry_cat_<id>` (prefix `JE-<CODE>-`); uncategorized → `entry_journal`. Per-fiscal-period numbering can build on this later (`JE-<YEAR>-<CAT>-…`).

---

## 11. Suggestions on the latest updates

### 11.1 Fiscal periods
- **Harden period close:** before closing, verify no `draft` entries fall in the period and posted entries are balanced; block close otherwise.
- **Reopen support:** `fiscalPeriodRepository` has `close` only — add an audited reopen for corrections.
- **Draft vs post split:** allow creating/editing drafts in any period, but **block posting** into closed/locked periods (keeps drafts preparable).
- **Optional closing entries** (year-end: revenue/expense → retained earnings) — natural successor to period close; roadmap.

### 11.2 Document sequences
- **Prefix uniqueness:** `entry.entryNumber` is UNIQUE — validate per-category prefixes don't collide at category save / `ensureSequence`.
- **Sanitize category code** when building `JE-<CODE>-` (no spaces/special chars).
- **Backfill on migration:** seed `entry_cat_<id>` rows for **existing** categories, not only new ones.
- **Number preview:** the entry form shows the next number (`JE-SALES-000042`) once a category is picked.
- **Settings page grouping:** group rows (Invoices / Entries / Movements) using the registry.

### 11.3 Profile → category & AR/AP
- Profile category picker shows only **active** categories.
- Chart of Accounts shows a **warning icon** when an account's `partnerRole` contradicts active-profile AR/AP usage (proactive, not only save-time).
- **One-time migration audit** to flag existing accounts used as AR/AP in profiles but flagged differently.

### 11.4 General
- **Seed defaults:** default entry categories (Sales, Purchases, Payments, Receipts, Adjustments, Closing) + their sequences + a default posting profile, so the app works out of the box.
- **Phase-10 test list:** `ensureSequence` idempotency, per-category numbering, period enforcement, close validation, AR/AP contradiction guards.

---

## 12. Suggestions — third pass (money accuracy, setup, performance, reports)

> Verified against code before writing: entries already use optimistic locking (`WHERE id=? AND version=?`); `agingService` reads `invoice.totalAmount - paidAmount`; notification + audit-log infra already exists.

### 12.1 Money accuracy (must-have)
- **Rounding strategy for tax lines (the penny problem):** `base × rate` rarely lands clean. Compute tax **per line**, round to 2 decimals, allow manual tweak of the generated amount, and **validate at post** that the sum of `tax` lines matches the expected invoice tax (± $0.01). Warn, never silently post a wrong total. Decide now — it shapes the Phase 4 "Generate tax line" math.
- **Allocation ≤ remaining balance:** block a payment allocation that exceeds the invoice's remaining balance (`totalAmount - paidAmount`); optionally allow explicit overpayment with a flag. Protects ageing from negative balances and `paidAmount > totalAmount`.
- **Posted entries are immutable:** once `posted`/`cancelled`, `PUT /api/entries/[id]` refuses edits to lines/header ("Reversal required"). Only `draft` entries are editable. One guard in the API — the plan already builds reversals.

### 12.2 Setup & adoption
- **Opening Balance entry:** a seeded "Opening Balance" category + one-time flow that posts existing balances (debit assets, credit liabilities/equity, totals equal). Without it a fresh deployment reports all-zero balances. Small addition, big adoption value.
- **Numbering policy — gaps are fine, no reuse:** a cancelled entry keeps its number; the next entry takes the next number. Never reuse (auditors expect gap-free sequential numbering; reusing looks like fraud-fixing). Lock this policy into the plan.
- **Migration safety:** take a timestamped `erp.sqlite.bak-…` snapshot before every migration (the project already follows this pattern), and after migrating print an **audit report** of what changed (e.g. "3,214 entries backfilled, 12 orphan sequences removed, 2 AR/AP flag contradictions — see list").

### 12.3 Performance & integrity
- **Indexes for the new query paths** (see updated §4 list): `entry_line(entryId)`, `entry_line(vatCodeId)`, `entry(categoryId)` on top of the existing planned ones — the new partner ledger, cost-center ledger, tax summary and category filter would otherwise scan full tables on a year of data.
- **Keep + test optimistic locking:** `entryRepository` already updates with `WHERE id=? AND version=?` and the API passes `body.version`. Preserve it in the new flows (line editor, payment lines, allocations) and add one version-conflict test (two users editing the same draft → second gets "conflict", not silent overwrite).
- **Audit log on the entry lifecycle:** log create / edit / post / cancel / reverse via the existing `audit_log` infra (verified). Reversals and period reopens are only safe when every action leaves a trail.

### 12.4 Reports & UX payoff (the reward for the new columns)
- **Partner ledger + cost-center ledger reports:** the `businessPartnerId` / `costCenterId` / `lineType` columns exist to power these. Add as an explicit Phase (extend Phase 9): partner ledger = all lines for one partner split by line type with running balance; cost-center ledger = all lines for one CC/sub-CC for CC P&L. Otherwise the columns are data with no payoff.
- **Search by partner + invoice number on the entries page:** today search matches only `entryNumber` + `description` (verified). Extend to the partner name (via the new `businessPartnerId`) and the linked invoice number. Small change, daily-usage win, exercises the new joins.
- **Ageing stays invoice-driven — one source of truth:** `agingService` reads `invoice.totalAmount - paidAmount` (verified). Keep it — allocations **write** `paidAmount`, ageing **reads** it, reversal decrements with a floor of 0. Do NOT build a parallel ageing path off `entry_line`.

### 12.5 Roadmap only (not v1)
> **Priority note (owner):** Bank reconciliation and Multi-currency are **NOT a priority** — do not plan them, do not schedule them. The items below are listed for completeness only; the first two are effectively parked/out of scope.

- **Bank reconciliation — NOT a priority (parked):** match payment lines against bank statements (cleared/uncleared). Separate module, do NOT scope into the entries upgrade. Only revisit if explicitly requested.
- **Multi-currency — NOT a priority (parked):** per-line `currencyCode` + rate + FX gain/loss lines touches every money field — standalone project. Do not build; the payment engine keeps amounts in minor units so a future currency field *could* be added without rework, but no work is planned.
- **Attachments:** attach invoice PDFs / receipts to entries. Independent of the core flow. (Low priority, optional later.)
- **Draft autosave:** localStorage autosave of in-progress line-editor drafts. Polish item (low priority, only if time allows).

### 12.6 If you only take 5 from this pass
1. Rounding/penny rule (§12.1) — shapes the tax-line math
2. Allocation ≤ remaining balance (§12.1) — protects ageing
3. Posted = immutable (§12.1) — accounting integrity
4. Indexes (§12.3) — future-proof the new reports
5. Opening Balance category (§12.2) — day-one adoption
