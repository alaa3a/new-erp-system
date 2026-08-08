# Phase 2G: Products & Warehouse Upgrade Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade Products & Warehouse module with transfers, delete validation, stock reservation, reorder alerts, cycle counting, and dashboard.

**Architecture:** Extend existing inventory service + add new API routes + new UI pages. All changes follow existing patterns.

**Tech Stack:** TypeScript, Next.js API routes, sql.js (SQLite), Tailwind CSS

---

## Global Constraints
- All monetary values in cents (integers)
- Use existing repository patterns
- Use existing UI components
- Wrap stock operations in transactions
- Prevent negative stock at all times
- Every stock change creates an inventory_movement record

---

## Task 36: Inter-warehouse Transfer

### Files
- Create: `src/app/api/inventory/transfers/route.ts`
- Modify: `src/lib/services/inventoryService.ts`
- Modify: `src/app/(admin)/inventory/movements/page.tsx`

### API: POST /api/inventory/transfers
**Request body:**
```json
{
  "productId": 1,
  "fromWarehouseId": 1,
  "toWarehouseId": 2,
  "quantity": 50,
  "reason": "Restocking main warehouse"
}
```

**Validation:**
- Source and destination must be different
- Source must have sufficient stock
- Quantity must be positive

**Logic (atomic transaction):**
1. Decrease stock in source warehouse (issue movement)
2. Increase stock in destination warehouse (receipt movement)
3. Create two movement records (issue + receipt)
4. Use same unitCost (average cost from source)
5. Update `product_warehouse_stock` for both warehouses

**Response:** Success with transfer details

### UI
Add "Transfer Stock" button to Movements page
- Modal with: Product picker, From warehouse, To warehouse, Quantity, Reason
- Show source stock level when product selected
- Execute transfer and refresh list

---

## Task 37: Delete Validation

### Files
- Modify: `src/app/api/products/[id]/route.ts` (DELETE)
- Modify: `src/app/api/warehouses/[id]/route.ts` (DELETE)
- Modify: `src/lib/repositories/productRepository.ts`
- Modify: `src/lib/repositories/warehouseRepository.ts`

### Product Delete
**Before delete, check:**
- If `product_warehouse_stock.quantity > 0` for any warehouse → block
- If `invoice_line.productId` references this product → block

**Error response:**
```json
{
  "success": false,
  "error": "Cannot delete product: 150 units in stock across 3 warehouses"
}
```

### Warehouse Delete
**Before delete, check:**
- If `product_warehouse_stock.quantity > 0` for any product in this warehouse → block

**Error response:**
```json
{
  "success": false,
  "error": "Cannot delete warehouse: 23 products stored"
}
```

---

## Task 38: Stock Reservation

### Files
- Modify: `src/lib/db.ts` — add `reservedQuantity` column to `product_warehouse_stock`
- Modify: `src/lib/repositories/inventoryRepository.ts`
- Modify: `src/app/api/inventory/stock/route.ts`

### Schema Change
```sql
ALTER TABLE product_warehouse_stock ADD COLUMN reservedQuantity INTEGER DEFAULT 0;
```

### Concept
- **Quantity:** Physical stock on hand
- **Reserved:** Committed to orders but not yet shipped
- **Available:** Quantity - Reserved

### API Changes
- GET /api/inventory/stock returns `available` field
- Reserve stock when invoice line is added (future: when invoice confirmed)
- Release stock when invoice cancelled

### Validation
- When creating invoice line, check `available >= quantity`
- Block if insufficient available stock

---

## Task 39: Reorder Point Alerts

### Files
- Modify: `src/lib/services/inventoryService.ts`
- Create: `src/app/api/inventory/reorder-check/route.ts`
- Modify: `src/app/(admin)/products/page.tsx`
- Modify: `src/app/(admin)/page.tsx` (dashboard widget)

### Logic
After every stock change (receipt, issue, adjustment, transfer):
- Check if `product.reorderPoint > 0`
- Check if `stock.quantity <= product.reorderPoint`
- If yes, create notification for admin users

**Notification format:**
```json
{
  "type": "warning",
  "title": "Low Stock Alert",
  "message": "Product [name] is below reorder point (current: 5, reorder: 10)",
  "entityType": "product",
  "entityId": 1
}
```

### UI
- Products page: Red badge on products below reorder point
- Dashboard widget: "X items below reorder point" with list

---

## Task 40: Physical Inventory Count (Cycle Count)

### Files
- Create: `src/app/api/inventory/counts/route.ts`
- Create: `src/lib/repositories/inventoryCountRepository.ts`
- Create: `src/app/(admin)/inventory/counts/page.tsx`

### Schema
```sql
CREATE TABLE inventory_count (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouseId INTEGER NOT NULL,
  countedBy INTEGER NOT NULL,
  status TEXT DEFAULT 'draft', -- draft, submitted, adjusted
  notes TEXT,
  countedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (warehouseId) REFERENCES warehouse(id),
  FOREIGN KEY (countedBy) REFERENCES users(id)
);

CREATE TABLE inventory_count_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  countId INTEGER NOT NULL,
  productId INTEGER NOT NULL,
  systemQuantity INTEGER NOT NULL,
  countedQuantity INTEGER NOT NULL,
  variance INTEGER NOT NULL,
  FOREIGN KEY (countId) REFERENCES inventory_count(id),
  FOREIGN KEY (productId) REFERENCES product(id)
);
```

