# Product Modal — Code/Name Layout + Profile Data Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Add/Edit Product modal: put Code (25%) + Name (75%) on one row, remove the manual Tax Situation row, and show ALL product-profile data (including the Sales/Purchase tax types) in a clean table below the profile selector.

**Architecture:** Pure UI changes to `src/app/(admin)/products/page.tsx`. No DB, API, service, or type changes. Data comes from the existing `accountMap` (id → `Account`) and the already-fetched `taxCodes` state (via a new `taxCodeMap`). The profile API already returns `salesVatCodeId`/`purchaseVatCodeId` and the 8 account ids; the `ProfileSelector` + `fetchProfilePreset` already populate `profilePreset`.

**Tech Stack:** React 19, Tailwind CSS, Next.js App Router, existing `SearchSelect`/`ProfileSelector` components.

## Global Constraints

- Do NOT touch DB schema, API routes, services, repositories, or validators. This is modal UI only.
- Keep the existing `body.taxCodeId`/`body.purchaseVatCodeId` save fields (line ~281–282) — tax still lives on the product columns, prefilled from the profile.
- Keep the profile→product tax copy in the `ProfileSelector` `onChange` handler (lines ~726–731).
- Keep the existing link-type hints (Requires partner / Linked to Cost Center / Linked to Employees) in the table rows.
- Do NOT add any new dependencies. Use existing lucide icons and Tailwind classes already used in the file.
- Do NOT add code comments unless the existing style requires them.
- Follow the file's existing 2-space, single-quote-free style (it uses no semicolons, double quotes in JSX props as shown).

---

### Task 1: Merge Code + Name onto one row (25% / 75%)

**Files:**
- Modify: `src/app/(admin)/products/page.tsx:687-699`

**Interfaces:**
- Consumes: `formData.code`, `formData.name` (existing state)
- Produces: one grid row — Code column 1, Name spans columns 2–4

- [ ] **Step 1: Replace the two standalone Code and Name blocks**

Locate the current separate `{/* Code */}` block and `{/* Name */}` block. Replace both with a single row:

```tsx
          {/* Code + Name — Code 25% / Name 75% */}
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Code</label>
              <input type="text" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. PR-001"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
            </div>
            <div className="col-span-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name <span className="text-red-400">*</span></label>
              <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder={formData.isCategory ? 'Group name, e.g. Electronics' : 'Product name'}
                className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${!formData.name.trim() ? 'border-red-300' : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'}`} />
            </div>
          </div>
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Visual smoke check**

Run: `npm run dev`, open Products page → Add Product. Verify Code and Name share one row with Code on the left (~25% width) and Name taking the remaining ~75%. Name required-asterisk and red-border-on-empty behavior preserved.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/products/page.tsx"
git commit -m "style(products): code 25% / name 75% on one row in product modal"
```

---

### Task 2: Remove the Tax Situation row

**Files:**
- Modify: `src/app/(admin)/products/page.tsx:821-846`

**Interfaces:**
- Consumes: nothing removed from state/API — `formData.vatCodeId`, `formData.purchaseVatCodeId` stay (still saved in `handleSave` and prefilled from profile)
- Produces: no tax pickers in the modal

- [ ] **Step 1: Delete the tax row**

Locate the block inside the `formData.itemType === 'stock'` conditional that contains `Tax Situation — Sales` and `Tax Situation — Purchase` SearchSelects. Delete the entire `<div className="grid grid-cols-2 gap-4">...</div>` wrapping both `SearchSelect`s (the second grid in the stock section).

Keep the `defaultWarehouse` / `Reorder Point` grid above it intact.

- [ ] **Step 2: Verify `taxTypeOptions` usage**

After deletion, `taxTypeOptions` should no longer be referenced anywhere in the JSX. If `tsc`/build flags it as unused, remove the `taxTypeOptions` useMemo (lines ~491–494) too.

Run: `npx tsc --noEmit`
Expected: no output (clean). If `taxTypeOptions` becomes unused, remove its `useMemo` and re-run.

- [ ] **Step 3: Verify tax still saved + prefilled**

Confirm `handleSave` still sends `body.taxCodeId = formData.vatCodeId` and `body.purchaseVatCodeId = formData.purchaseVatCodeId` (lines ~281–282), and the `ProfileSelector` `onChange` still sets `vatCodeId`/`purchaseVatCodeId` from `preset.salesVatCodeId`/`preset.purchaseVatCodeId` (lines ~726–731). No change needed if both present.

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/products/page.tsx"
git commit -m "feat(products): remove manual tax pickers from product modal (tax comes from profile)"
```

