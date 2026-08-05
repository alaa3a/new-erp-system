import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from '../test-helper';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { purchaseOrderRepository } from '../../repositories/purchaseOrderRepository';
import { inventoryRepository } from '../../repositories/inventoryRepository';
import { invoiceRepository } from '../../repositories/invoiceRepository';
import { hasPermission } from '../../auth/permissions';
import { invoiceService } from '../../services/invoiceService';
import { db } from '../../db';
import { BusinessRuleError, NotFoundError, ForbiddenError } from '../../utils/errors';
import { User } from '@/types/erp';

describe('Purchase Order Integration', () => {
  let data: any;

  beforeAll(async () => {
    await setupTestDatabase();
    data = seedTestData();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  function createDraftPO(partnerName: string = 'Test Vendor', qty: number = 10): number {
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
      description: 'Widget - stock item',
      quantity: qty, unitPrice: 1500,
      receivedQuantity: 0, invoicedQuantity: 0,
      discountPercent: 0, lineTotal: qty * 1500,
      lineType: 'stock', warehouseId: data.warehouseId,
      costCenterId: null, accountCode: '',
    });

    purchaseOrderRepository.updateTotals(id, qty * 1500, qty * 1500);
    return id;
  }

  function createApprovedPO(partnerName: string = 'Approved Vendor', qty: number = 10): number {
    const id = createDraftPO(partnerName, qty);
    purchaseOrderService.approvePO(id, 'approver-user');
    return id;
  }

  function createPurchaseInvoice(partnerName: string = 'Test Vendor', qty: number = 10, productId: number = data.productIds.widget): number {
    const invoiceId = invoiceRepository.create({
      type: 'purchase',
      partnerName,
      invoiceDate: '2026-08-01',
      dueDate: '2026-08-31',
      warehouseId: data.warehouseId,
      createdBy: 'test',
    });

    invoiceRepository.addLine({
      invoiceId, lineNumber: 1,
      productId,
      description: 'Widget - stock item',
      quantity: qty, unitPrice: 1500,
      discountPercent: 0, vatCodeId: null, vatRate: 0,
      vatAmount: 0, lineTotal: qty * 1500,
      lineType: 'stock', warehouseId: data.warehouseId,
      costCenterId: null, accountCode: '',
    });
    invoiceRepository.updateTotals(invoiceId, qty * 1500, 0, qty * 1500);
    return invoiceId;
  }

  describe('Full PO workflow: create → approve → receive → match → close', () => {
    it('should complete the full PO lifecycle', () => {
      // 1. Create draft PO
      const poId = createDraftPO('Full Lifecycle Vendor', 20);
      let po = purchaseOrderRepository.findById(poId)!;
      expect(po.status).toBe('draft');

      // 2. Approve PO
      purchaseOrderService.approvePO(poId, 'procurement-manager');
      po = purchaseOrderRepository.findById(poId)!;
      expect(po.status).toBe('approved');
      expect(po.approvedBy).toBe('procurement-manager');

      // 3. Receive goods
      const poLine = purchaseOrderRepository.findLines(poId)[0];
      purchaseOrderService.receiveGoods(poId, [
        { poLineId: poLine.id, productId: data.productIds.widget, description: 'Received 20 units', quantity: 20, unitCost: 1500 },
      ], data.warehouseId, 'warehouse-user');

      po = purchaseOrderRepository.findById(poId)!;
      expect(po.status).toBe('fully_received');
      const lines = purchaseOrderRepository.findLines(poId);
      expect(lines[0].receivedQuantity).toBe(20);

      // Verify stock increased
      const stock = inventoryRepository.getStock(data.productIds.widget, data.warehouseId);
      expect(stock!.quantity).toBe(20);

      // 4. Match invoice
      const invoiceId = createPurchaseInvoice('Full Lifecycle Vendor', 20);
      purchaseOrderService.matchInvoice(poId, invoiceId);

      const matchedLines = purchaseOrderRepository.findLines(poId);
      expect(matchedLines[0].invoicedQuantity).toBe(20);

      // Verify invoice is linked
      const invoice = invoiceRepository.findById(invoiceId)!;
      expect(invoice.purchaseOrderId).toBe(poId);

      // 5. Close PO
      purchaseOrderService.closePO(poId, 'procurement-manager');
      po = purchaseOrderRepository.findById(poId)!;
      expect(po.status).toBe('closed');
      expect(po.closedBy).toBe('procurement-manager');
    });

    it('should handle partial receipt then full receipt', () => {
      const poId = createApprovedPO('Partial Receipt Vendor', 20);
      const poLine = purchaseOrderRepository.findLines(poId)[0];

      // Record stock before receiving (may have been modified by earlier tests)
      const stockBefore = inventoryRepository.getStock(data.productIds.widget, data.warehouseId);
      const qtyBefore = stockBefore?.quantity ?? 0;

      // Receive partial (10 of 20)
      purchaseOrderService.receiveGoods(poId, [
        { poLineId: poLine.id, productId: data.productIds.widget, description: 'First batch', quantity: 10, unitCost: 1500 },
      ], data.warehouseId, 'receiver');

      let po = purchaseOrderRepository.findById(poId)!;
      expect(po.status).toBe('partially_received');
      let lines = purchaseOrderRepository.findLines(poId);
      expect(lines[0].receivedQuantity).toBe(10);

      // Receive remaining (10 of 20)
      purchaseOrderService.receiveGoods(poId, [
        { poLineId: poLine.id, productId: data.productIds.widget, description: 'Second batch', quantity: 10, unitCost: 1550 },
      ], data.warehouseId, 'receiver');

      po = purchaseOrderRepository.findById(poId)!;
      expect(po.status).toBe('fully_received');
      lines = purchaseOrderRepository.findLines(poId);
      expect(lines[0].receivedQuantity).toBe(20);

      // Stock should reflect total received (20 more than before)
      const stock = inventoryRepository.getStock(data.productIds.widget, data.warehouseId);
      expect(stock!.quantity).toBe(qtyBefore + 20);
    });

    it('should handle partial invoice matching', () => {
      const poId = createApprovedPO('Partial Invoice Vendor', 20);
      const poLine = purchaseOrderRepository.findLines(poId)[0];

      // Receive all goods
      purchaseOrderService.receiveGoods(poId, [
        { poLineId: poLine.id, productId: data.productIds.widget, description: 'All 20 units', quantity: 20, unitCost: 1500 },
      ], data.warehouseId, 'receiver');

      // Match partial invoice (10 of 20)
      const invoiceId1 = createPurchaseInvoice('Partial Invoice Vendor', 10);
      purchaseOrderService.matchInvoice(poId, invoiceId1);

      let lines = purchaseOrderRepository.findLines(poId);
      expect(lines[0].invoicedQuantity).toBe(10);

      // Match remaining invoice (10 of 20)
      const invoiceId2 = createPurchaseInvoice('Partial Invoice Vendor', 10);
      purchaseOrderService.matchInvoice(poId, invoiceId2);

      lines = purchaseOrderRepository.findLines(poId);
      expect(lines[0].invoicedQuantity).toBe(20);
    });

    it('should track matching status correctly', () => {
      const poId = createApprovedPO('Status Tracking Vendor', 30);
      const poLine = purchaseOrderRepository.findLines(poId)[0];

      // Initial status: under_received, under_invoiced
      let status = purchaseOrderRepository.getMatchingStatus(poId);
      expect(status[0].status).toBe('under_received');

      // Receive partial (15 of 30)
      purchaseOrderService.receiveGoods(poId, [
        { poLineId: poLine.id, productId: data.productIds.widget, description: 'Partial receipt', quantity: 15, unitCost: 1500 },
      ], data.warehouseId, 'receiver');

      status = purchaseOrderRepository.getMatchingStatus(poId);
      expect(status[0].status).toBe('under_received');

      // Receive all
      purchaseOrderService.receiveGoods(poId, [
        { poLineId: poLine.id, productId: data.productIds.widget, description: 'Remaining receipt', quantity: 15, unitCost: 1500 },
      ], data.warehouseId, 'receiver');

      status = purchaseOrderRepository.getMatchingStatus(poId);
      expect(status[0].status).toBe('under_invoiced');

      // Match invoice
      const invoiceId = createPurchaseInvoice('Status Tracking Vendor', 30);
      purchaseOrderService.matchInvoice(poId, invoiceId);

      status = purchaseOrderRepository.getMatchingStatus(poId);
      expect(status[0].status).toBe('matched');
    });

    it('should handle unlinking an invoice', () => {
      const poId = createApprovedPO('Unlink Vendor', 10);
      const poLine = purchaseOrderRepository.findLines(poId)[0];

      // Receive and match
      purchaseOrderService.receiveGoods(poId, [
        { poLineId: poLine.id, productId: data.productIds.widget, description: 'All goods', quantity: 10, unitCost: 1500 },
      ], data.warehouseId, 'receiver');

      const invoiceId = createPurchaseInvoice('Unlink Vendor', 10);
      purchaseOrderService.matchInvoice(poId, invoiceId);

      let lines = purchaseOrderRepository.findLines(poId);
      expect(lines[0].invoicedQuantity).toBe(10);

      // Unlink invoice
      purchaseOrderService.unlinkInvoice(poId, invoiceId);

      lines = purchaseOrderRepository.findLines(poId);
      expect(lines[0].invoicedQuantity).toBe(0);

      const invoice = invoiceRepository.findById(invoiceId)!;
      expect(invoice.purchaseOrderId).toBeNull();
    });
  });

  describe('PO receiving edge cases', () => {
    it('should reject receiving against a draft PO', () => {
      const poId = createDraftPO();

      expect(() => purchaseOrderService.receiveGoods(poId, [], data.warehouseId, 'receiver'))
        .toThrow(/must be approved/);
    });

    it('should reject receiving against a closed PO', () => {
      const poId = createApprovedPO();
      purchaseOrderRepository.updateStatus(poId, 'closed', 'system');

      expect(() => purchaseOrderService.receiveGoods(poId, [], data.warehouseId, 'receiver'))
        .toThrow(/closed/);
    });

    it('should reject receiving more than ordered quantity', () => {
      const poId = createApprovedPO('Overflow Vendor', 5);
      const poLine = purchaseOrderRepository.findLines(poId)[0];

      expect(() => purchaseOrderService.receiveGoods(poId, [
        { poLineId: poLine.id, productId: data.productIds.widget, description: 'Too much', quantity: 10, unitCost: 1500 },
      ], data.warehouseId, 'receiver')).toThrow(/exceed ordered quantity/);
    });

    it('should reject receiving against a cancelled PO', () => {
      const poId = createApprovedPO();
      purchaseOrderRepository.updateStatus(poId, 'cancelled');

      expect(() => purchaseOrderService.receiveGoods(poId, [], data.warehouseId, 'receiver'))
        .toThrow(/closed/);
    });
  });

  describe('PO invoice matching edge cases', () => {
    it('should reject matching to a draft PO', () => {
      const poId = createDraftPO();
      const invoiceId = createPurchaseInvoice();

      expect(() => purchaseOrderService.matchInvoice(poId, invoiceId))
        .toThrow(/draft purchase order/);
    });

    it('should reject matching when invoice quantity exceeds PO', () => {
      const poId = createApprovedPO('Over Invoice Vendor', 5);
      const invoiceId = createPurchaseInvoice('Over Invoice Vendor', 10);

      expect(() => purchaseOrderService.matchInvoice(poId, invoiceId))
        .toThrow(/exceeds ordered quantity/);
    });

    it('should reject unlinking an invoice not linked to this PO', () => {
      const poId = createApprovedPO();
      const invoiceId = createPurchaseInvoice();

      expect(() => purchaseOrderService.unlinkInvoice(poId, invoiceId))
        .toThrow(/not linked/);
    });
  });
});

