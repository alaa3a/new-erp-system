# Account Links & Entry Line Editor — Upgrade Plan

> Plan for the dynamic account-linking feature and the entry line editor upgrade.
> Date: August 2026 — decisions confirmed with the product owner.
> Companion to `JOURNAL_ENTRY_UPGRADE_PLAN.md` (all 10 phases of that plan are DONE).

---

## 0. Status dashboard

| Phase | Title | Status |
|-------|-------|--------|
| 1 | Account dynamic links (cost center / partner / employee) | ✅ **DONE** (2026-08-04) — migration, repo, API, CoA Link modal, 306/306 tests |
| 2 | One-line entry header | ✅ **DONE** (2026-08-04) — Date → Category → Description → Reference #, number-preview chip, tsc clean |
| 3 | Add-line modal redesign (unified line form) | ✅ **DONE** (2026-08-04) — account-first flow, derived lineType, AR/AP guard |
| 4 | Tax-details builder (dynamic inputs on the tax type) | ✅ **DONE** (2026-08-04) — `detailsConfig` + builder UI + `taxDetailsJson` capture |
| 5 | Employee table + page + API + link tab | ✅ **DONE** (2026-08-04) — brought forward from deferred |
| 6 | Tax report details + export | ✅ **DONE** (2026-08-04) — expandable details + export block |
| 7 | Tests & validation | ✅ **DONE** (2026-08-04) — tsc clean · 318/318 tests · lint baseline-only |

> All phases implemented on 2026-08-04. Backup: `backups/project-20260804-203310.tar.gz`.

---

## 1. Confirmed decisions (2026-08-04)

| # | Topic | Decision |
|---|-------|----------|
| D1 | **General account link** | One **general link action** on the chart of accounts: an account can be linked to a **cost center**, a **partner**, or an **employee**. Stored polymorphically — the target id lives in **one shared column** (`linkId`) with a **type column** (`linkType`: `cost_center` \| `partner` \| `employee`). |
| D2 | **Entry lines carry the dimension** | Every entry line (manual **and** auto-generated from invoices) has the **account + sub-account dimension** (cost center / partner / employee). The account's link decides which dimension applies on that line. |
| D3 | **One-line header** | In the New/Edit Entry modal, header fields render on **one line in this order: Entry Date → Category → Description → Reference #** (wraps on small screens). |
| D4 | **Tax-details builder** | On the **tax type** setup, the user **dynamically creates input fields** (label + input type: text / date / number / …) — e.g. "Vendor Name (text)", "Invoice Number (text)". The line editor renders those inputs for the selected tax type. |
| D5 | **Storage for tax details** | **Config JSON on `tax_code`** (`detailsConfig`) defines which fields to collect. **Captured values**: the 4 core columns already on `entry_line` (`supplierName`, `supplierTaxId`, `invoiceNumber`, `invoiceDate`) **+ one JSON column** (`taxDetailsJson`) for user-created extras. See §4 for the JSON-vs-columns rationale. |
| D6 | **Partner type filter** | A partner link carries a **type filter** (`customer` \| `vendor` \| `both`); choosing `both` shows both types. Auto-syncs `account.partnerRole` (customer→`ar`, vendor→`ap`, both→`both`) so existing posting/validation guards keep working. |
| D7 | **Scope** | Build order P1 → P7. P5 (employees) is intentionally deferred. |
| D8 | **Line type is derived** | No Normal/Tax/Payment selector step — **one unified line form** covers all situations; `lineType` is auto-set at save (`vatCodeId` → `tax`, allocations on AR/AP → `payment`, else `normal`). API/validator contract unchanged. |
| D9 | **AR/AP guard on payments** | "Add Payment" on a **non-AR/AP account** (no `partnerRole` ar/ap/both, not an active-profile AR/AP, not partner-linked) shows a **confirmation warning** before appending the payment lines — non-blocking (Continue proceeds, Cancel stops). Optionally mirrored as a non-blocking server warning on save. |

---

## 2. Data model changes (migrations in `src/lib/db.ts`)

### 2.1 `account` — dynamic link (Phase 1)

```sql
-- polymorphic link
ALTER TABLE account ADD COLUMN linkType TEXT;             -- 'cost_center' | 'partner' | 'employee' | NULL (none)
ALTER TABLE account ADD COLUMN linkId INTEGER;            -- id in the table referenced by linkType
ALTER TABLE account ADD COLUMN linkPartnerFilter TEXT;    -- only when linkType='partner': 'customer' | 'vendor' | 'both'
-- backfill existing cost-center links
UPDATE account SET linkType='cost_center', linkId=costCenterId WHERE costCenterId IS NOT NULL;
```

