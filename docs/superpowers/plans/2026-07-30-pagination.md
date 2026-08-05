# Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side pagination to the 5 main list pages (entries, invoices, partners, products, purchase orders) with page size selection of 10/20/50/100.

**Architecture:** Each of the 5 repositories gets a `paginate(page, pageSize, ...filters)` method that returns `{ data: T[], total: number }`. Routes read `page`/`pageSize` from query params and return `{ success: true, data, total, page, pageSize }`. A shared `Pagination` component handles the UI. Pages read pagination state from URL search params.

**Tech Stack:** Next.js API routes, existing repositories, a new `Pagination.tsx` component, URL search params for state.

## Global Constraints

- API pagination response: `{ success: true, data: T[], total: number, page: number, pageSize: number }`
- Query params: `?page=1&pageSize=20` (defaults: page=1, pageSize=20)
- `pageSize` clamped to 1-100
- Pagination state stored in URL search params (not React state)
- Existing `findAll()` methods remain unchanged for internal use
- Follow existing codebase patterns (no comments, `NextResponse.json`, `handleApiError`)

---

### Task 1: Add paginate() to all 5 repositories

**Files:**
- Modify: `src/lib/repositories/entryRepository.ts`
- Modify: `src/lib/repositories/invoiceRepository.ts`
- Modify: `src/lib/repositories/partnerRepository.ts`
- Modify: `src/lib/repositories/productRepository.ts`
- Modify: `src/lib/repositories/purchaseOrderRepository.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/db`, existing mapper functions
- Produces: `paginate(page, pageSize, ...filters): { data: T[], total: number }` on each repo

- [ ] **Step 1: Add `paginate()` to entryRepository**

Read the file, then add after `findAll`:

