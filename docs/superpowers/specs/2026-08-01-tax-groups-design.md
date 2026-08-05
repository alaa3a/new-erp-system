# Tax Groups, Tax-Driven Posting & CoA Usage — Design

> Date: 2026-08-01
> Status: Approved (Approach 1 — `isGroup` flag on `tax_code`)

## Goal

Restructure tax setup around **Tax Groups** (containers with a filing period) and **Tax Types** (the actual VAT codes under a group, each owning its posting account), make the tax type the single source of truth for VAT posting accounts — removing VAT account fields from posting profiles and linking tax situations to products — and add a **"Used In" indicator** to the Chart of Accounts showing where each account is referenced.

## Concepts

- **Tax Group** (e.g. "VAT") — a container. Has `code`, `name`, and a **filing period**: `monthly | quarterly | annually`. No rate/account/type.
- **Tax Type** (e.g. "VAT In Sales", "VAT Out Purchase") — belongs to a group via `parentId`. Has `code`, `name`, `rate`, `type` (output/input), **posting account** (`accountCode`), and effective `from/to` dates for rate-change history.
- **Rate changes** — handled by creating a new tax type with the new rate and its own effective period (period auto-defaults to today, manually adjustable).
- **Tax situation on products** — products carry `vatCodeId` (sales) and `purchaseVatCodeId` (purchase). These are the tax types used as defaults on invoice lines.
- **VAT posting account** — comes from the **tax type's** `accountCode`, NOT from the posting profile.

## 1. Data Model & Migration

### `tax_code` table (in `src/lib/db.ts`)
Add two columns via migration (same try/catch pattern as existing migrations):
- `isGroup INTEGER NOT NULL DEFAULT 0`
- `filingPeriod TEXT NOT NULL DEFAULT 'monthly'`

Group rows: `isGroup=1`, `rate=0`, `type='output'`, `accountCode=''` (unused defaults). Code rows: `isGroup=0`, use rate/type/accountCode/parentId.

Seed: if no group exists, create a "VAT" group with `isSystemCode=1` (protected), filing period defaulting to `monthly`. Existing standalone codes remain as ungrouped codes and display under an "Ungrouped" section.

### `TaxCode` type (in `src/types/erp.ts`)
Add `isGroup: boolean` and `filingPeriod: 'monthly' | 'quarterly' | 'annually'`. Add `TaxGroup` alias type (`TaxCode` with `isGroup: true`).

### `posting_profile` table
Keep the `vatOutputCode`/`vatInputCode` columns physically (avoids risky `DROP COLUMN` migration) but stop reading/writing them in code, UI, and validators.

## 2. API / Validation

### `tax-code` validators (`src/lib/validators/taxCode.ts`)
- Add `isGroup` (boolean, default false) and `filingPeriod` (enum, default 'monthly').
- Conditional rules via `superRefine`:
  - Group requires `code` + `name` + valid `filingPeriod`.
  - Type requires `rate`, `type`, `accountCode` (non-empty), and `parentId` must point to an existing **group** (`isGroup=1`).
  - `accountCode` stays required for types (it is the posting account used at posting).

### `taxCodeRepository`
- Include `isGroup` + `filingPeriod` in `mapRow`, `create`, `update`.
- Add `findGroups()` → rows where `isGroup=1`.
- Delete protection: a group with child codes cannot be deleted.

### `posting-profile` validator (`src/lib/validators/settings.ts`)
- Remove `vatOutputCode` and `vatInputCode`.

### `postingProfileRepository` consolidation
- Remove the duplicate `postingProfileRepository` export inside `src/lib/repositories/taxCodeRepository.ts`; keep only `src/lib/repositories/postingProfileRepository.ts`. Fix the import in `src/lib/services/invoiceService.ts` (currently imports it from `taxCodeRepository`).

### `accountRepository` usage check
- Remove the `vatOutputCode`/`vatInputCode` conditions from the "is account used in posting profile?" query.

## 3. Tax Setup UI (`settings/tax-setup/page.tsx`)