---

### Task 3: Show full profile data in a table below the profile selector

**Files:**
- Modify: `src/app/(admin)/products/page.tsx:479-494` (add `taxCodeMap` memo)
- Modify: `src/app/(admin)/products/page.tsx:738-778` (replace read-only box with table)

**Interfaces:**
- Consumes: `profilePreset` (object of 8 `Account` ids), `accountMap` (Map<number, Account>), `taxCodes` state (TaxCode[]), `costCenterMap`
- Produces: `taxCodeMap` = `Map<number, TaxCode>`; a `ProfileDataTable` rendering 10 rows (2 tax + 8 accounts) plus profile code/name/description header

- [ ] **Step 1: Add `taxCodeMap` memo**

After the existing `taxTypeOptions` memo (or in place of it, if removed in Task 2), add:

```tsx
  const taxCodeMap = useMemo(() => {
    const map = new Map<number, TaxCode>()
    for (const t of taxCodes) map.set(t.id, t)
    return map
  }, [taxCodes])
```

Note: if `taxTypeOptions` was removed in Task 2, place this memo where it was. `TaxCode` is already imported at the top of the file.

- [ ] **Step 2: Replace the read-only accounts box with the full profile table**

Locate `{profilePreset && (` ... `)}` (currently the "Posting accounts (read-only, from profile)" box). Replace its entire body with:

```tsx
                {profilePreset && (
                  <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Profile — {profileCode}</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{profileName}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowProfileTable(!showProfileTable)}
                        className="p-1.5 text-gray-400 hover:text-brand-500 transition-colors"
                        aria-label={showProfileTable ? 'Hide profile data' : 'Show profile data'}
                      >
                        {showProfileTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                    {showProfileTable && (
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {profileDescription && (
                          <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{profileDescription}</div>
                        )}
                        {profileTableRows.map(row => {
                          if (row.type === 'tax') {
                            const tax = row.id != null ? taxCodeMap.get(row.id) : undefined
                            return (
                              <div key={row.label} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                                <span className="text-gray-400 shrink-0">{row.label}</span>
                                <span className="text-gray-700 dark:text-gray-300 font-medium text-right">
                                  {tax ? `${tax.code} — ${tax.name} (${tax.rate}%)` : '—'}
                                </span>
                              </div>
                            )
                          }
                          const acc = row.id != null ? accountMap.get(row.id) : undefined
                          if (!acc) {
                            return (
                              <div key={row.label} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                                <span className="text-gray-400 shrink-0">{row.label}</span>
                                <span className="text-gray-300 dark:text-gray-600 text-right">—</span>
                              </div>
                            )
                          }
                          const lt = acc.linkType ?? (acc.costCenterId ? 'cost_center' : null)
                          const hint = lt === 'partner'
                            ? `Requires partner — AR/AP account`
                            : lt === 'cost_center'
                              ? `Linked to Cost Center${acc.costCenterId && costCenterMap.get(acc.costCenterId) ? `: ${costCenterMap.get(acc.costCenterId)!.name}` : ''}`
                              : lt === 'employee'
                                ? 'Linked to Employees'
                                : null
                          return (
                            <div key={row.label} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                              <span className="text-gray-400 shrink-0">{row.label}</span>
                              <div className="min-w-0 text-right">
                                <span className="text-gray-700 dark:text-gray-300 truncate inline-block max-w-full">{(acc.code || '')} — {acc.name}</span>
                                <span className="ml-2 text-[10px] uppercase text-gray-400 dark:text-gray-500">({acc.type})</span>
                                {hint && (
                                  <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                                    <Link2 className="w-3 h-3" /> {hint}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
```