describe('Permission Denied Scenarios', () => {
  let data: any;
  let adminUser: User;
  let limitedUser: User;

  beforeAll(async () => {
    await setupTestDatabase();
    data = seedTestData();

    const adminRow = db.prepare("SELECT * FROM users WHERE email = 'admin@erp.local'").get() as any;
    adminUser = {
      id: adminRow.id, email: adminRow.email, passwordHash: adminRow.passwordHash,
      firstName: adminRow.firstName, lastName: adminRow.lastName,
      permissionIds: JSON.parse(adminRow.permissionIds || '[]'),
      isActive: true, lastLoginAt: null,
      createdAt: adminRow.createdAt, updatedAt: adminRow.updatedAt, version: adminRow.version,
    };

    limitedUser = {
      id: 999, email: 'limited@test.com', passwordHash: '',
      firstName: 'Limited', lastName: 'User',
      permissionIds: [], isActive: true, lastLoginAt: null,
      createdAt: '', updatedAt: '', version: 1,
    };
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  describe('Permission checks on invoice operations', () => {
    it('should allow admin to approve invoices', () => {
      expect(hasPermission(adminUser, 'invoice.approve')).toBe(true);
    });

    it('should deny user without invoice.approve permission', () => {
      expect(hasPermission(limitedUser, 'invoice.approve')).toBe(false);
    });

    it('should deny user without invoice.post permission', () => {
      expect(hasPermission(limitedUser, 'invoice.post')).toBe(false);
    });

    it('should deny user without invoice.payment permission', () => {
      expect(hasPermission(limitedUser, 'invoice.payment')).toBe(false);
    });

    it('should allow admin to post invoices', () => {
      expect(hasPermission(adminUser, 'invoice.post')).toBe(true);
    });

    it('should allow admin to create invoices', () => {
      expect(hasPermission(adminUser, 'invoice.create')).toBe(true);
    });

    it('should deny user without invoice.create permission', () => {
      expect(hasPermission(limitedUser, 'invoice.create')).toBe(false);
    });
  });

  describe('Permission checks on PO operations', () => {
    it('should allow admin to approve POs', () => {
      expect(hasPermission(adminUser, 'purchaseOrder.approve')).toBe(true);
    });

    it('should deny user without purchaseOrder.approve permission', () => {
      expect(hasPermission(limitedUser, 'purchaseOrder.approve')).toBe(false);
    });

    it('should allow admin to receive goods', () => {
      expect(hasPermission(adminUser, 'purchaseOrder.receive')).toBe(true);
    });

    it('should deny user without purchaseOrder.receive permission', () => {
      expect(hasPermission(limitedUser, 'purchaseOrder.receive')).toBe(false);
    });

    it('should allow admin to close POs', () => {
      expect(hasPermission(adminUser, 'purchaseOrder.close')).toBe(true);
    });

    it('should deny user without purchaseOrder.close permission', () => {
      expect(hasPermission(limitedUser, 'purchaseOrder.close')).toBe(false);
    });
  });

  describe('Permission checks on entry operations', () => {
    it('should allow admin to post entries', () => {
      expect(hasPermission(adminUser, 'entry.post')).toBe(true);
    });

    it('should deny user without entry.post permission', () => {
      expect(hasPermission(limitedUser, 'entry.post')).toBe(false);
    });

    it('should deny user without entry.create permission', () => {
      expect(hasPermission(limitedUser, 'entry.create')).toBe(false);
    });
  });

  describe('Permission checks on inventory operations', () => {
    it('should allow admin to adjust inventory', () => {
      expect(hasPermission(adminUser, 'inventory.adjust')).toBe(true);
    });

    it('should deny user without inventory.adjust permission', () => {
      expect(hasPermission(limitedUser, 'inventory.adjust')).toBe(false);
    });
  });

  describe('Permission checks on user management', () => {
    it('should allow admin to manage users', () => {
      expect(hasPermission(adminUser, 'user.manage')).toBe(true);
    });

    it('should deny regular user from managing users', () => {
      expect(hasPermission(limitedUser, 'user.manage')).toBe(false);
    });
  });

  describe('ForbiddenError scenarios at service layer', () => {
    it('should throw NotFoundError for non-existent invoice', () => {
      expect(() => invoiceService.approveInvoice(99999, 'test'))
        .toThrow(NotFoundError);
    });

    it('should throw NotFoundError for non-existent PO', () => {
      expect(() => purchaseOrderService.approvePO(99999, 'test'))
        .toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for approving non-draft PO', () => {
      const poId = purchaseOrderRepository.create({
        partnerName: 'Test Vendor',
        orderDate: '2026-07-29',
        expectedDate: '2026-08-12',
        createdBy: 'test',
      });
      purchaseOrderRepository.updateStatus(poId, 'cancelled');

      expect(() => purchaseOrderService.approvePO(poId, 'test'))
        .toThrow(BusinessRuleError);
    });
  });

  describe('Permission with specific permission grants', () => {
    it('should grant access when user has specific permission', () => {
      const invoicePerm = db.prepare("SELECT id FROM permission WHERE key = 'invoice.approve'").get() as any;
      const userWithOnePerm: User = {
        ...limitedUser,
        permissionIds: [invoicePerm.id],
      };

      expect(hasPermission(userWithOnePerm, 'invoice.approve')).toBe(true);
      expect(hasPermission(userWithOnePerm, 'invoice.post')).toBe(false);
      expect(hasPermission(userWithOnePerm, 'purchaseOrder.approve')).toBe(false);
    });

    it('should handle user with multiple specific permissions', () => {
      const perm1 = db.prepare("SELECT id FROM permission WHERE key = 'invoice.view'").get() as any;
      const perm2 = db.prepare("SELECT id FROM permission WHERE key = 'invoice.create'").get() as any;
      const perm3 = db.prepare("SELECT id FROM permission WHERE key = 'purchaseOrder.view'").get() as any;

      const userWithPerms: User = {
        ...limitedUser,
        permissionIds: [perm1.id, perm2.id, perm3.id],
      };

      expect(hasPermission(userWithPerms, 'invoice.view')).toBe(true);
      expect(hasPermission(userWithPerms, 'invoice.create')).toBe(true);
      expect(hasPermission(userWithPerms, 'purchaseOrder.view')).toBe(true);
      expect(hasPermission(userWithPerms, 'invoice.approve')).toBe(false);
      expect(hasPermission(userWithPerms, 'purchaseOrder.approve')).toBe(false);
    });

    it('should return false for non-existent permission key', () => {
      expect(hasPermission(adminUser, 'nonexistent.permission')).toBe(false);
    });
  });
});
