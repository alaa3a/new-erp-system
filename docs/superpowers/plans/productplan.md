# Product Page & Product Profile Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restyle the Product page (rename Node Type → Product Type, remove table icons, remove "Add Group" button, 50/50 modal first row, all selects → `SearchSelect` style) AND make the **Product Profile the single source of truth for posting** — it carries all accounts (Sales, Purchase, Inventory, COGS, AR, AP, VAT Out, VAT In, Cash, Discount) + cost center + VAT types; posting_profile and tax-code posting accounts are retired.

**Primary files:**
- `src/app/(admin)/products/page.tsx`
- `src/app/(admin)/settings/product-profiles/page.tsx`
- `src/lib/repositories/productProfileRepository.ts`
- `src/lib/services/invoiceService.ts`
- `src/lib/db.ts`
- `src/types/erp.ts`
- `src/components/products/ProfileSelector.tsx`

---

## Part A — Product Page UI Restyle

### Task 1: Remove "Add Group" header button

**Files:**
- Modify: `src/app/(admin)/products/page.tsx`

**Changes:**
- Delete the `Add Group` button in the page header (currently uses `<Folder />` icon + `openAddRoot(true)`).
- Keep only the `Add Product` button.

**Note:** Groups are still creatable — the modal now has Product Type = "Group" (see Task 3), so no functionality is lost.

### Task 2: Remove folder + product icons in table rows

**Files:**
- Modify: `src/app/(admin)/products/page.tsx`

**Changes:**
- In `renderProductRows`, remove the icon rendering block that switches between `FolderOpen`/`Folder` (groups) and `Package` (sellable items).
- Keep the expand/collapse chevron (`ChevronDown`/`ChevronRight`), code (mono), name, parent hint, and Low Stock badge.

### Task 3: Restructure Add/Edit Product modal

**Files:**
- Modify: `src/app/(admin)/products/page.tsx`

**Changes:**
- **First row (grid-cols-2, 50/50):**
  - Left: `Parent Group` — replace the custom dropdown (lines ~587–651) with shared `SearchSelect`.
    - Options: `groupOptions` mapped to `{ id, label: `${code} — ${name}` }`.
    - `noneLabel="None (Top-level)"`.
    - `onChange` still sets `parentId` and regenerates suggested code via `generateSuggestedCode`.
  - Right: `Product Type` — replace the native `<select>` with `SearchSelect`.
    - Options: `{ id: 'group', label: 'Group' }`, `{ id: 'stock', label: 'Stock Item' }`, `{ id: 'service', label: 'Service' }`.
    - Keeps the "locked" state message when editing a group that still contains sub-items.
- **Second row:** `Code` field moved here (currently shares a 2-col grid with Node Type).
- Rename label `Node Type` → `Product Type`.
- Rename option text `Group (folder)` → `Group` everywhere it appears (select options + locked hint text).

**Modal title behavior:** stays dynamic (`Add Group` / `Add Product` / `Add Sub-Item` / `Edit Product`) based on form state — unless user requests fixed "Product" title.

### Task 4: Convert remaining native selects to SearchSelect

**Files:**
- Modify: `src/app/(admin)/products/page.tsx`

**Changes:**
- `Default Warehouse` (native `<select>`): → `SearchSelect`
- `Tax Situation — Sales` and `Purchase`: → `SearchSelect` (filtered to `t.isActive && !t.isGroup`)
- `noneLabel="-- Select --"` / `"-- None --"` respectively.

**Bonus:** all converted selects gain built-in search/filtering via `SearchSelect`.

---

## Part B — Product Profile as Posting Source of Truth

### Task 5: Extend `product_profile` data model

**Files:**
- Modify: `src/lib/db.ts` (CREATE TABLE + migration ALTERs)
- Modify: `src/lib/repositories/productProfileRepository.ts` (create/update/getPreset)
- Modify: `src/types/erp.ts` (`ProductProfile` interface)

**Changes — new nullable columns (FK → `account(id)`):**
- `arAccountId`, `apAccountId`, `vatOutputAccountId`, `vatInputAccountId`, `cashAccountId`, `discountAccountId` (sales/purchase/inventory/cogs `_AccountId` already exist)
- Keep: `defaultCostCenterId`, `salesVatCodeId`, `purchaseVatCodeId`
- **Remove profile economics:** `itemType`, `unitOfMeasure`, `defaultSalesPrice`, `defaultPurchasePrice`, `defaultWarehouseId`, `reorderPoint` are no longer profile fields (user: "no need for other data be in profile"). They move out of profile CRUD; products keep their own manual fields.

**Migration notes:**
- `ALTER TABLE product_profile ADD COLUMN ...` for each new account column (idempotent `try/catch`).
- Backfill: no data migration needed — new columns start NULL, resolved to seeded defaults at posting time.

### Task 6: Product Profile settings page — accounts-only form

**Files:**
- Modify: `src/app/(admin)/settings/product-profiles/page.tsx`