- `costCenterId` stays **populated in sync** during the transition (keeps existing reports/queries/`idx_entry_line_costCenterId` working) → **dropped in a later migration** once no code reads it.
- `partnerRole` becomes derived/auto-synced from `linkPartnerFilter` (D6) but remains a real column so nothing in `entryService`/profile validation changes.

### 2.2 `entry_line` — employee + tax-details dimension (Phase 3 / 4)

```sql
ALTER TABLE entry_line ADD COLUMN employeeId INTEGER;     -- Phase 5 (or later) — employee dimension
ALTER TABLE entry_line ADD COLUMN taxDetailsJson TEXT;    -- Phase 4 — captured user-created tax fields
```

- Existing `costCenterId` + `businessPartnerId` are the cost-center / partner dimensions (no change).
- `entry.employeeId` (header-level) is **not** needed — the line is the reporting dimension.

### 2.3 `tax_code` — dynamic field config (Phase 4)

```sql
ALTER TABLE tax_code ADD COLUMN detailsConfig TEXT;       -- JSON array of field definitions
```

```json
[
  { "key": "vendorName",   "label": "Vendor Name",    "inputType": "text" },
  { "key": "invoiceNo",    "label": "Invoice Number", "inputType": "text" },
  { "key": "invoiceDate",  "label": "Invoice Date",   "inputType": "date" }
]
```

### 2.4 `employee` — new table (Phase 5, deferred)

```sql
CREATE TABLE employee (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  jobTitle TEXT,
  department TEXT,
  email TEXT,
  phone TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
```

---

## 3. Implementation phases

### Phase 1 — Account dynamic links (CoA) ✅ DONE (2026-08-04)
- [x] Migration (§2.1) + backfill (`costCenterId` kept in sync; `partnerRole` reset to `none` when a partner link is cleared).
- [x] `types/erp.ts`: `Account` gains `linkType`, `linkId`, `linkPartnerFilter` (`costCenterId` kept).
- [x] `accountRepository`: map/persist the new fields; `linkAccount(id, { type, linkId, partnerFilter }, version)`; `cascadeLink` covers all types; `linkCostCenter` kept as a back-compat wrapper; `getCostCenterId` kept.
- [x] `validators/account.ts` + `/api/accounts` (POST/PUT + `action: 'link'`) + audit log (link fields logged on both `link` and legacy `linkCostCenter`).
- [x] **CoA page**: "Link CC" action → **"Link"** modal with tabs **Cost Center | Partner | Employee**; table column renamed **Linked To**; restore flow re-links the general link; form warns when editing a partner-linked account.
  - CC tab: unchanged behavior (top-level CCs, cascade confirm, descendants).
  - Partner tab: type filter selector (Customer / Vendor / Both) → partner list filtered accordingly; auto-syncs `partnerRole` (customer→ar, vendor→ap, both→both); contradiction warning logic kept.
  - Employee tab: shown but **disabled — "Coming soon"** (Phase 5).
- [x] Validation: `tsc` clean, **306/306 tests** green (11 new link tests), eslint no new issues beyond baseline, review feedback applied.

### Phase 2 — One-line entry header ✅ DONE (2026-08-04)
- [x] `entries/page.tsx` create/edit modal: header is one row — **Entry Date → Category → Description → Reference #** in the confirmed order (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`, wraps responsively), inside a subtle card strip.
- [x] Live number-preview chip (`JE-<CODE>-NNNNNN`) kept — now a bordered chip below the strip, shown when a category is picked.
- [x] Validation: `tsc` clean, eslint no new issues (both remaining hits are pre-existing).

### Phase 3 — Add-line modal redesign (unified line form) ✅ DONE (2026-08-04)
> **Decision D8 (2026-08-04): no type selector; progressive form.** The flow is strictly: **① select the account → ② the linked dimension selector appears (if the account is linked) → ③ suitable action buttons appear (Add Payment / Add Tax)**. `lineType` is **derived**, not picked (see last bullet).
- [x] **Step ① — Select the account first** (search). Account options show a **link badge** ("🔗 CC / Partner / Employee"). No type selector, no dimension selector, no action buttons until an account is chosen.
- [x] **Step ② — Linked dimension selector (D2) — appears only if the account is linked**; the matching selector is shown and enabled, everything else hidden:
  - Account link `cost_center` → **CC picker** — the linked root is shown as a **non-selectable header**, and ONLY its **sub cost centers (all levels, tree-indented)** are offered; **parent cost centers are shown but not selectable**; falls back to the root itself when it has no subs.
  - Account link `partner` → **partner picker** filtered by `linkPartnerFilter` (replaces the AR/AP-only partner rule for linked accounts).
  - Account link `employee` → **employee picker** (Phase 5).
  - No link → no dimension selector.
