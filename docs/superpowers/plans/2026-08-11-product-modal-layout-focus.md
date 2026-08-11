# Product Modal Layout + Global Focus + COA Column Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Add Product modal layout (Active into row 1, Description+Warehouse 50/50, UOM/Prices/Reorder on one line, Profile restyled as last row), add a global blue focus highlight for all inputs, and reorder the COA table columns (Used In after Linked To).

**Architecture:** Pure UI changes. Products modal in `src/app/(admin)/products/page.tsx`, ProfileSelector trigger restyle in `src/components/products/ProfileSelector.tsx`, one global CSS rule in `src/app/globals.css`, COA column reorder in `src/app/(admin)/accounting/chart-of-accounts/page.tsx`. No DB/API/service/type changes.

**Tech Stack:** React 19, Tailwind CSS v4, Next.js App Router, existing SearchSelect/ProfileSelector components.

## Global Constraints

- Do NOT touch DB schema, API routes, services, repositories, or validators.
- No new dependencies. Use existing lucide icons and Tailwind classes.
- Do NOT add code comments unless surrounding style requires them.
- Files use NO semicolons (products page, COA page) — ProfileSelector uses semicolons. Match each file's own style.
- Colors/money/entries logic unchanged. This is layout/style only.
- `npx tsc --noEmit` must be clean after each task — revert generated `next-env.d.ts` churn with `git checkout -- next-env.d.ts`.
- Full test suite is `npx vitest run` (currently 440 passing). No test files change in this plan.

---

### Task 1: Global blue focus highlight for all inputs

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: Tailwind v4 theme variables `--color-brand-500` (already defined at `globals.css:47`)
- Produces: app-wide focus ring on `input`, `select`, `textarea`

- [ ] **Step 1: Add the global focus rule**

Open `src/app/globals.css`. Add this block at the END of the file (after the existing rules, no comments):

```css
:is(input, select, textarea):focus {
  outline: none;
  border-color: var(--color-brand-500);
  box-shadow: 0 0 0 2px rgb(70 95 255 / 0.2);
}
```

- [ ] **Step 2: Verify tsc + a text replace**

Run: `npx tsc --noEmit`
Expected: no output (clean). Then `git checkout -- next-env.d.ts`.