- [ ] **Step 3: Add the supporting state, data, and imports**

Add state next to `profilePreset`:

```tsx
  const [showProfileTable, setShowProfileTable] = useState(true)
```

Build the rows + profile header data just above the `return` (after the `profilePreset` block logic in the JSX is impossible — instead compute inside the JSX via the component body). Add these helpers inside the component, near `fetchProfilePreset`:

```tsx
  const profileCode = profilePreset ? (profiles.find(p => p.id === formData.profileId)?.code ?? '') : ''
  const profileName = profilePreset ? (profiles.find(p => p.id === formData.profileId)?.name ?? '') : ''
  const profileDescription = profilePreset ? (profiles.find(p => p.id === formData.profileId)?.description ?? '') : ''
  const profileTableRows = profilePreset ? [
    { type: 'tax', label: 'Tax — Sales', id: formData.vatCodeId },
    { type: 'tax', label: 'Tax — Purchase', id: formData.purchaseVatCodeId },
    { type: 'account', label: 'Sales Account', id: profilePreset.salesAccountId },
    { type: 'account', label: 'Purchase Account', id: profilePreset.purchaseAccountId },
    { type: 'account', label: 'Inventory Account', id: profilePreset.inventoryAccountId },
    { type: 'account', label: 'COGS Account', id: profilePreset.cogsAccountId },
    { type: 'account', label: 'AR Account', id: profilePreset.arAccountId },
    { type: 'account', label: 'AP Account', id: profilePreset.apAccountId },
    { type: 'account', label: 'Cash Account', id: profilePreset.cashAccountId },
    { type: 'account', label: 'Discount Account', id: profilePreset.discountAccountId },
  ] : []
```

Add `profiles` state (populated once from `/api/products/profiles`) and load it in the existing mount `useEffect` that fetches reference data, if not already present:

```tsx
  const [profiles, setProfiles] = useState<Product[]>([])
```

Add `ChevronUp` to the lucide import at the top (keep `ChevronDown`).

- [ ] **Step 4: Verify imports and unused-symbol cleanup**

- `ChevronUp` must be imported from `lucide-react`.
- `Product` type must be imported (it already is via `import type { Product, ... }`).
- If `taxTypeOptions` is now unused (removed in Task 2) it must already be gone; if still present and used nowhere, remove it.

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Verify tests still pass**

Run: `npx vitest run`
Expected: 434 passed, 0 failed.

- [ ] **Step 6: Build check**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev` → Products → Add Product → select a profile. Verify:
- Table shows profile code/name/description header with a collapse toggle.
- 10 rows render: Tax — Sales, Tax — Purchase (with rate), then 8 accounts with code — name (type) and link hints.
- Unset accounts show `—` (do not hide the row).
- Collapsing hides the rows; toggling restores them.
- Add a product without a profile → no table.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(admin)/products/page.tsx"
git commit -m "feat(products): show all profile data (tax + accounts) in collapsible table below profile selector"
```

---

## Self-Review Notes

- **Spec coverage:** Code/Name row (Task 1), tax removal (Task 2), full profile table incl. tax types (Task 3). No DB/API changes — matches the approved design.
- **Placeholder scan:** all code blocks are complete; helper names (`profileCode`, `profileTableRows`, `taxCodeMap`, `showProfileTable`) are consistent across steps.
- **Type consistency:** `taxCodeMap` is `Map<number, TaxCode>`; `accountMap` is `Map<number, Account>`; `profileTableRows` uses `type: 'tax' | 'account'` discriminated on `row.type`.
