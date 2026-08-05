import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from '../test-helper';
import { purchaseOrderRepository } from '../../repositories/purchaseOrderRepository';
import { db } from '../../db';

describe('purchaseOrderRepository', () => {
  let data: any;

  beforeAll(async () => {
    await setupTestDatabase();
    data = seedTestData();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  // Track created PO IDs for cross-test references
  let poId1: number;
  let poId2: number;
  let poId3: number;
  let poId4: number;
  let poId5: number;

  describe('create', () => {
    it('should create a purchase order', () => {
      const id = purchaseOrderRepository.create({
        partnerName: 'Test Vendor',
        orderDate: '2026-07-29',
        expectedDate: '2026-08-12',
        warehouseId: data.warehouseId,
        createdBy: 'test',
      });
      poId1 = id;
      expect(id).toBeGreaterThan(0);

      const po = purchaseOrderRepository.findById(id);
      expect(po).not.toBeNull();
      expect(po!.partnerName).toBe('Test Vendor');
      expect(po!.status).toBe('draft');
      expect(po!.poNumber).toMatch(/^PO-/);
      expect(po!.version).toBe(1);
    });

    it('should create a PO with vendor reference', () => {
      const id = purchaseOrderRepository.create({
        partnerName: 'Acme Supplies',
        orderDate: '2026-07-28',
        expectedDate: '2026-08-11',
        businessPartnerId: data.partnerIds.vendor,
        warehouseId: data.warehouseId,
        referenceNumber: 'PO-REF-001',
        createdBy: 'test',
      });
      poId2 = id;
      expect(id).toBeGreaterThan(0);
      const po = purchaseOrderRepository.findById(id)!;
      expect(po.businessPartnerId).toBe(data.partnerIds.vendor);
      expect(po.referenceNumber).toBe('PO-REF-001');
    });
  });

  describe('addLine', () => {
    it('should add lines to a PO', () => {
      expect(poId1).toBeDefined();
      const lineId = purchaseOrderRepository.addLine({
        poId: poId1, lineNumber: 1,
        productId: data.productIds.widget,
        description: 'Widget - 100 units',
        quantity: 100, unitPrice: 1500,
        receivedQuantity: 0, invoicedQuantity: 0,
        discountPercent: 0, lineTotal: 150000,
        lineType: 'stock', warehouseId: data.warehouseId,
        costCenterId: null, accountCode: '',
      });
      expect(lineId).toBeGreaterThan(0);

      const lines = purchaseOrderRepository.findLines(poId1);
      expect(lines.length).toBe(1);
      expect(lines[0].quantity).toBe(100);
      expect(lines[0].lineTotal).toBe(150000);
    });

    it('should add a service line', () => {
      purchaseOrderRepository.addLine({
        poId: poId1, lineNumber: 2,
        productId: data.productIds.service,
        description: 'Consulting - 10 hours',
        quantity: 10, unitPrice: 10000,
        receivedQuantity: 0, invoicedQuantity: 0,
        discountPercent: 0, lineTotal: 100000,
        lineType: 'service', warehouseId: null,
        costCenterId: null, accountCode: '',
      });

      const lines = purchaseOrderRepository.findLines(poId1);
      expect(lines.length).toBe(2);
      expect(lines[1].lineType).toBe('service');
    });
  });

  describe('updateTotals', () => {
    it('should update PO totals', () => {
      purchaseOrderRepository.updateTotals(poId1, 250000, 300000);
      const po = purchaseOrderRepository.findById(poId1)!;
      expect(po.subtotal).toBe(250000);
      expect(po.vatAmount).toBe(0);
      expect(po.totalAmount).toBe(300000);
    });
  });

  describe('updateStatus', () => {
    it('should approve a PO with user info', () => {
      purchaseOrderRepository.updateStatus(poId1, 'approved', 'test-user');
      const po = purchaseOrderRepository.findById(poId1)!;
      expect(po.status).toBe('approved');
      expect(po.approvedBy).toBe('test-user');
      expect(po.approvedAt).not.toBeNull();
    });

    it('should transition to partially_received', () => {
      purchaseOrderRepository.updateStatus(poId1, 'partially_received');
      const po = purchaseOrderRepository.findById(poId1)!;
      expect(po.status).toBe('partially_received');
    });

    it('should close PO with user info', () => {
      purchaseOrderRepository.updateStatus(poId1, 'closed', 'test-user');
      const po = purchaseOrderRepository.findById(poId1)!;
      expect(po.status).toBe('closed');
      expect(po.closedBy).toBe('test-user');
      expect(po.closedAt).not.toBeNull();
    });

    it('should cancel PO', () => {
      const id = purchaseOrderRepository.create({
        partnerName: 'To Cancel', orderDate: '2026-07-29',
        expectedDate: '2026-08-12', createdBy: 'test',
      });
      purchaseOrderRepository.updateStatus(id, 'cancelled');
      const po = purchaseOrderRepository.findById(id)!;
      expect(po.status).toBe('cancelled');
    });
  });

  describe('findAll', () => {
    beforeAll(() => {
      poId3 = purchaseOrderRepository.create({
        partnerName: 'Vendor A', orderDate: '2026-07-01',
        expectedDate: '2026-07-15', createdBy: 'test',
      });
    });

    it('should return all POs ordered by createdAt desc', () => {
      const all = purchaseOrderRepository.findAll();
      expect(all.length).toBeGreaterThanOrEqual(3);
      expect(new Date(all[0].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(all[all.length - 1].createdAt).getTime());
    });

    it('should filter by status', () => {
      const closed = purchaseOrderRepository.findAll('closed');
      closed.forEach(p => expect(p.status).toBe('closed'));
    });

    it('should search by partner name', () => {
      const results = purchaseOrderRepository.findAll(undefined, 'Vendor');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('deleteLines', () => {
    it('should delete all lines for a PO', () => {
      purchaseOrderRepository.addLine({
        poId: poId2, lineNumber: 1,
        productId: data.productIds.widget,
        description: 'To delete', quantity: 1, unitPrice: 1000,
        receivedQuantity: 0, invoicedQuantity: 0,
        discountPercent: 0, lineTotal: 1000,
        lineType: 'stock', warehouseId: null,
        costCenterId: null, accountCode: '',
      });

      purchaseOrderRepository.deleteLines(poId2);
      const lines = purchaseOrderRepository.findLines(poId2);
      expect(lines.length).toBe(0);
    });
  });

  // ─── Goods Receipt Tests ─────────────────────────────────────────────

  describe('goods receipt', () => {
    beforeAll(() => {
      poId4 = purchaseOrderRepository.create({
        partnerName: 'Receive Test Vendor', orderDate: '2026-07-29',
        expectedDate: '2026-08-12', warehouseId: data.warehouseId, createdBy: 'test',
      });
      purchaseOrderRepository.addLine({
        poId: poId4, lineNumber: 1,
        productId: data.productIds.widget,
        description: 'Widget - 50 units',
        quantity: 50, unitPrice: 1500,
        receivedQuantity: 0, invoicedQuantity: 0,
        discountPercent: 0, lineTotal: 75000,
        lineType: 'stock', warehouseId: data.warehouseId,
        costCenterId: null, accountCode: '',
      });
      purchaseOrderRepository.updateTotals(poId4, 75000, 75000);
      purchaseOrderRepository.updateStatus(poId4, 'approved', 'test');
    });

    it('should create a goods receipt', () => {
      const receiptId = purchaseOrderRepository.createReceipt({
        poId: poId4, receiptDate: '2026-08-01',
        warehouseId: data.warehouseId, createdBy: 'test',
      });
      expect(receiptId).toBeGreaterThan(0);

      const receipts = purchaseOrderRepository.findReceiptsByPO(poId4);
      expect(receipts.length).toBe(1);
      expect(receipts[0].receiptNumber).toMatch(/^GR-/);
    });

    it('should add receipt lines and update PO received quantity', () => {
      const poLine = purchaseOrderRepository.findLines(poId4)[0];

      purchaseOrderRepository.addReceiptLine({
        receiptId: 1, poLineId: poLine.id,
        productId: data.productIds.widget,
        description: 'Received 30 units',
        quantity: 30, unitCost: 1500,
      });
      purchaseOrderRepository.updatePOReceivedQuantity(poLine.id, 30);

      const lines = purchaseOrderRepository.findReceiptLines(1);
      expect(lines.length).toBe(1);
      expect(lines[0].quantity).toBe(30);

      const updatedLines = purchaseOrderRepository.findLines(poId4);
      expect(updatedLines[0].receivedQuantity).toBe(30);
    });

    it('should add a second partial receipt', () => {
      const receiptId = purchaseOrderRepository.createReceipt({
        poId: poId4, receiptDate: '2026-08-05',
        warehouseId: data.warehouseId, createdBy: 'test',
      });
      const poLine = purchaseOrderRepository.findLines(poId4)[0];

      purchaseOrderRepository.addReceiptLine({
        receiptId, poLineId: poLine.id,
        productId: data.productIds.widget,
        description: 'Received remaining 20 units',
        quantity: 20, unitCost: 1550,
      });
      purchaseOrderRepository.updatePOReceivedQuantity(poLine.id, 50);

      const updated = purchaseOrderRepository.findLines(poId4)[0];
      expect(updated.receivedQuantity).toBe(50);
    });

    it('should get receipts with their lines', () => {
      const receipts = purchaseOrderRepository.getReceiptsWithLines(poId4);
      expect(receipts.length).toBeGreaterThanOrEqual(2);
      receipts.forEach(r => {
        expect(r.lines).toBeDefined();
        expect(r.lines.length).toBeGreaterThan(0);
      });
    });
  });

  // ─── Three-way Matching Tests ────────────────────────────────────────

  describe('three-way matching', () => {
    beforeAll(() => {
      poId5 = purchaseOrderRepository.create({
        partnerName: 'Match Test Vendor', orderDate: '2026-07-29',
        expectedDate: '2026-08-12', warehouseId: data.warehouseId, createdBy: 'test',
      });
      purchaseOrderRepository.addLine({
        poId: poId5, lineNumber: 1,
        productId: data.productIds.widget,
        description: 'Widget - 20 units',
        quantity: 20, unitPrice: 2000,
        receivedQuantity: 20, invoicedQuantity: 0,
        discountPercent: 0, lineTotal: 40000,
        lineType: 'stock', warehouseId: data.warehouseId,
        costCenterId: null, accountCode: '',
      });
      purchaseOrderRepository.updateTotals(poId5, 40000, 40000);
    });

    it('should return matching status for PO lines', () => {
      const matching = purchaseOrderRepository.getMatchingStatus(poId5);
      expect(matching.length).toBe(1);
      // receivedQty = 20, orderedQty = 20, invoicedQty = 0
      // Status should be 'matched' (received === ordered) then 'under_invoiced' (invoiced < ordered)
      expect(matching[0].status).toBe('under_invoiced');
      expect(matching[0].orderedQty).toBe(20);
      expect(matching[0].receivedQty).toBe(20);
      expect(matching[0].invoicedQty).toBe(0);
    });

    it('should update invoiced quantity and show current matching status', () => {
      const poLine = purchaseOrderRepository.findLines(poId5)[0];
      purchaseOrderRepository.updatePOInvoicedQuantity(poLine.id, 15);

      const matching = purchaseOrderRepository.getMatchingStatus(poId5);
      expect(matching[0].invoicedQty).toBe(15);
      expect(matching[0].status).toBe('under_invoiced');
    });

    it('should show matched status when invoiced equals ordered', () => {
      const poLine = purchaseOrderRepository.findLines(poId5)[0];
      purchaseOrderRepository.updatePOInvoicedQuantity(poLine.id, 20);

      const matching = purchaseOrderRepository.getMatchingStatus(poId5);
      expect(matching.length).toBe(1);
      expect(matching[0].invoicedQty).toBe(20);
      expect(matching[0].status).toBe('matched');
    });

    it('should show over_invoiced when invoiced exceeds ordered', () => {
      const poLine = purchaseOrderRepository.findLines(poId5)[0];
      purchaseOrderRepository.updatePOInvoicedQuantity(poLine.id, 25);

      const matching = purchaseOrderRepository.getMatchingStatus(poId5);
      expect(matching.length).toBe(1);
      expect(matching[0].invoicedQty).toBe(25);
      expect(matching[0].status).toBe('over_invoiced');
    });

    it('should show under_received when received is less than ordered', () => {
      const id = purchaseOrderRepository.create({
        partnerName: 'UnderReceived Vendor', orderDate: '2026-07-29',
        expectedDate: '2026-08-12', createdBy: 'test',
      });
      purchaseOrderRepository.addLine({
        poId: id, lineNumber: 1,
        productId: data.productIds.widget,
        description: 'Widget - 10 units',
        quantity: 10, unitPrice: 1000,
        receivedQuantity: 5, invoicedQuantity: 0,
        discountPercent: 0, lineTotal: 10000,
        lineType: 'stock', warehouseId: data.warehouseId,
        costCenterId: null, accountCode: '',
      });

      const matching = purchaseOrderRepository.getMatchingStatus(id);
      expect(matching.length).toBe(1);
      expect(matching[0].status).toBe('under_received');
    });
  });
});