Note: this rule is additive — existing `focus:ring-brand-500/20 focus:border-brand-500` classes produce the same visual, so no conflicts.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style: global blue focus highlight on all inputs"
```

---

### Task 2: Restructure Add Product modal rows

**Files:**
- Modify: `src/app/(admin)/products/page.tsx`

**Interfaces:**
- Consumes: existing `formData` state (all fields), `SearchSelect`, `ProfileSelector`, `parentOptions`, `warehouseOptions`, `lockNodeType`, `editingGroupChildCount`, `profilePreset`
- Produces: new modal layout (rows below); Profile moves to the last row, Default Warehouse + Reorder Point no longer stock-only

- [ ] **Step 1: Row 1 — add Active toggle as third column**

Find the first row block (`page.tsx:661-705`, the `grid grid-cols-2 gap-4` containing Parent Group + Product Type). Change the grid to `grid grid-cols-3 gap-4` and append the Active toggle as the third column:

```tsx
          {/* Parent + Product Type + Active — first row */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Parent Group</label>
              <SearchSelect
                options={parentOptions}
                value={formData.parentId}
                onChange={(val) => {
                  const parentId = val ? Number(val) : null
                  setFormData({ ...formData, parentId })
                }}
                placeholder="Select group..."
                noneLabel="None (Top-level)"
                searchPlaceholder="Search groups..."
                notFoundLabel="No groups found"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Product Type <span className="text-red-400">*</span></label>
              {lockNodeType ? (
                <>
                  <div className="w-full rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                    Group
                  </div>
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                    This group contains {editingGroupChildCount} sub-item{editingGroupChildCount > 1 ? 's' : ''} — move or delete them before converting it to a sellable item.
                  </p>
                </>
              ) : (
                <SearchSelect
                  options={[
                    { id: 'group', label: 'Group' },
                    { id: 'stock', label: 'Stock Item' },
                    { id: 'service', label: 'Service' },
                  ]}
                  value={formData.isCategory ? 'group' : formData.itemType}
                  onChange={(val) => {
                    const v = val ? String(val) : 'stock'
                    setFormData({ ...formData, isCategory: v === 'group', itemType: v === 'service' ? 'service' : 'stock' })
                  }}
                  placeholder="Select type..."
                />
              )}
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
              </label>
            </div>
          </div>
```

Note: the Active checkbox is duplicated here (row 1) — the old one at the bottom (`page.tsx:874-878`) must be removed in Step 4.

- [ ] **Step 2: Row 3 — Description (50%) + Default Warehouse (50%)**

Find the Description block (currently `page.tsx:723-728`, full-width `<div>`) and the stock-only Default Warehouse block (`page.tsx:850-868`). Replace the Description block with a 2-column grid pairing Description + Default Warehouse (Default Warehouse now ALWAYS shown, no `itemType === 'stock'` guard):

```tsx
              {/* Description + Default Warehouse — 50/50 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                  <textarea rows={2} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Optional description"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Default Warehouse</label>
                  <SearchSelect
                    options={warehouseOptions}
                    value={formData.defaultWarehouseId}
                    onChange={(val) => setFormData({ ...formData, defaultWarehouseId: val ? Number(val) : null })}
                    placeholder="Select warehouse..."
                    noneLabel="-- Select --"
                    searchPlaceholder="Search warehouses..."
                    notFoundLabel="No warehouses found"
                  />
                </div>
              </div>
```

Delete the OLD stock-only Default Warehouse placement — the `grid grid-cols-2 gap-4` at `page.tsx:850-868` that held Default Warehouse + Reorder Point is being dismantled (its Reorder Point half moves to Step 3).

- [ ] **Step 3: Row 4 — UOM / Sales / Purchase / Reorder on one line**

Replace the current 3-column "Prices + UOM" grid (`page.tsx:829-846`) with a 4-column grid that includes Reorder Point (now always shown):

```tsx
              {/* Unit of Measure / Sales Price / Purchase Price / Reorder Point — one line */}
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Unit of Measure</label>
                  <input type="text" value={formData.unitOfMeasure} onChange={e => setFormData({ ...formData, unitOfMeasure: e.target.value })} placeholder="pcs, kg, hrs"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Sales Price ($)</label>
                  <input type="number" value={formData.salesPrice || ''} min="0" step="0.01" onChange={e => setFormData({ ...formData, salesPrice: Number(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Purchase Price ($)</label>
                  <input type="number" value={formData.purchasePrice || ''} min="0" step="0.01" onChange={e => setFormData({ ...formData, purchasePrice: Number(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reorder Point (units)</label>
                  <input type="number" value={formData.reorderPoint || ''} min="0" onChange={e => setFormData({ ...formData, reorderPoint: Number(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                </div>
              </div>
```

Delete the entire `{formData.itemType === 'stock' && ( <> ... </> )}` wrapper that currently holds the Default Warehouse + Reorder Point 2-col grid (`page.tsx:848-870`).

- [ ] **Step 4: Row 5 — move Profile below the 4-col row**

The Profile block (`page.tsx:730-827`, ProfileSelector + collapsible table) currently sits between Description and the Prices grid. MOVE the whole `{/* Profile */}` block (ProfileSelector + `{profilePreset && (...)}` table) to AFTER the Row-4 4-col grid, keeping it inside the same `!formData.isCategory && (` fragment. Order becomes: Description+Warehouse → UOM/Prices/Reorder → Profile → group end.

Also DELETE the now-duplicated bottom Active toggle (`page.tsx:874-878`):

```tsx
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
          </label>
```

Leaving the buttons row (`Cancel` / `Save`) directly after the fragment close.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no output (clean). Then `git checkout -- next-env.d.ts`.

Run: `npx vitest run`
Expected: 440 passed.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/products/page.tsx"
git commit -m "style(products): restructure product modal to 3/2/2/4 rows, profile last"
```

---

### Task 3: Restyle ProfileSelector trigger to match Parent Group SearchSelect

**Files:**
- Modify: `src/components/products/ProfileSelector.tsx`

**Interfaces:**
- Consumes: existing `ProfileSelector` props (`value`, `onChange`, `className`)
- Produces: trigger that looks identical to the Parent Group SearchSelect (same border, bg, padding, chevron, placeholder color, focus)

- [ ] **Step 1: Restyle the trigger button**

In `ProfileSelector.tsx`, replace the trigger `<button>` class (currently line 74) with the SearchSelect-matching classes:

```tsx
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
      >
        <span className={selected ? 'text-gray-900 dark:text-white truncate' : 'text-gray-400 dark:text-gray-500'}>
          {selected ? `${selected.code} - ${selected.name}` : 'Select a profile...'}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>
```

(Matches SearchSelect's trigger: `w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm ... hover:border-gray-300 dark:hover:border-gray-600`. Focus is handled by the global rule from Task 1.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no output (clean). Then `git checkout -- next-env.d.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/components/products/ProfileSelector.tsx
git commit -m "style(products): profile selector matches parent-group select look"
```

---

### Task 4: COA table — move Used In after Linked To

**Files:**
- Modify: `src/app/(admin)/accounting/chart-of-accounts/page.tsx`

**Interfaces:**
- Consumes: `UsageCell` component and `usageMap` (unchanged — only moves position)
- Produces: column order Account | Linked To | Used In | Type | Status | Actions

- [ ] **Step 1: Reorder the header cells**

In the `<thead>` block (`page.tsx:809-817`), the current order is Account, Linked To, Type, Status, Used In, Actions. Move the `Used In` `<th>` (now at line 815) to directly follow the `Linked To` `<th>` (line 812). New order:

```tsx
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Account</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Linked To</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Used In</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="text-center py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Status</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
```

- [ ] **Step 2: Reorder the body cells**

In `renderAccountRows`, move the `{/* Used In */}` cell (`UsageCell usage={usageMap[account.code]}`, at `page.tsx:686-689`) to directly follow the `{/* Linked To */}` `<td>` (ends at `page.tsx:668`), before the `{/* Type */}` cell (line 669). The new row cell order is: Account, Linked To, Used In, Type, Status, Actions. Keep the three comment markers (`Linked To`, `Used In`, `Type`, `Status`) in their new positions.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no output (clean). Then `git checkout -- next-env.d.ts`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/accounting/chart-of-accounts/page.tsx"
git commit -m "feat(accounts): move Used In column after Linked To in COA table"
```

---

## Self-Review Notes

- **Spec coverage:** Spec item 1 (modal layout) → Task 2 (+ Task 3 for profile restyle). Spec item 2 (global focus) → Task 1. Spec item 3 (COA order) → Task 4. All covered.
- **Placeholder scan:** All steps show exact code; no "TBD"/"similar to" phrasing.
- **Type consistency:** `formData.*`, `parentOptions`, `warehouseOptions`, `profilePreset`, `UsageCell`, `usageMap` all already exist and are used with their current signatures. No new symbols introduced across tasks — each task is self-contained.
- **Global constraints respected:** no DB/API/validator changes, no new deps, no comments, uses existing Tailwind classes.