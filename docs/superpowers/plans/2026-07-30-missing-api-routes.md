# Missing API Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 9 missing API routes that deliver real business functionality (aging, stock, ledger, dashboard) using existing DB tables and services.

**Architecture:** Each route follows the existing pattern — `requireAuth()` middleware, `ensureInitialized()`, try/catch with `handleApiError()`, standard `{ success, data }` response format. Routes with existing services/repos (agingService, inventoryService, etc.) use them directly.

**Tech Stack:** Next.js API routes, existing repos + services, standard API format, Zod validation (already configured).

## Global Constraints

- All routes use `requireAuth()` for POST/PUT/DELETE, GET routes use it per existing pattern
- All routes return `{ success: boolean, data?: T, error?: string }`
- All routes use `handleApiError(error)` for error handling
- All routes call `ensureInitialized()` at the start
- Zod validation via existing `validate()` helper where there's a request body
- Follow existing route patterns in the codebase
- `DELETE /api/entries/[id]` must check entry is not posted before allowing delete

---

### Task 1: DELETE /api/entries/[id] + entries ledger route

**Files:**
- Modify: `src/app/api/entries/[id]/route.ts` (add DELETE handler)
- Create: `src/app/api/entries/ledger/route.ts` (GET)
- Reference: `src/lib/repositories/entryRepository.ts`, `src/lib/services/entryService.ts`

**Interfaces:**
- Consumes: `entryRepository`, `entryService` (already exist)
- Produces: DELETE handler at entries/[id], GET handler at entries/ledger

- [ ] **Step 1: Add DELETE handler to `entries/[id]/route.ts`**

Read the existing file, then add after the PUT handler:

```ts
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(_request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const { id } = await params;
    const entryId = parseInt(id, 10);
    const entry = entryRepository.findById(entryId);
    if (!entry) throw new NotFoundError('Entry', entryId);
    if (entry.isPosted) throw new ConflictError('Cannot delete a posted entry. Reverse it instead.');
    const entryLines = entryRepository.getLines(entryId);
    if (entryLines.length > 0) {
      for (const line of entryLines) {
        entryRepository.deleteLine(line.id);
      }
    }
    entryRepository.delete(entryId);
    auditLogRepository.create({ action: 'DELETE', entity: 'entry', entityId: entryId, userId: auth.userId, oldValues: entry });
    return Response.json({ success: true, data: { id: entryId } });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 2: Create `entries/ledger/route.ts`**

Create directory `src/app/api/entries/ledger/` and file `route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { entryRepository } from '@/lib/repositories/entryRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const { searchParams } = new URL(request.url);
    const accountCode = searchParams.get('accountCode');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const entries = entryRepository.findAll();
    let filtered = entries;
    if (accountCode) {
      filtered = filtered.filter(e => {
        const lines = entryRepository.getLines(e.id);
        return lines.some(l => l.accountCode === accountCode);
      });
    }
    if (startDate) {
      filtered = filtered.filter(e => e.entryDate >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(e => e.entryDate <= endDate);
    }
    const result = filtered.map(e => ({
      ...e,
      lines: entryRepository.getLines(e.id),
    }));
    return Response.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 3: Verify build**

```bash
cd "D:\open code\project\NEW ERP"
npx next build 2>&1 | Select-String "Compiled successfully"
Expected: ✓ Compiled successfully in ...
```

---

### Task 2: GET /api/partners/[id]/aging + GET /api/products/[id]/stock

**Files:**
- Create: `src/app/api/partners/[id]/aging/route.ts`
- Create: `src/app/api/products/[id]/stock/route.ts`
- Reference: `src/lib/services/agingService.ts`, `src/lib/repositories/inventoryRepository.ts`

**Interfaces:**
- Consumes: `agingService.calculatePartnerAging(partnerId)`, `inventoryRepository.getStock(productId, warehouseId?)`
- Produces: Per-partner aging route, per-product stock route

- [ ] **Step 1: Create `partners/[id]/aging/route.ts`**

Create directory `src/app/api/partners/[id]/aging/` and file `route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { partnerRepository } from '@/lib/repositories/partnerRepository';
import { agingService } from '@/lib/services/agingService';
import { NotFoundError, handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(_request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const { id } = await params;
    const partnerId = parseInt(id, 10);
    const partner = partnerRepository.findById(partnerId);
    if (!partner) throw new NotFoundError('Partner', partnerId);
    const aging = agingService.calculatePartnerAging(partnerId);
    return Response.json({ success: true, data: aging });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 2: Create `products/[id]/stock/route.ts`**

Create directory `src/app/api/products/[id]/stock/` and file `route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { productRepository } from '@/lib/repositories/productRepository';
import { inventoryRepository } from '@/lib/repositories/inventoryRepository';
import { NotFoundError, handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(_request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const { id } = await params;
    const productId = parseInt(id, 10);
    const product = productRepository.findById(productId);
    if (!product) throw new NotFoundError('Product', productId);
    const stock = inventoryRepository.getStockByProduct(productId);
    return Response.json({ success: true, data: stock });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 3: Verify build**

```bash
cd "D:\open code\project\NEW ERP"
npx next build 2>&1 | Select-String "Compiled successfully"
Expected: ✓ Compiled successfully in ...
```

---

### Task 3: GET /api/invoices/[id]/entries + GET /api/dashboard/summary

**Files:**
- Create: `src/app/api/invoices/[id]/entries/route.ts`
- Create: `src/app/api/dashboard/summary/route.ts`
- Reference: `src/app/api/reports/dashboard/route.ts`, `src/lib/repositories/entryRepository.ts`

**Interfaces:**
- Consumes: `entryRepository.findByReference(invoiceId)`
- Produces: Invoice entries route, dashboard summary route

- [ ] **Step 1: Create `invoices/[id]/entries/route.ts`**

Create directory `src/app/api/invoices/[id]/entries/` and file `route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { invoiceRepository } from '@/lib/repositories/invoiceRepository';
import { entryRepository } from '@/lib/repositories/entryRepository';
import { NotFoundError, handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(_request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const { id } = await params;
    const invoiceId = parseInt(id, 10);
    const invoice = invoiceRepository.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    const entries = entryRepository.findByReference(`invoice:${invoiceId}`);
    return Response.json({ success: true, data: entries });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 2: Create `dashboard/summary/route.ts`**

Create directory `src/app/api/dashboard/summary/` and file `route.ts` — this re-exposes/reimplements the dashboard data at the correct path:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { invoiceRepository } from '@/lib/repositories/invoiceRepository';
import { partnerRepository } from '@/lib/repositories/partnerRepository';
import { productRepository } from '@/lib/repositories/productRepository';
import { agingService } from '@/lib/services/agingService';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const invoices = invoiceRepository.findAll();
    const totalSales = invoices.filter(i => i.type === 'sales' && i.status !== 'draft')
      .reduce((sum, i) => sum + i.totalAmount, 0);
    const totalPurchases = invoices.filter(i => i.type === 'purchase' && i.status !== 'draft')
      .reduce((sum, i) => sum + i.totalAmount, 0);
    const overdue = agingService.getOverdueReceivables();
    const totalOverdue = overdue.reduce((sum, i) => sum + i.amount, 0);
    const partners = partnerRepository.findAll();
    const products = productRepository.findAll();
    return Response.json({
      success: true,
      data: {
        totalSales,
        totalPurchases,
        totalOverdue,
        invoiceCount: invoices.length,
        partnerCount: partners.length,
        productCount: products.length,
        overdueInvoices: overdue.length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 3: Verify build**

```bash
cd "D:\open code\project\NEW ERP"
npx next build 2>&1 | Select-String "Compiled successfully"
Expected: ✓ Compiled successfully in ...
```

---

### Task 4: Reports routes — inventory-valuation, tax-summary, inventory-movements

**Files:**
- Create: `src/app/api/reports/inventory-valuation/route.ts`
- Create: `src/app/api/reports/tax-summary/route.ts`
- Create: `src/app/api/reports/inventory-movements/route.ts` (or verify it exists at `src/app/api/inventory/movements/route.ts`)
- Reference: `src/lib/services/reportingService.ts`, `src/lib/services/inventoryService.ts`

**Interfaces:**
- Consumes: `reportingService`, `inventoryService`, `invoiceRepository`, `taxCodeRepository`
- Produces: Three new report routes

- [ ] **Step 1: Check if `reports/inventory-movements/route.ts` already exists**

Run: `dir src\app\api\reports\inventory-movements\route.ts 2>nul || echo NOT FOUND`

If it exists at `src/app/api/inventory/movements/route.ts`, create a thin wrapper or redirect.

- [ ] **Step 2: Create `reports/inventory-valuation/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { productRepository } from '@/lib/repositories/productRepository';
import { inventoryRepository } from '@/lib/repositories/inventoryRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const products = productRepository.findAll();
    const valuation = products.map(p => {
      const stock = inventoryRepository.getStockByProduct(p.id);
      const totalQty = stock.reduce((sum, s) => sum + s.quantity, 0);
      const totalValue = totalQty * p.cost;
      return {
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        totalQuantity: totalQty,
        unitCost: p.cost,
        totalValue,
      };
    });
    return Response.json({ success: true, data: valuation });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 3: Create `reports/tax-summary/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { invoiceRepository } from '@/lib/repositories/invoiceRepository';
import { taxCodeRepository } from '@/lib/repositories/taxCodeRepository';
import { handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    let invoices = invoiceRepository.findAll();
    if (startDate) invoices = invoices.filter(i => i.invoiceDate >= startDate);
    if (endDate) invoices = invoices.filter(i => i.invoiceDate <= endDate);
    const taxCodes = taxCodeRepository.findAll();
    const summary = taxCodes.map(tc => {
      const taxInvoices = invoices.filter(i => i.taxCodeId === tc.id);
      const taxableAmount = taxInvoices.reduce((sum, i) => sum + i.netAmount, 0);
      const taxAmount = taxInvoices.reduce((sum, i) => sum + (i.taxAmount || 0), 0);
      return {
        taxCode: tc.code,
        taxName: tc.name,
        rate: tc.rate,
        taxableAmount,
        taxAmount,
        invoiceCount: taxInvoices.length,
      };
    });
    return Response.json({ success: true, data: summary });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 4: Verify build**

```bash
cd "D:\open code\project\NEW ERP"
npx next build 2>&1 | Select-String "Compiled successfully"
Expected: ✓ Compiled successfully in ...
```

---

### Task 5: PUT /api/users/[id]/permissions + POST /api/auth/reset-password

**Files:**
- Create: `src/app/api/users/[id]/permissions/route.ts`
- Create: `src/app/api/auth/reset-password/route.ts`
- Reference: `src/lib/repositories/userRepository.ts`, `src/lib/auth/password.ts`

**Interfaces:**
- Consumes: `userRepository.findById()`, `userRepository.update()`
- Produces: User permissions route, password reset route

- [ ] **Step 1: Create `users/[id]/permissions/route.ts`**

This route allows updating a user's permission IDs.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { userRepository } from '@/lib/repositories/userRepository';
import { NotFoundError, ValidationError, handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const { id } = await params;
    const userId = parseInt(id, 10);
    const user = userRepository.findById(userId);
    if (!user) throw new NotFoundError('User', userId);
    const body = await request.json();
    if (!Array.isArray(body.permissionIds)) throw new ValidationError('permissionIds must be an array');
    userRepository.update(userId, { permissionIds: JSON.stringify(body.permissionIds) });
    const updated = userRepository.findById(userId);
    return Response.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 2: Create `auth/reset-password/route.ts`**

A minimal password reset that accepts email + newPassword (for admin-initiated resets):

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { userRepository } from '@/lib/repositories/userRepository';
import { hashPassword } from '@/lib/auth/password';
import { NotFoundError, ValidationError, handleApiError } from '@/lib/utils/errors';
import { ensureInitialized } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const body = await request.json();
    if (!body.email || !body.newPassword) throw new ValidationError('Email and new password are required');
    if (body.newPassword.length < 6) throw new ValidationError('Password must be at least 6 characters');
    const user = userRepository.findByEmail(body.email);
    if (!user) throw new NotFoundError('User with email ' + body.email);
    const hashed = await hashPassword(body.newPassword);
    userRepository.update(user.id, { passwordHash: hashed });
    return Response.json({ success: true, data: { message: 'Password reset successfully' } });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 3: Verify build**

```bash
cd "D:\open code\project\NEW ERP"
npx next build 2>&1 | Select-String "Compiled successfully"
Expected: ✓ Compiled successfully in ...
```

---

### Routes deferred (need DB table)

- `GET /api/settings/aging-buckets` — needs `aging_buckets` table + repository
- `PUT /api/settings/aging-buckets` — needs `aging_buckets` table + repository

These require a DB schema migration and are better done as part of a settings overhaul.