### Workflow
1. **Create count:** Select warehouse → generate list of products with system quantities
2. **Record counts:** Enter counted quantity for each product
3. **Review variances:** Show system vs counted vs variance
4. **Submit:** Create adjustments for all variances
5. **Audit trail:** Track who counted and when

### UI
- `/inventory/counts` page with warehouse selector
- Count sheet table: Product | System Qty | Counted Qty | Variance
- Submit button creates adjustments for non-zero variances

---

## Task 41: Inventory Dashboard

### Files
- Create: `src/app/(admin)/inventory/dashboard/page.tsx`
- Modify: `src/layout/AppSidebar.tsx` (add menu item)

### Widgets
1. **Stock Value by Warehouse** — bar chart or cards
2. **Stock Movement Trend** — last 30 days line chart (simple)
3. **Low Stock Items** — table of items below reorder point
4. **Top Moving Products** — most moved products this month
5. **Stock Health Summary** — total value, total units, items count

### API
- GET /api/reports/inventory-valuation (already exists, extend if needed)
- GET /api/inventory/stock with summary stats

---

## Task 42: Service Item Filtering

### Files
- Modify: `src/lib/repositories/inventoryRepository.ts`
- Modify: `src/app/api/inventory/stock/route.ts`
- Modify: `src/app/api/inventory/movements/route.ts`

### Logic
- Stock queries: filter out products where `itemType = 'service'`
- Movement queries: filter out service products
- Adjustments page: only show stock products
- Stock adjustments API: reject service products with error

### Changes
- Add `WHERE p.itemType = 'stock'` to stock queries
- Add `AND p.itemType = 'stock'` to movement queries
- Validate in stock-adjustments: "Cannot adjust stock for service item"

---

## Task 48: Product Categories (Parent-Child)

### Database
- Add `parentId` column to product table (self-referencing FK)
- Add `isCategory` boolean flag
- Seed 3 sample categories: Electronics, Clothing, Services

### API
- Accept `parentId` and `isCategory` in product CRUD
- New endpoint: `GET /api/products/categories`
- Query params: `?parentId=`, `?category=true`, `?tree=true`
- Prevent circular references

### UI
- Tree sidebar on products page for filtering by category
- Parent dropdown + "is category" checkbox in product form
- Breadcrumb display: Electronics > Laptops
- Category cards with child count badges

---

## Task 49: Product Profiles

### Database
- New table: `product_profile` with template fields
- Add `profileId` FK to product table
- Seed 4 profiles: Standard, Tax Exempt, Service, Import

### API
- `GET/POST /api/products/profiles`
- `GET/PUT/DELETE /api/products/profiles/[id]`
- Profile CRUD with preset values

### UI
- ProfileSelector component in product form
- Auto-fill fields on profile selection (tax, warehouse, type, prices)
- Manage Profiles page at `/settings/product-profiles`
- Sidebar menu item under Settings

---

## Execution Order

```
Batch 1: Task 36 (Transfer) + Task 37 (Delete validation)
Batch 2: Task 38 (Reservation) + Task 39 (Reorder alerts)  
Batch 3: Task 40 (Cycle count) + Task 42 (Service filter)
Batch 4: Task 41 (Dashboard)
```

---

---

## Task 43: Invoice-Inventory Integration

### Files
- Modify: `src/lib/services/invoiceService.ts` (postInvoice)
- Modify: `src/app/api/invoices/[id]/post/route.ts`

### Current Issue
When posting an invoice, stock is moved but:
- No validation that sufficient stock exists
- No reservation before posting
- Stock movement fails silently if insufficient

### Improvements
1. **Pre-post validation:** Check stock availability for all lines
2. **Reserve stock** when invoice is approved (optional, depends on workflow)
3. **Block posting** if insufficient stock with clear error:
   ```
   Cannot post: Insufficient stock for Product X (available: 5, required: 10)
   ```
4. **Auto-select warehouse** if line doesn't specify one (use product.defaultWarehouseId)

---

## Task 44: Invoice Return / Credit Note from Invoice

### Files
- Create: `src/app/api/invoices/[id]/return/route.ts`
- Modify: `src/app/(admin)/invoice/credit-note/page.tsx`

### Feature
Create credit note directly from an existing invoice:
- Select invoice → choose lines to return → quantities
- Auto-create credit note with correct amounts
- Reverse stock movement (receipt back to warehouse)
- Link credit note to original invoice

### API: POST /api/invoices/[id]/return
**Request:**
```json
{
  "lines": [{ "lineId": 1, "quantity": 5 }],
  "reason": "Damaged goods"
}
```

**Logic:**
1. Validate quantities don't exceed invoiced
2. Create credit note
3. Reverse stock (issue → receipt)
4. Update invoice paid status if fully returned