- **Cleaner hierarchical table:** expandable groups; group row shows name + filing-period chip; child rows show type chip (output/input), rate, account, effective period, status.
- **Two buttons:** "Add Group" (top) and "Add Tax Type" (per-group row, like CoA's "Add Sub").
- **Group form:** code, name, filing period, active.
- **Tax type form:** parent group (first), code, name, rate, type, posting account, effective from/to, active. Rate-change workflow: create new type with new rate, period auto-set to today, manually adjustable.
- Delete protections: group with children cannot be deleted; system codes/groups protected.

## 4. Posting — VAT account from tax type (`src/lib/services/invoiceService.ts`)

In `previewPosting`, for lines with `vatAmount > 0`, look up the tax type by `line.vatCodeId` and use its `accountCode` for the VAT entry:
- Sales/debit note: VAT credit to `taxType.accountCode` (fallback `'2100'` if empty).
- Purchase/credit note: VAT debit to `taxType.accountCode` (fallback `'2200'` if empty).

Also pass `vatCodeId` through the generated entries and write it on VAT entry lines in `postInvoice` (so the entry-based tax summary can group by group).

## 5. Posting Profiles UI (`settings/posting-profiles/page.tsx`)

- Remove the VAT Output / VAT Input fields from the form (fields list, types, empty form, edit mapping, submit payload).

## 6. Invoice pages (`invoice/sales`, `invoice/purchase`, `invoice/credit-note`, `invoice/debit-note`)

- Remove `vatOutputCode`/`vatInputCode` from the local `PostingProfile` interface (4 files). Fields were never rendered, only declared.
- Update tax pickers so only **tax types** appear: filter `t.type === 'output' && !t.isGroup` (sales/debit) and `t.type === 'input' && !t.isGroup` (purchase/credit). Groups must not appear in line pickers.

## 7. Product form (`products/page.tsx`)

- Rename labels: "Sales VAT Code" → **"Tax Situation — Sales"**, "Purchase VAT Code" → **"Tax Situation — Purchase"**.
- Dropdown shows only tax types (`!t.isGroup`), active ones.
- (Labels elsewhere in the app can keep "VAT" terminology; only the product form labels change per user request.)

## 8. Purchase Orders (`purchase-orders/page.tsx`, `purchaseOrderRepository.ts`)

- Remove `vatCodeId`, `vatRate`, `vatAmount` from PO line form state, insert, and mapping.
- PO lines = product, qty, unit price, net line total. PO total = net total (no VAT column). No stored VAT on PO lines.
- The `purchase_order_line` columns stay physically in the DB (unused), same approach as the `posting_profile` VAT columns — avoids risky column drops.

## 9. Reports

### `reportingService.getInvoiceTaxSummary` (`src/lib/services/reportingService.ts`)
- For each tax code, resolve its group (`parentId` → group name + filing period).
- Return `groupName` and `filingPeriod` per row; codes without a group get `groupName: 'Ungrouped'`.
- Order by group then code.

### `report/tax-summary/page.tsx`
- Render rows **grouped by group** with group subtotals (taxable + VAT per group) and the existing grand totals.
- Add a **group filter dropdown** (All groups / pick one).

### `exportService` (`src/lib/services/exportService.ts`)
- Tax-summary export includes the group column.

## 10. Tests

- Update `test-helper.ts` posting-profile insert (remove vat columns) and tax-code insert (add isGroup/filingPeriod columns).
- Add/update: group create/edit/delete protections, type-requires-group validation, accountCode required for types, posting uses tax-type account (not profile), tax-summary grouping by group.

## 11. CoA "Used In" Indicator

### Goal
In the Chart of Accounts, show where each account is referenced in **settings** (posting profiles, tax codes) via a **badge-chips column with a hover tooltip** showing full usage details. Actual transactions (entries, invoices, PO lines) are NOT counted.

### Repository (`src/lib/repositories/accountRepository.ts`)
Add `getUsageMap()` returning `Record<code, AccountUsage>`:
```ts
interface AccountUsage {
  postingProfiles: { name: string; role: string }[]  // role: AR/AP/VAT Out/VAT In/Cash/Discount/Inventory/COGS/Adjustment
  taxCodes: string[]        // tax code names using this account
}
```
- Single-pass query over `posting_profile` building per-code usage from all account fields.
- Single-pass query over `tax_code` (accountCode).
- Add the `AccountUsage` interface to `src/types/erp.ts`.

### API (`GET /api/accounts`)
Return `{ success, data: accounts, usage: <usageMap> }` — same single fetch, no new endpoint.

### CoA Page (`src/app/(admin)/accounting/chart-of-accounts/page.tsx`)
- New **"Used In"** column with chips:
  - **Posting Profile** (blue) if `postingProfiles.length > 0`
  - **Tax** (purple) if `taxCodes.length > 0`
  - Gray "—" if not referenced in any setting
- **Hover tooltip** (lightweight custom hover popover, positioned near the chips) showing: posting profile names with role and tax code names.
- Read-only indicator — no change to edit/delete/toggle logic.

## Out of Scope

- Physically dropping `vatOutputCode`/`vatInputCode` columns (kept but unused).
- `getTaxSummary` (entry-based) full group reporting beyond setting `vatCodeId` on VAT entry lines.
- Using the CoA usage data to change delete/edit behavior (usage is informational only).