- [x] **Step ③ — Suitable action buttons appear** (contextual, after account selection):
  - **"Link Invoices" (was "Add Payment")** — shown for AR/AP control accounts / partner-linked lines. Clicking **validates the line first** (partner, then amount — inline messages if missing; D9 warning on non-AR/AP accounts) → opens the invoices panel: open invoices show **Original · Paid before · Remaining · To pay** with a live **"Linked X of Y (payment)"** check that must equal the payment amount (matches the server rule) → **"Link & Finish"** attaches the allocations to the **original line** (it becomes the `payment` line) — **no duplicate payment line, no auto cash line** (the cash/bank line is added manually). Posting applies allocations → `paidAmount` → ageing ✅.
- [x] **AR/AP guard on linking payments (D9)** — before the invoices panel opens, if the selected account is **not AR/AP** (no `partnerRole` ar/ap/both, not used as AR/AP in an active posting profile, not partner-linked) → **confirmation warning**: "This account is not an Accounts Receivable/Payable account — payment allocations update invoice ageing. Continue anyway?" → **Continue** opens the panel, **Cancel** stops (non-blocking).
  - **"Add Tax"** — expands the tax sub-panel: tax **group** picker → tax **type** picker (filtered to that group) → base amount (prefilled from the line amount and kept in sync) → live computed tax → **dynamic details inputs** (from `detailsConfig`, Phase 4) → **"Add Tax Lines" appends the BASE line + the computed `tax` line together** (base = tax base, tax = base × rate on the tax account) and closes the modal; the base side follows the line's chosen side (input → debit / output → credit default), existing allocations are preserved when editing, and the tax line only inherits the base line's dimensions when the tax account shares the same link root.
- [x] **Derived `lineType` in `handleSave`** — auto-set per line (`vatCodeId` set → `tax`; allocations present → `payment`; else `normal`); no type picker anywhere in the UI; the API/validator contract stays unchanged.
- [x] **Auto-generated lines inherit the account link** (D2): `invoiceService.postInvoice` and the invoice posting path set the revenue/expense line's dimension from its account's link when present (cost center today; partner/employee later).

