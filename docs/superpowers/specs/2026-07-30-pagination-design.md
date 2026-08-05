# Pagination Design for ERP List Pages

## Goals

Add server-side pagination to the 5 main list pages that hold the most data: entries, invoices, partners, products, and purchase orders. All other lists (settings, tax codes, etc.) already fit comfortably on a single screen.

## API Pagination Format

All paginated list routes return:

```ts
{
  success: true,
  data: T[],
  total: number,
  page: number,
  pageSize: number,
}
```

Query params: `?page=1&pageSize=20` — defaults are `page=1`, `pageSize=20`.

## Routes Modified

| Route | Example |
|-------|---------|
| `GET /api/entries?page=1&pageSize=20` | Entries with pagination |
| `GET /api/invoices?page=1&pageSize=20&type=sales` | Invoices with type filter |
| `GET /api/partners?page=1&pageSize=20` | Partners |
| `GET /api/products?page=1&pageSize=20` | Products |
| `GET /api/purchase-orders?page=1&pageSize=20` | Purchase orders |

## Repository Changes

Each of the 5 existing repositories gets a new `paginate()` method alongside the existing `findAll()`:

```ts
paginate(page: number, pageSize: number, ...filters): { data: T[], total: number }
```

Internally:
- `SELECT COUNT(1) AS total FROM ... WHERE ...` for total
- `SELECT * FROM ... WHERE ... ORDER BY ... LIMIT ? OFFSET ?` for page data

The existing `findAll()` stays unchanged for internal use (reports, exports).

## Route Changes

Each route reads `page` and `pageSize` from query params:
- `page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))`
- `pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)))` (clamp 1-100)

Then calls `repo.paginate(page, pageSize, ...existingFilters)` and returns `{ success: true, data, total, page, pageSize }`.

## Pagination Component

A shared client component at `src/components/Pagination.tsx`:

```tsx
interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}
```

Renders:
- **Page size selector**: dropdown with 10 / 20 / 50 / 100
- **Navigation**: "Previous" / "Next" buttons, disabled at boundaries
- **Info text**: "Page {page} of {totalPages} ({total} items)"

Uses URL search params (`useSearchParams` / `useRouter`) to persist pagination state in the URL.

## Pages Modified

Each of the 5 page files gets:

1. Read `page` and `pageSize` from URL search params
2. Pass them in the API fetch URL
3. Render `<Pagination>` below the table
4. On page/pageSize change, update URL params (which triggers re-fetch)

## Error Handling

- Invalid page/pageSize values fall back to defaults
- Page exceeding total pages returns empty data array (graceful)
- Total pages = `Math.ceil(total / pageSize)`

## Scope

Not modified:
- Settings list pages (fiscal periods, payment terms, tax codes, etc.) — small datasets
- Report pages (aging, trial balance, balance sheet, etc.) — date-filtered, not list-based
- Chart of accounts and cost centers — hierarchical trees, not flat lists