**Changes:**
- Form fields become: Code, Name, Description (keep) + the **account selectors**.
- **Account selectors use EXACTLY the entry-page account-select pattern:**
  1. Options built via `buildAccountHierarchyOptions(accounts, a => \`${a.code} — ${a.name} (${a.type})${!a.isActive ? ' (inactive)' : ''}\`)` from `@/lib/accountTree` — parent + inactive accounts rendered `disabled` (bold, non-selectable), leaves selectable, tree `indent` applied.
  2. Rendered with the shared `SearchSelect` component (`placeholder="Select account..."`, `searchPlaceholder="Search accounts..."`, `notFoundLabel="No accounts found"`, `value` = account **code** string, `onChange` → stores `accountId`).
  3. Below the select, render the **linked-dimension hint** exactly like `LineEditorModal.tsx:184-199`:
     - AR/AP account → blue badge `Requires partner — AR/AP account`
     - `linkType === 'cost_center'` → purple pill `Link2 icon — Linked to Cost Center: code — name` (or linked cost-center name when account has `linkType='cost_center'`)
     - `linkType === 'partner'` with filter → `Customers only` / `Vendors only`
     - `linkType === 'employee'` → `Linked to Employees`
     - no link → gray `No linked dimension`
  - Fields: Sales, Purchase, Inventory, COGS, AR, AP, VAT Out, VAT In, Cash, Discount (10 account selects).
- **All other selects follow the entry-page Category-select pattern** — options as simple `{ id, label }` lists and rendered via the shared `SearchSelect`:
  - **Cost center selector** for the auto-entry default — options `{ id, label: `${code} — ${name}` }` (like `categoryOptions`/`costCenterOptions` in entries page), `noneLabel` as needed.
  - **VAT type selectors** (sales/purchase) — options `{ id, label: `${code} — ${name} (${rate}%`, groupLabel: <tax group name> }` so they render grouped, exactly like `taxTypeOptions` in the entries page.
  - No native `<select>` anywhere on the profile page.
- Remove pricing/UOM/warehouse/reorder fields from the form.

### Task 7: Product modal — profile picker + read-only account display

**Files:**
- Modify: `src/components/products/ProfileSelector.tsx` — apply profile account fields on select (extends preset payload).
- Modify: `src/app/(admin)/products/page.tsx`

**Changes:**
- Keep the `ProfileSelector` (single dropdown). When a profile is chosen:
  - Apply account IDs + cost center + VAT types to the product form data.
- Show the profile's **saved accounts as read-only data** (no account dropdowns anywhere in the product form):
  - Sales / Purchase / Inventory / COGS / AR / AP / VAT Out / VAT In / Cash / Discount.
  - Each row: account name + linked target if any (→ Cost Center / Customers / Vendors / Employees).
- Manual/other fields (prices, UOM, VAT, warehouse, reorder, type) remain editable per-product (user: "other data put it manually").

### Task 8: Posting engine reads profile accounts

**Files:**
- Modify: `src/lib/services/invoiceService.ts` (previewPosting + postInvoice)
- Modify: `src/app/api/invoices/[id]/post/route.ts` if needed

**Changes:**
- Resolve accounts per line at post time from the product chain: product's own accounts → its **profile** → seeded defaults.
- **Sales line:** `Dr AR (arAccountId)` / `Cr Revenue (salesAccountId)` + `Cr VAT (vatOutputAccountId)`; **stock lines additionally** `Dr COGS (cogsAccountId)` / `Cr Inventory (inventoryAccountId)` at average cost.
- **Purchase (non-stock):** `Dr Expense (purchaseAccountId)` + `Dr VAT (vatInputAccountId)` / `Cr AP (apAccountId)`.
- **Purchase (stock):** `Dr Inventory (inventoryAccountId)` + `Dr VAT (vatInputAccountId)` / `Cr AP (apAccountId)`.
- Cost center from profile (`defaultCostCenterId`) when a line has none.
- Fix the current **empty-`accountCode` bug** (line `accountCode` was never set in the UI flow).

### Task 9: Retire posting_profile

**Files:**
- Modify: `src/lib/services/invoiceService.ts` — stop reading `posting_profile`; `postingProfileId` unused.
- Modify: `src/lib/services/postingProfileService.ts` (`resolveAr`/`resolveAp`) as needed.
- Decide + apply: keep table/schema but hide UI, or remove the posting-profiles settings page + API. (User said "later we will stop using post profiles" — do not delete schema in this phase unless approved.)

### Task 10: Verification

**Commands:**
- `npx tsc --noEmit`
- `npm run build`
- `npx vitest run` (stay green; update posting tests if they reference posting_profile)

**Manual smoke test:**
- Create a profile with all accounts; assign to a product; create + post a sales invoice → verify revenue, VAT Out, COGS/Inventory entries and cost center in the GL.
- Product modal shows read-only account list, no account dropdowns.
- All product-page selects use the searchable SearchSelect style.