---

## Task 45: Packing Slip / Delivery Note

### Files
- Create: `src/app/api/invoices/[id]/packing-slip/route.ts`
- Create: `src/components/invoices/PackingSlipModal.tsx`

### Feature
Generate packing slip for posted invoices:
- Shows products, quantities, warehouse
- Printable format
- Marks items as "packed"

### UI
- Button on posted invoice: "Print Packing Slip"
- Modal with print-friendly layout
- Shows: Invoice number, date, products, quantities, warehouse

---

## Task 46: Invoice Cost & Profit Tracking

### Files
- Modify: `src/types/erp.ts` — add cost tracking to invoice line
- Modify: `src/lib/services/invoiceService.ts`
- Create: `src/app/api/reports/profit-by-invoice/route.ts`

### Feature
Track profit per invoice:
- At posting time, capture unit cost from `product_warehouse_stock.averageCost`
- Store `costAmount` on invoice_line
- Calculate margin: `lineTotal - totalCost`
- Report: Profit by invoice, by product, by period

### Schema
```sql
ALTER TABLE invoice_line ADD COLUMN costAmount INTEGER DEFAULT 0;
```

---

## Task 47: Purchase Order to Receipt to Invoice Workflow

### Files
- Modify: `src/app/api/purchase-orders/[id]/receive/route.ts`
- Modify: `src/app/api/invoices/route.ts` (create from PO)

### Feature
Complete three-way matching workflow:
1. **Create PO** → products and quantities ordered
2. **Receive goods** → stock increases, PO status updates
3. **Create Invoice from PO** → pre-fill lines from received quantities

### API: POST /api/invoices/from-po
**Request:**
```json
{ "purchaseOrderId": 1 }
```

**Logic:**
1. Find PO with status "received" or "partially_received"
2. Create invoice with lines from PO (received quantities)
3. Link invoice to PO for three-way matching
4. Auto-fill prices from PO or product purchase price

---

## Updated Summary

| Task | Feature | Priority | Complexity | Status |
|------|---------|----------|------------|--------|
| 36 | Inter-warehouse transfer | 🔴 High | Medium | ✅ Done |
| 37 | Delete validation | 🔴 High | Low | ✅ Done |
| 38 | Stock reservation | 🔴 High | Medium | ✅ Done |
| 39 | Reorder point alerts | 🟠 Medium | Low | ✅ Done |
| 40 | Cycle count | 🟟 Medium | High | ✅ Done |
| 41 | Inventory dashboard | 🟡 Low | Medium | ✅ Done |
| 42 | Service filter | 🟡 Low | Low | ✅ Done |
| 43 | Invoice-Inventory integration | 🔴 High | Medium | ✅ Done |
| 44 | Credit note from invoice | 🟠 Medium | Medium | ✅ Done |
| 45 | Packing slip | 🟡 Low | Low | ✅ Done |
| 46 | Cost & profit tracking | 🟠 Medium | Medium | ✅ Done |
| 47 | PO → Receipt → Invoice workflow | 🔴 High | High | ✅ Done |

**Total: 12 tasks for complete inventory & invoicing upgrade.**

---

## Implementation Notes (completed 2026-08-08)

- **Task 36** — `POST /api/inventory/transfers` + Transfer Stock modal on Movements page.
  `transferStock` uses the AVAILABLE quantity (on hand − reserved) and rejects same-warehouse transfers.
- **Task 37** — DELETE guards on products (stock across warehouses, invoice/PO references) and warehouses (stocked product count).
- **Task 38** — `reservedQuantity` column + `available` field on `/api/inventory/stock`. `reserveStock` /
  `releaseStock` / `consumeReservation` in the service; posting consumes any held reservation.
- **Task 39** — `GET /api/inventory/reorder-check`; low-stock notifications fire after adjustments, transfers,
  PO receipts, invoice posting and cycle counts. Low-stock badges on Products page + dashboard widget.
- **Task 40** — `inventory_count` + `inventory_count_line` tables, repository, list/create/edit/submit API,
  `/inventory/counts` page with count sheet + variance review + submit-adjust flow.
- **Task 41** — `/inventory/dashboard` page (stock health, valuation by warehouse, low stock, top movers,
  recent movements) + sidebar menu.
- **Task 42** — stock & movement queries filter `itemType = 'stock'`; stock-adjustments rejects service items.
- **Task 43** — pre-post availability validation (`Cannot post: Insufficient stock for X (available: a, required: r)`)
  + auto-select warehouse from product default. Wired into posting, so posting a sales invoice now blocks on short stock.
- **Task 44** — `POST /api/invoices/[id]/return` creates a linked credit/debit note, reverses stock, tracks
  returned quantities per line; Return modal on the sales page.
- **Task 45** — `GET /api/invoices/[id]/packing-slip` + `PackingSlipModal` (printable) on posted invoices.
- **Task 46** — `costAmount` captured on invoice lines at posting; `GET /api/reports/profit-by-invoice` with margin.
- **Task 47** — `POST /api/invoices/from-po` creates a purchase invoice from received PO quantities (three-way matching).
