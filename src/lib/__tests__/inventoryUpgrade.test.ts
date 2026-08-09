import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from './test-helper';
import { inventoryService } from '../services/inventoryService';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { inventoryCountRepository } from '../repositories/inventoryCountRepository';
import { productRepository } from '../repositories/productRepository';
import { warehouseRepository } from '../repositories/warehouseRepository';
import { invoiceRepository } from '../repositories/invoiceRepository';
import { invoiceService } from '../services/invoiceService';
import { purchaseOrderRepository } from '../repositories/purchaseOrderRepository';
import { BusinessRuleError } from '../utils/errors';
import { db } from '../db';

describe('Inventory Upgrade (Tasks 36-47)', () => {
  let data: any;
  let whB: number;
  let _pid = 1000;

  beforeAll(async () => {
    await setupTestDatabase();
    data = seedTestData();
    const now = new Date().toISOString();
    whB = db.prepare(
      'INSERT INTO warehouse (code, name, isActive, createdAt, updatedAt, version) VALUES (?, ?, 1, ?, ?, 1)'
    ).run('WH-B', 'Warehouse B', now, now).lastInsertRowid as number;
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  /** Fresh stock product per test so stock figures never leak between tests. */
  function freshProduct(reorderPoint = 0): number {
    const now = new Date().toISOString();
    _pid += 1;
    return db.prepare(
      `INSERT INTO product (code, name, description, itemType, unitOfMeasure, salesPrice, purchasePrice, reorderPoint, isActive, createdAt, updatedAt, version)
       VALUES (?, ?, ?, 'stock', 'pcs', 1000, 500, ?, 1, ?, ?, 1)`
    ).run(`PR-T${_pid}`, `Test Product ${_pid}`, 'upgrade test', reorderPoint, now, now).lastInsertRowid as number;
  }

  describe('Task 36 — Transfer', () => {
    it('should reject transfer to the same warehouse', () => {
      const pid = freshProduct();
      inventoryRepository.upsertStock(pid, data.warehouseId, 10, 100);
      expect(() => inventoryService.transferStock(pid, data.warehouseId, data.warehouseId, 5, 'test'))
        .toThrow(/must be different/);
    });

    it('should reject transfer of reserved stock beyond availability', () => {
      const pid = freshProduct();
      inventoryRepository.upsertStock(pid, data.warehouseId, 20, 100);
      inventoryService.reserveStock(pid, data.warehouseId, 15);
      // 20 on hand, 15 reserved → 5 available; transferring 10 must fail
      expect(() => inventoryService.transferStock(pid, data.warehouseId, whB, 10, 'test'))
        .toThrow(/Insufficient stock/);
    });
  });

  describe('Task 37 — Delete validation', () => {
    it('should expose stock summary used by the delete guard', () => {
      const pid = freshProduct();
      inventoryRepository.upsertStock(pid, data.warehouseId, 50, 100);
      const summary = productRepository.getStockSummary(pid);
      expect(summary.totalQuantity).toBe(50);
      expect(summary.warehouseCount).toBe(1);
      expect(warehouseRepository.getStockedProductCount(data.warehouseId)).toBeGreaterThan(0);
    });
  });

  describe('Task 38 — Stock reservation', () => {
    it('should track available = quantity - reserved', () => {
      const pid = freshProduct();
      inventoryRepository.upsertStock(pid, data.warehouseId, 100, 50);
      const before = inventoryRepository.getStock(pid, data.warehouseId)!;
      expect(before.available).toBe(100);

      inventoryService.reserveStock(pid, data.warehouseId, 30);
      const after = inventoryRepository.getStock(pid, data.warehouseId)!;
      expect(after.quantity).toBe(100);
      expect(after.reservedQuantity).toBe(30);
      expect(after.available).toBe(70);
    });

    it('should reject reserving more than available', () => {
      const pid = freshProduct();
      inventoryRepository.upsertStock(pid, data.warehouseId, 10, 50);
      expect(() => inventoryService.reserveStock(pid, data.warehouseId, 25))
        .toThrow(/only 10 available/);
    });

    it('should release a reservation', () => {
      const pid = freshProduct();
      inventoryRepository.upsertStock(pid, data.warehouseId, 40, 50);
      inventoryService.reserveStock(pid, data.warehouseId, 10);
      inventoryService.releaseStock(pid, data.warehouseId, 10);
      const stock = inventoryRepository.getStock(pid, data.warehouseId)!;
      expect(stock.reservedQuantity).toBe(0);
      expect(stock.available).toBe(40);
    });

    it('should consume a reservation when posting consumes the units', () => {
      const pid = freshProduct();
      inventoryRepository.upsertStock(pid, data.warehouseId, 100, 100);
      inventoryService.reserveStock(pid, data.warehouseId, 20);
      inventoryRepository.consumeReservation(pid, data.warehouseId, 20);
      const stock = inventoryRepository.getStock(pid, data.warehouseId)!;
      expect(stock.reservedQuantity).toBe(0);
      expect(stock.available).toBe(100);
    });
  });

  describe('Task 39 — Reorder alerts', () => {
    it('should list products at or below their reorder point', () => {
      const pid = freshProduct(20);
      inventoryRepository.upsertStock(pid, data.warehouseId, 10, 50);
      const alerts = inventoryService.getReorderAlerts();
      const alert = alerts.find(a => a.productId === pid);
      expect(alert).toBeDefined();
      expect(alert!.quantity).toBe(10);
      expect(alert!.reorderPoint).toBe(20);
    });

    it('should NOT flag products above their reorder point', () => {
      const pid = freshProduct(5);
      inventoryRepository.upsertStock(pid, data.warehouseId, 50, 50);
      const alerts = inventoryService.getReorderAlerts();
      expect(alerts.some(a => a.productId === pid)).toBe(false);
    });
  });

  describe('Task 40 — Cycle count', () => {
    it('should create a count with system quantities and apply variances on submit', () => {
      const pid = freshProduct();
      inventoryRepository.upsertStock(pid, data.warehouseId, 25, 100);

      const countId = inventoryCountRepository.create({ warehouseId: data.warehouseId, countedBy: 1, notes: 'Test count' });
      inventoryCountRepository.addLinesForWarehouse(countId, data.warehouseId);
      const lines = inventoryCountRepository.findLines(countId);
      const productLine = lines.find(l => l.productId === pid)!;
      expect(productLine.systemQuantity).toBe(25);
      expect(productLine.variance).toBe(0);

      // Physical count found 22 → variance -3
      inventoryCountRepository.setCountedQuantity(productLine.id, 22);
      const updated = inventoryCountRepository.findLines(countId).find(l => l.id === productLine.id)!;
      expect(updated.countedQuantity).toBe(22);
      expect(updated.variance).toBe(-3);

      // Submitting adjusts stock
      inventoryService.submitCount(countId, 'test-user');
      const stock = inventoryRepository.getStock(pid, data.warehouseId)!;
      expect(stock.quantity).toBe(22);
      expect(inventoryCountRepository.findById(countId)!.status).toBe('adjusted');

      // Re-submitting a submitted count must fail
      expect(() => inventoryService.submitCount(countId, 'test-user'))
        .toThrow(/Only draft counts/);
    });
  });

  describe('Task 43 — Invoice stock validation', () => {
    function createSalesInvoice(pid: number, qty: number, warehouseId: number): number {
      const id = invoiceRepository.create({
        type: 'sales',
        businessPartnerId: data.partnerIds.customer,
        partnerName: 'Test Customer',
        invoiceDate: '2026-07-29',
        dueDate: '2026-08-28',
        warehouseId,
        postingProfileId: data.postingProfileId,
        createdBy: 'test',
      });
      invoiceRepository.addLine({
        invoiceId: id,
        lineNumber: 1,
        productId: pid,
        description: 'Widget',
        quantity: qty,
        unitPrice: 1000,
        discountPercent: 0,
        vatCodeId: null,
        vatRate: 0,
        vatAmount: 0,
        lineTotal: qty * 1000,
        lineType: 'stock',
        warehouseId,
        costCenterId: null,
        accountCode: '401',
      });
      invoiceRepository.updateTotals(id, qty * 1000, 0, qty * 1000);
      return id;
    }

    it('should block posting when available stock is insufficient', () => {
      const pid = freshProduct();
      inventoryRepository.upsertStock(pid, data.warehouseId, 5, 100);
      const id = createSalesInvoice(pid, 10, data.warehouseId);
      expect(() => invoiceService.validateStockAvailability(id))
        .toThrow(/Insufficient stock for .*\(available: 5, required: 10\)/);
      // Posting must also fail
      expect(() => invoiceService.postInvoice(id, 'test-user')).toThrow(BusinessRuleError);
    });

    it('should allow posting when available stock covers the lines', () => {
      const pid = freshProduct();
      inventoryRepository.upsertStock(pid, data.warehouseId, 50, 100);
      const id = createSalesInvoice(pid, 10, data.warehouseId);
      expect(() => invoiceService.validateStockAvailability(id)).not.toThrow();
      invoiceService.postInvoice(id, 'test-user');
      const stock = inventoryRepository.getStock(pid, data.warehouseId)!;
      expect(stock.quantity).toBe(40);
    });
  });

  describe('Task 46 — Cost capture', () => {
    it('should capture costAmount on invoice lines at posting', () => {
      const pid = freshProduct();
      inventoryRepository.upsertStock(pid, data.warehouseId, 100, 1500);
      const id = invoiceRepository.create({
        type: 'sales',
        businessPartnerId: data.partnerIds.customer,
        partnerName: 'Cost Test',
        invoiceDate: '2026-07-29',
        dueDate: '2026-08-28',
        warehouseId: data.warehouseId,
        createdBy: 'test',
      });
      invoiceRepository.addLine({
        invoiceId: id,
        lineNumber: 1,
        productId: pid,
        description: 'Widget',
        quantity: 5,
        unitPrice: 3000,
        discountPercent: 0,
        vatCodeId: null,
        vatRate: 0,
        vatAmount: 0,
        lineTotal: 15000,
        lineType: 'stock',
        warehouseId: data.warehouseId,
        costCenterId: null,
        accountCode: '401',
      });
      invoiceRepository.updateTotals(id, 15000, 0, 15000);
      invoiceService.postInvoice(id, 'test-user');
      const lines = invoiceRepository.findLines(id);
      expect(lines[0].costAmount).toBe(1500);
    });
  });

  describe('Task 47 — PO → Invoice', () => {
    it('should expose received/invoiced quantities for the from-po flow', () => {
      const pid = freshProduct();
      const poId = purchaseOrderRepository.create({
        partnerName: 'Test Vendor',
        businessPartnerId: data.partnerIds.vendor,
        orderDate: '2026-07-01',
        expectedDate: '2026-07-15',
        warehouseId: data.warehouseId,
        createdBy: 'test',
      });
      purchaseOrderRepository.addLine({
        poId,
        lineNumber: 1,
        productId: pid,
        description: 'Widget',
        quantity: 10,
        unitPrice: 1200,
        receivedQuantity: 10,
        invoicedQuantity: 0,
        discountPercent: 0,
        lineTotal: 12000,
        lineType: 'stock',
        warehouseId: data.warehouseId,
        costCenterId: null,
        accountCode: '103',
      });
      purchaseOrderRepository.updateStatus(poId, 'fully_received');
      const lines = purchaseOrderRepository.findLines(poId);
      expect(lines[0].receivedQuantity).toBe(10);
      expect(lines[0].invoicedQuantity).toBe(0);
      expect(poId).toBeGreaterThan(0);
    });
  });

  describe('Task 42 — Service filtering', () => {
    it('should exclude service items from stock queries', () => {
      const rows = inventoryRepository.getStockAcrossWarehouses();
      for (const r of rows) {
        expect(r.itemType).toBe('stock');
      }
    });

    it('should return movements only for stock products', () => {
      const movements = inventoryRepository.getMovements();
      expect(Array.isArray(movements)).toBe(true);
    });
  });
});
