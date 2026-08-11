# Product Modal Layout + Global Focus Style + COA Column Order — Design

> **Status:** APPROVED (2026-08-11). Pure UI changes, no DB/API/service changes.

## 1. Add Product Modal — new layout

| Row | Fields |
|---|---|
| 1 | Parent Group \| Product Type \| **Active** (3-col grid) |
| 2 | Code (25%) \| Name (75%) |
| 3 | Description (50%) \| Default Warehouse (50%) |
| 4 | Unit of Measure \| Sales Price ($) \| Purchase Price ($) \| **Reorder Point (units)** (4-col grid) |
| 5 | **Profile** — restyled to look identical to Parent Group SearchSelect (last field row) |
| 6 | Collapsible profile data table (only when a profile is set) |

**Behavior:**
- Description stays a plain-text field (already plain — no rich text involved), constrained to 50% width.
- Default Warehouse and Reorder Point now show for ALL item types (stock AND service); they move out of the `itemType === 'stock'`-only block. Prices/UOM unchanged.
- For groups (Product Type = Group), rows 3–6 are hidden as today — groups keep only Parent, Type, Code, Name, Active.
- Profile selector: keep the `ProfileSelector` component (Option A — restyled trigger), only its visual classes change to match the Parent Group SearchSelect (same border, chevron, placeholder gray, focus highlight). No behavior change; preset fill + collapsible table still work.

## 2. Global focus highlight (blue)

Add one global CSS rule in `src/app/globals.css` so every text/number/textarea/select input — including SearchSelect triggers and ProfileSelector — shows the same blue focus ring used by the Add Child Account modal:

```css
:is(input, select, textarea):focus {
  outline: none;
  border-color: var(--color-brand-500);
  box-shadow: 0 0 0 2px rgb(70 95 255 / 0.2);
}
```

Applies app-wide. Keeps existing per-component `focus:` classes (they're idempotent with this) and removes nothing.

## 3. Chart of Accounts table — column order

Move the `Used In` column to sit immediately after `Linked To`.

- **New order:** Account | Linked To | **Used In** | Type | Status | Actions
- `src/app/(admin)/accounting/chart-of-accounts/page.tsx`
  - `<th>` "Used In" moves from index 815 to right after the "Linked To" `<th>` (812).
  - `<td>` `UsageCell` block moves from line ~686 to right after the Linked To `<td>` (~668).

## Files

- Modify: `src/app/(admin)/products/page.tsx` — modal row restructure + ProfileSelector restyle hooks
- Modify: `src/components/products/ProfileSelector.tsx` — trigger classes to match SearchSelect
- Modify: `src/app/globals.css` — global focus rule
- Modify: `src/app/(admin)/accounting/chart-of-accounts/page.tsx` — column reorder

## Verification

- `npx tsc --noEmit` clean (revert `next-env.d.ts` churn after)
- `npx vitest run` stays green
- `npm run build` passes