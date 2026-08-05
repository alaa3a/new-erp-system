import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from '../test-helper';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { purchaseOrderRepository } from '../../repositories/purchaseOrderRepository';
import { inventoryRepository } from '../../repositories/inventoryRepository';
import { invoiceRepository } from '../../repositories/invoiceRepository';
import { BusinessRuleError, NotFoundError } from '../../utils/errors';

describe('purchaseOrderService', () => {
  let data: any;

  beforeAll(async () => {
    await setupTestDatabase();
    data = seedTestData();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  function createDraftPO(partnerName: string = 'Test Vendor'): number {
    const id = purchaseOrderRepository.create({
      partnerName,
      orderDate: '2026-07-29',
      expectedDate: '2026-08-12',
      warehouseId: data.warehouseId,
      createdBy: 'test',
    });

    purchaseOrderRepository.addLine({
      poId: id, lineNumber: 1,
      productId: data.productIds.widget,
      description: 'Widget - 10 units',
      quantity: 10, unitPrice: 1500,
      receivedQuantity: 0, invoicedQuantity: 0,
      discountPercent: 0, lineTotal: 15000,
      lineType: 'stock', warehouseId: data.warehouseId,
      costCenterId: null, accountCode: '',
    });

    purchaseOrderRepository.updateTotals(id, 15000, 15000);
    return id;
  }

  function createApprovedPO(partnerName: string = 'Approved Vendor'): number {
    const id = createDraftPO(partnerName);
    purchaseOrderService.approvePO(id, 'test-user');
    return id;
  }

  // ─── Approve ──────────────────────────────────────────────────────────

  describe('approvePO', () => {
    it('should approve a draft PO', () => {
      const id = createDraftPO();
      purchaseOrderService.approvePO(id, 'test-user');

      const po = purchaseOrderRepository.findById(id)!;
      expect(po.status).toBe('approved');
      expect(po.approvedBy).toBe('test-user');
      expect(po.approvedAt).not.toBeNull();
      expect(po.version).toBe(2);
    });

    it('should throw NotFoundError for non-existent PO', () => {
      expect(() => purchaseOrderService.approvePO(99999, 'test'))
        .toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for already approved PO', () => {
      const id = createApprovedPO();
      expect(() => purchaseOrderService.approvePO(id, 'user2'))
        .toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError for cancelled PO', () => {
      const id = createDraftPO();
      purchaseOrderRepository.updateStatus(id, 'cancelled');
      expect(() => purchaseOrderService.approvePO(id, 'test'))
        .toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError for closed PO', () => {
      const id = createApprovedPO();
      purchaseOrderRepository.updateStatus(id, 'closed', 'system');
      expect(() => purchaseOrderService.approvePO(id, 'test'))
        .toThrow(BusinessRuleError);
    });
  });

  // ─── Receive Goods ────────────────────────────────────────────────────

  describe('receiveGoods', () => {
    it('should receive goods against an approved PO', () => {
      const poId = createApprovedPO();
      const poLine = purchaseOrderRepository.findLines(poId)[0];

      purchaseOrderService.receiveGoods(poId, [
        { poLineId: poLine.id, productId: data.productIds.widget, description: 'Received 10 units', quantity: 10, unitCost: 1500 },
      ], data.warehouseId, 'test-user');

      const po = purchaseOrderRepository.findById(poId)!;
      expect(po.status).toBe('fully_received');

      const lines = purchaseOrderRepository.findLines(poId);
      expect(lines[0].receivedQuantity).toBe(10);

      // Check stock was updated
      const stock = inventoryRepository.getStock(data.productIds.widget, data.warehouseId);
      expect(stock!.quantity).toBe(10);
    });

    it('should throw NotFoundError for non-existent PO', () => {
      expect(() => purchaseOrderService.receiveGoods(99999, [], data.warehouseId, 'test'))
        .toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for draft PO', () => {
      const id = createDraftPO();
      expect(() => purchaseOrderService.receiveGoods(id, [], data.warehouseId, 'test'))
        .toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError for closed PO', () => {
      const id = createApprovedPO();
      purchaseOrderRepository.updateStatus(id, 'closed', 'system');
      expect(() => purchaseOrderService.receiveGoods(id, [], data.warehouseId, 'test'))
        .toThrow(BusinessRuleError);
    });

    it('should throw NotFoundError for invalid PO line', () => {
      const poId = createApprovedPO();
      expect(() => purchaseOrderService.receiveGoods(poId, [
        { poLineId: 99999, productId: data.productIds.widget, description: 'Bad line', quantity: 1, unitCost: 1000 },
      ], data.warehouseId, 'test')).toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError when receiving exceeds ordered quantity', () => {
      const poId = createApprovedPO('Overflow Vendor');
      const poLine = purchaseOrderRepository.findLines(poId)[0];

      // Try to receive 15 units when only 10 were ordered
      expect(() => purchaseOrderService.receiveGoods(poId, [
        { poLineId: poLine.id, productId: data.productIds.widget, description: 'Too many', quantity: 15, unitCost: 1500 },
      ], data.warehouseId, 'test')).toThrow(BusinessRuleError);
    });

    it('should handle partial receipt and set PO to partially_received', () => {
      const poId = createApprovedPO('Partial Vendor');
      const poLine = purchaseOrderRepository.findLines(poId)[0];

      // Receive 6 of 10 units
      purchaseOrderService.receiveGoods(poId, [
        { poLineId: poLine.id, productId: data.productIds.widget, description: 'Partial - 6 units', quantity: 6, unitCost: 1500 },
      ], data.warehouseId, 'test-user');

      const po = purchaseOrderRepository.findById(poId)!;
      expect(po.status).toBe('partially_received');

      const lines = purchaseOrderRepository.findLines(poId);
      expect(lines[0].receivedQuantity).toBe(6);

      // Receive remaining 4 units
      purchaseOrderService.receiveGoods(poId, [
        { poLineId: poLine.id, productId: data.productIds.widget, description: 'Remaining 4 units', quantity: 4, unitCost: 1600 },
      ], data.warehouseId, 'test-user');

      const po2 = purchaseOrderRepository.findById(poId)!;
      expect(po2.status).toBe('fully_received');
      const lines2 = purchaseOrderRepository.findLines(poId);
      expect(lines2[0].receivedQuantity).toBe(10);
    });
  });

  // ─── Match Invoice ───────────────────────────────────────────────────

  describe('matchInvoice', () => {
    function createPurchaseInvoiceForPO(poId: number): number {
      // Create a sales invoice (we need an invoice to match against the PO)
      const invoiceId = invoiceRepository.create({
        type: 'purchase',
        partnerName: 'Test Vendor',
        invoiceDate: '2026-08-01',
        dueDate: '2026-08-31',
        warehouseId: data.warehouseId,
        createdBy: 'test',
      });

      const poLine = purchaseOrderRepository.findLines(poId)[0];
      invoiceRepository.addLine({
        invoiceId, lineNumber: 1,
        productId: data.productIds.widget,
        description: poLine.description,
        quantity: 10, unitPrice: 1500,
        discountPercent: 0, vatCodeId: null, vatRate: 0,
        vatAmount: 0, lineTotal: 15000,
        lineType: 'stock', warehouseId: data.warehouseId,
        costCenterId: null, accountCode: '',
      });
      invoiceRepository.updateTotals(invoiceId, 15000, 0, 15000);
      return invoiceId;
    }

    it('should match invoice lines to PO lines', () => {
      const poId = createApprovedPO();
      const invoiceId = createPurchaseInvoiceForPO(poId);

      purchaseOrderService.matchInvoice(poId, invoiceId);

      const lines = purchaseOrderRepository.findLines(poId);
      expect(lines[0].invoicedQuantity).toBe(10);
    });

    it('should throw NotFoundError for non-existent PO', () => {
      expect(() => purchaseOrderService.matchInvoice(99999, 1))
        .toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for draft PO', () => {
      const poId = createDraftPO();
      expect(() => purchaseOrderService.matchInvoice(poId, 1))
        .toThrow(BusinessRuleError);
    });

    it('should throw NotFoundError for non-existent invoice', () => {
      const poId = createApprovedPO();
      expect(() => purchaseOrderService.matchInvoice(poId, 99999))
        .toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError when invoice exceeds PO quantity', () => {
      const poId = createApprovedPO('Oversized Invoice Vendor');
      const invoiceId = invoiceRepository.create({
        type: 'purchase',
        partnerName: 'Test Vendor',
        invoiceDate: '2026-08-01',
        dueDate: '2026-08-31',
        warehouseId: data.warehouseId,
        createdBy: 'test',
      });

      const poLine = purchaseOrderRepository.findLines(poId)[0];
      invoiceRepository.addLine({
        invoiceId, lineNumber: 1,
        productId: data.productIds.widget,
        description: 'Too many items invoiced',
        quantity: 20, unitPrice: 1500,
        discountPercent: 0, vatCodeId: null, vatRate: 0,
        vatAmount: 0, lineTotal: 30000,
        lineType: 'stock', warehouseId: data.warehouseId,
        costCenterId: null, accountCode: '',
      });
      invoiceRepository.updateTotals(invoiceId, 30000, 0, 30000);

      expect(() => purchaseOrderService.matchInvoice(poId, invoiceId))
        .toThrow(BusinessRuleError);
    });
  });

  // ─── Close ────────────────────────────────────────────────────────────

  describe('closePO', () => {
    it('should close an approved PO', () => {
      const id = createApprovedPO('To Close');

      purchaseOrderService.closePO(id, 'test-user');

      const po = purchaseOrderRepository.findById(id)!;
      expect(po.status).toBe('closed');
      expect(po.closedBy).toBe('test-user');
      expect(po.closedAt).not.toBeNull();
    });

    it('should close a fully_received PO', () => {
      const poId = createApprovedPO('Fully Received to Close');
      const poLine = purchaseOrderRepository.findLines(poId)[0];
      purchaseOrderService.receiveGoods(poId, [
        { poLineId: poLine.id, productId: data.productIds.widget, description: 'All goods', quantity: 10, unitCost: 1500 },
      ], data.warehouseId, 'test');

      purchaseOrderService.closePO(poId, 'test-user');

      const po = purchaseOrderRepository.findById(poId)!;
      expect(po.status).toBe('closed');
    });

    it('should throw NotFoundError for non-existent PO', () => {
      expect(() => purchaseOrderService.closePO(99999, 'test'))
        .toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for cancelled PO', () => {
      const id = createDraftPO();
      purchaseOrderRepository.updateStatus(id, 'cancelled');
      expect(() => purchaseOrderService.closePO(id, 'test'))
        .toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError for draft PO', () => {
      const id = createDraftPO();
      expect(() => purchaseOrderService.closePO(id, 'test'))
        .toThrow(BusinessRuleError);
    });
  });
});
