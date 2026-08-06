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

## Execution Order

```
Batch 1: Task 36 (Transfer) + Task 37 (Delete validation)
Batch 2: Task 38 (Reservation) + Task 39 (Reorder alerts)  
Batch 3: Task 40 (Cycle count) + Task 42 (Service filter)
Batch 4: Task 41 (Dashboard)
```

---

## Summary

| Task | Feature | Priority | Complexity |
|------|---------|----------|------------|
| 36 | Inter-warehouse transfer | 🔴 High | Medium |
| 37 | Delete validation | 🔴 High | Low |
| 38 | Stock reservation | 🔴 High | Medium |
| 39 | Reorder point alerts | 🟠 Medium | Low |
| 40 | Cycle count | 🟟 Medium | High |
| 41 | Inventory dashboard | 🟡 Low | Medium |
| 42 | Service filter | 🟡 Low | Low |

**Total: 7 tasks for complete inventory upgrade.**