> **Refinements (2026-08-05)** — post-implementation polish from product feedback:
> - **Cost-center picker** — subs only: the dropdown shows the linked root as a **non-selectable header**, then only its **sub cost centers at every level** (tree-indented); **parent cost centers are shown but not selectable**; root itself becomes selectable when it has no subs.
> - **"Linked to" badge** — now shows the **actual linked entity**: `Linked to Cost Center: CC-01 — Administration`, `Linked to Partner (customers & vendors)` (or a specific partner name when `linkId` is set), `Linked to Employee` (+ name when set).
> - **Tax details are config-only** — the Add Tax panel renders **only the fields configured on the tax type** (`detailsConfig`); keys matching the typed columns (`supplierName`, `supplierTaxId`, `invoiceNumber`, `invoiceDate` — camelCase **and** snake_case variants) map to those columns, everything else lands in `taxDetailsJson`.
> - **Tax Setup quick-add** — the details editor gained **quick-add chips** (Supplier Name / Supplier Tax ID / Invoice # / Invoice Date) that insert the exact core keys so supplier/invoice data stays reportable.
> - **Tax line generation fixed** — "Add Tax Lines" now creates the **base line + tax line together** (previously it appended only the tax line and left the modal open, producing unbalanced entries); dimensions carry to the tax line only when the tax account shares the same link root, and a missing posting account is surfaced at generation time.
> - **Visual pairing** — generated tax lines render with an **amber tint + "auto" chip** in the entry form table, the expanded entry view, and the view-detail modal, so the tax line reads as part of its base line.
> - **Payment-linking redesign (2026-08-05)** — payments are now **linked, not generated**:
>   - The **line the user builds IS the payment line** — "Link & Finish" attaches the invoice allocations to it (`lineType: payment`, `generated` grouping flag); **no duplicate clearing line** is created.
>   - **No cash line is auto-generated** — the cash account picker and `resolveCashAccount` were removed; the user adds the bank/cash line manually.
>   - **Validation on click** — "Link Invoices" validates account → partner → amount before the panel opens (inline messages); the D9 AR/AP warning still guards non-AR/AP accounts.
>   - **Partner on the line** — the partner picker now also appears for **posting-profile AR/AP accounts** (customers for AR / vendors for AP), not only partner-linked accounts.
>   - **Invoices table** — **Original / Paid before / Remaining / To pay** columns with a live balance check; "Link & Finish" stays disabled until the linked total **exactly equals the payment amount**.
>   - **WHT picker removed (2026-08-05)** — the "WHT Tax (optional)" selector was dropped from the Link Invoices panel together with its auto-generated WHT tax line; WHT is now only ever added via the **Add Tax** panel as a regular tax line. Partner switches still reset stale allocations, and the payment line explicitly clears tax fields so it is never misclassified.
>   - **Add Line layout (2026-08-05)** — the line editor's top section is now two rows: **row 1 = Account + the "Linked to …" badge** side by side (the badge appears once an account is selected), **row 2 = Description + Amount (Dr/Cr)**.

### Phase 4 — Tax-details builder (dynamic inputs) ✅ DONE (2026-08-04)
- [x] Migration: `tax_code.detailsConfig` (§2.3).
- [x] `taxCodeRepository`/validator/API map + validate `detailsConfig` (array of `{key, label, inputType}`; keys unique; inputType in `text|date|number`).
- [x] **Tax setup page**: "Details fields" editor in the tax-type form — add rows (label + input type), reorder, remove; preview chip of how they'll render. **Quick-add chips** (2026-08-05) insert the standard supplier/invoice fields with their exact core keys.
- [x] Line editor tax step renders the selected type's fields (text/date/number inputs).
- [x] `entry_line.taxDetailsJson` persisted via `entryRepository`/API/validators; the core 4 columns keep their mapping.
- [x] `entryService.validateReferences` stays compatible (extra detail keys not validated strictly — free-form per config).

### Phase 5 — Employees ✅ DONE (2026-08-04, brought forward from deferred)
- [x] `employee` table (§2.4) + repository + validators + `/api/employees` + settings/business-partners-style page.
- [x] `entry_line.employeeId` + employee tab active in the Link modal + employee picker in the line editor + ledger `employeeId` filter + report dimension.

### Phase 6 — Tax report details + export ✅ DONE (2026-08-04)
- [x] `reportingService.getTaxSummary` returns captured details (supplier name, tax ID, invoice #/date + `taxDetailsJson` extras) alongside the VAT sums.
- [x] Tax-summary page: expandable per-row details + export (`exportService.taxSummary`) includes them.

### Phase 7 — Tests & validation ✅ DONE (2026-08-04)
- [x] Repository/service tests: link polymorphic CRUD + backfill, partner-filter sync, dynamic tax-field capture, entry-line dimension enforcement.
- [x] `npx tsc --noEmit`, `npx vitest run`, `npx eslint` on touched files, `git diff --stat` sanity check.

---

## 4. Tax details storage — JSON vs columns (rationale)

| Concern | 4 core columns (`supplierName`, `supplierTaxId`, `invoiceNumber`, `invoiceDate`) | `taxDetailsJson` (user-created extras) | Config JSON on `tax_code.detailsConfig` |
|---------|--------------------------|----------------------|-------------------|
| SQL query / GROUP BY / filter in reports | ✅ native | ⚠️ `json_extract` only | n/a |
| Indexable | ✅ | ❌ | n/a |
| Add a field without migration | ❌ | ✅ | ✅ |
| Rendering dynamic inputs in the editor | ✅ fixed | ✅ read config | ✅ source of truth |
| Export to CSV/XLS | ✅ | ⚠️ flatten or per-field | n/a |

**Rule:** *config* is JSON (flexible, one place, editable by the user on the tax page); *captured values* use **typed columns for the reportable core + one JSON column for anything the user invented**. Pure-JSON everywhere is simpler to ship but weak for the tax report, ledger filters and exports.

---

## 5. Suggested build order

1. ✅ Plan agreed (2026-08-04) — this document.
2. ✅ **P1** account links (risk: medium — touches the account save path; foundation for everything else).
3. ✅ **P2** one-line header (low risk, quick UI win).
4. ✅ **P3** unified line editor (derived `lineType`) + account-link-driven enable/disable (largest UI chunk).
5. ✅ **P4** tax-details builder + `taxDetailsJson` (depends on P3's tax step).
6. ✅ **P6** tax report details + export (depends on P4).
7. ✅ **P5** employees — deliberately last / deferred.
8. ✅ **P7** full validation (tsc + vitest + eslint + review).

---

## 6. Open items (tracked)

- **Employee scope** — confirm fields for the `employee` table when Phase 5 starts (code, name, department, job title, email, phone?).
- **Partner link semantics detail** — "link to a partner type filter" (D6) is the working assumption; revisit if a single-specific-partner link is wanted instead.
- **Auto-generated lines** — apply the account link dimension in invoice posting (P3); decide whether to backfill existing posted lines (suggest: no — leave history as-is).
- **Drop `account.costCenterId`** — only after every read path (repos, ledger, exports, tests) is on the link fields.