```ts
paginate(page: number, pageSize: number, type?: string, status?: string, search?: string): { data: Entry[]; total: number } {
  const offset = (page - 1) * pageSize;
  let where = 'WHERE 1=1';
  const params: any[] = [];
  if (type) { where += ' AND type = ?'; params.push(type); }
  if (status) { where += ' AND status = ?'; params.push(status); }
  if (search) { where += ' AND (entryNumber LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  const total = (db.prepare(`SELECT count(1) AS count FROM entry ${where}`).get(...params) as any).count;
  const data = (db.prepare(`SELECT * FROM entry ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]).map(mapEntry);
  return { data, total };
},
```

- [ ] **Step 2: Add `paginate()` to invoiceRepository**

```ts
paginate(page: number, pageSize: number, type?: string, status?: string, search?: string): { data: Invoice[]; total: number } {
  const offset = (page - 1) * pageSize;
  let where = 'WHERE 1=1';
  const params: any[] = [];
  if (type) { where += ' AND type = ?'; params.push(type); }
  if (status) { where += ' AND status = ?'; params.push(status); }
  if (search) { where += ' AND (invoiceNumber LIKE ? OR partnerName LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  const total = (db.prepare(`SELECT count(1) AS count FROM invoice ${where}`).get(...params) as any).count;
  const data = (db.prepare(`SELECT * FROM invoice ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]).map(mapInvoice);
  return { data, total };
},
```

- [ ] **Step 3: Add `paginate()` to partnerRepository**

```ts
paginate(page: number, pageSize: number, search?: string, type?: string): { data: BusinessPartner[]; total: number } {
  const offset = (page - 1) * pageSize;
  let where = "WHERE status != 'deleted'";
  const params: any[] = [];
  if (search) { where += ' AND (name LIKE ? OR code LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (type) { where += ' AND type = ?'; params.push(type); }
  const total = (db.prepare(`SELECT count(1) AS count FROM business_partner ${where}`).get(...params) as any).count;
  const data = (db.prepare(`SELECT * FROM business_partner ${where} ORDER BY name ASC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]).map(mapRow);
  return { data, total };
},
```

- [ ] **Step 4: Add `paginate()` to productRepository**

```ts
paginate(page: number, pageSize: number, search?: string, itemType?: string): { data: Product[]; total: number } {
  const offset = (page - 1) * pageSize;
  let where = 'WHERE isActive = 1';
  const params: any[] = [];
  if (search) { where += ' AND (name LIKE ? OR code LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (itemType) { where += ' AND itemType = ?'; params.push(itemType); }
  const total = (db.prepare(`SELECT count(1) AS count FROM product ${where}`).get(...params) as any).count;
  const data = (db.prepare(`SELECT * FROM product ${where} ORDER BY name ASC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]).map(mapRow);
  return { data, total };
},
```

- [ ] **Step 5: Add `paginate()` to purchaseOrderRepository**

```ts
paginate(page: number, pageSize: number, status?: string, search?: string): { data: PurchaseOrder[]; total: number } {
  const offset = (page - 1) * pageSize;
  let where = 'WHERE 1=1';
  const params: any[] = [];
  if (status) { where += ' AND status = ?'; params.push(status); }
  if (search) { where += ' AND (poNumber LIKE ? OR partnerName LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  const total = (db.prepare(`SELECT count(1) AS count FROM purchase_order ${where}`).get(...params) as any).count;
  const data = (db.prepare(`SELECT * FROM purchase_order ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]).map(mapPO);
  return { data, total };
},
```

- [ ] **Step 6: Verify build**

```bash
cd "D:\open code\project\NEW ERP"
npx next build 2>&1 | Select-String "Compiled successfully"
Expected: ✓ Compiled successfully in ...
```

---

### Task 2: Update 5 route GET handlers to use paginate()

**Files:**
- Modify: `src/app/api/entries/route.ts`
- Modify: `src/app/api/invoices/route.ts`
- Modify: `src/app/api/partners/route.ts`
- Modify: `src/app/api/products/route.ts`
- Modify: `src/app/api/purchase-orders/route.ts`

**Interfaces:**
- Consumes: `repo.paginate(page, pageSize, ...filters)` from Task 1
- Produces: Paginated API responses with `{ success, data, total, page, pageSize }`

- [ ] **Step 1: Update entries GET handler**

Replace the `entries = entryRepository.findAll(...)` line and return:

```ts
const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
const result = entryRepository.paginate(page, pageSize, type, status, search);
return NextResponse.json({ success: true, data: result.data, total: result.total, page, pageSize });
```

- [ ] **Step 2: Update invoices GET handler**

Same pattern — replace `invoiceRepository.findAll(...)` call:

```ts
const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
const result = invoiceRepository.paginate(page, pageSize, type, status, search);
return NextResponse.json({ success: true, data: result.data, total: result.total, page, pageSize });
```

- [ ] **Step 3: Update partners GET handler**

```ts
const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
const result = partnerRepository.paginate(page, pageSize, search, type);
return NextResponse.json({ success: true, data: result.data, total: result.total, page, pageSize });
```

- [ ] **Step 4: Update products GET handler**

```ts
const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
const result = productRepository.paginate(page, pageSize, search, itemType);
return NextResponse.json({ success: true, data: result.data, total: result.total, page, pageSize });
```

- [ ] **Step 5: Update purchase-orders GET handler**

Replace the `pos = purchaseOrderRepository.findAll(...)` line and the `result.map(po => ...)` block. The paginated version should only fetch lines for the current page's data:

```ts
const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
const result = purchaseOrderRepository.paginate(page, pageSize, status, search);
const data = result.data.map(po => ({ ...po, lines: purchaseOrderRepository.findLines(po.id) }));
return NextResponse.json({ success: true, data, total: result.total, page, pageSize });
```

- [ ] **Step 6: Verify build**

```bash
cd "D:\open code\project\NEW ERP"
npx next build 2>&1 | Select-String "Compiled successfully"
Expected: ✓ Compiled successfully in ...
```

---

### Task 3: Create Pagination UI component

**Files:**
- Create: `src/components/Pagination.tsx`

**Interfaces:**
- Produces: A shared `Pagination` component used by all 5 page files

- [ ] **Step 1: Create `src/components/Pagination.tsx`**

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
}

export function Pagination({ page, pageSize, total }: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.ceil(total / pageSize);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`?${params.toString()}`);
  }

  if (totalPages <= 1 && total <= pageSize) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Rows per page:</span>
        <select
          value={pageSize}
          onChange={e => { setParam('pageSize', e.target.value); setParam('page', '1'); }}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
      </div>

      <span className="text-sm text-gray-600">
        Page {page} of {totalPages} ({total} items)
      </span>

      <div className="flex gap-1">
        <button
          onClick={() => setParam('page', String(page - 1))}
          disabled={page <= 1}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-50"
        >
          Previous
        </button>
        <button
          onClick={() => setParam('page', String(page + 1))}
          disabled={page >= totalPages}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd "D:\open code\project\NEW ERP"
npx next build 2>&1 | Select-String "Compiled successfully"
Expected: ✓ Compiled successfully in ...
```

---

### Task 4: Update 5 page files to use paginated fetch

**Files:**
- Modify: `src/app/(admin)/accounting/entries/page.tsx`
- Modify: `src/app/(admin)/invoice/sales/page.tsx`
- Modify: `src/app/(admin)/invoice/purchase/page.tsx`
- Modify: `src/app/(admin)/business-partners/page.tsx`
- Modify: `src/app/(admin)/products/page.tsx`
- (purchase-orders page is at `src/app/(admin)/purchase-orders/page.tsx`)

**Interfaces:**
- Consumes: Paginated API responses from Task 2, `Pagination` component from Task 3
- Produces: 5 page files with paginated data fetching + `<Pagination>` rendered below tables

**Pattern for each page:**

- [ ] **Step for each page: Read page/pageSize from URL, pass to fetch, render `<Pagination>`**

The change follows this pattern for the data fetching section of each page:

```tsx
// At the top of the component or in data fetching:
const searchParams = useSearchParams();
const page = parseInt(searchParams.get('page') || '1', 10);
const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

// In the fetch URL:
const res = await fetch(`/api/entries?page=${page}&pageSize=${pageSize}&type=${type}&status=${status}&search=${search}`);
const json = await res.json();
// json.data, json.total, json.page, json.pageSize
```

```tsx
// Below the table:
<Pagination page={json.page} pageSize={json.pageSize} total={json.total} />
```

The exact integration depends on how each page currently does its data fetching:
- If it uses `useEffect` + `fetch` — add `page` and `pageSize` to the fetch URL and dependency array
- If it fetches at the module level — add params to the URL

**Specific guidance per page:**

1. **entries/page.tsx** — adds `page` and `pageSize` to the `/api/entries` fetch, passes them as deps
2. **invoice/sales/page.tsx** — adds `page` and `pageSize` to the `/api/invoices?type=sales` fetch
3. **invoice/purchase/page.tsx** — adds `page` and `pageSize` to the `/api/invoices?type=purchase` fetch
4. **business-partners/page.tsx** — adds `page` and `pageSize` to the `/api/partners` fetch
5. **products/page.tsx** — adds `page` and `pageSize` to the `/api/products` fetch
6. **purchase-orders/page.tsx** — adds `page` and `pageSize` to the `/api/purchase-orders` fetch

Each page also needs `'use client'` if not already, and must import `Pagination`:
```tsx
import { Pagination } from '@/components/Pagination';
```

- [ ] **Step 7: Verify build**

```bash
cd "D:\ open code\project\NEW ERP"
npx next build 2>&1 | Select-String "Compiled successfully"
Expected: ✓ Compiled successfully in ...
```

---

### Routes deferred (no pagination needed)

- Settings lists (fiscal periods, payment terms, tax codes, etc.) — small datasets
- Report pages (aging, trial balance, balance sheet, etc.) — date-filtered, not traditional list pages
- Chart of accounts and cost centers — hierarchical trees
- Dashboard — summary aggregates, not a list
- Inventory movements — operational log, paginated separately if needed later
