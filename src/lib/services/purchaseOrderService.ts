import { db } from '../db';
import { purchaseOrderRepository } from '../repositories/purchaseOrderRepository';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { invoiceRepository } from '../repositories/invoiceRepository';
import { notificationRepository } from '../repositories/userRepository';
import { BusinessRuleError, NotFoundError } from '../utils/errors';

export const purchaseOrderService = {
  approvePO(poId: number, userId: string): void {
    const po = purchaseOrderRepository.findById(poId);
    if (!po) throw new NotFoundError('PurchaseOrder', poId);
    if (po.status !== 'draft') throw new BusinessRuleError('Only draft purchase orders can be approved');

    const transaction = db.transaction(() => {
      purchaseOrderRepository.updateStatus(poId, 'approved', userId);

      const allUsers = db.prepare('SELECT id FROM users WHERE isActive = 1').all() as { id: number }[];
      for (const user of allUsers) {
        notificationRepository.create({
          userId: user.id, type: 'success',
          title: 'Purchase Order Approved',
          message: `${po.poNumber} — ${po.partnerName} has been approved.`,
          entityType: 'purchase_order', entityId: poId,
        });
      }
    });
    transaction();
  },

  receiveGoods(poId: number, lines: Array<{ poLineId: number; productId: number; description: string; quantity: number; unitCost: number }>, warehouseId: number, userId: string): void {
    const po = purchaseOrderRepository.findById(poId);
    if (!po) throw new NotFoundError('PurchaseOrder', poId);
    if (po.status === 'draft') throw new BusinessRuleError('Purchase order must be approved before receiving');
    if (po.status === 'closed' || po.status === 'cancelled') throw new BusinessRuleError('Cannot receive against closed/cancelled purchase order');

    const transaction = db.transaction(() => {
      const receiptId = purchaseOrderRepository.createReceipt({
        poId, receiptDate: new Date().toISOString().split('T')[0],
        warehouseId, createdBy: userId,
      });

      let hasPartial = false;
      let allFull = true;

      for (const line of lines) {
        const poLines = purchaseOrderRepository.findLines(poId);
        const poLine = poLines.find(pl => pl.id === line.poLineId);
        if (!poLine) throw new NotFoundError('PurchaseOrderLine', line.poLineId);

        const newReceived = poLine.receivedQuantity + line.quantity;
        if (newReceived > poLine.quantity) throw new BusinessRuleError(`Receiving ${line.quantity} units for line ${poLine.lineNumber} would exceed ordered quantity of ${poLine.quantity}`);

        purchaseOrderRepository.addReceiptLine({
          receiptId, poLineId: line.poLineId,
          productId: line.productId, description: line.description,
          quantity: line.quantity, unitCost: line.unitCost,
        });
        purchaseOrderRepository.updatePOReceivedQuantity(line.poLineId, newReceived);

        // Update stock
        inventoryRepository.upsertStock(line.productId, warehouseId, line.quantity, line.unitCost);
        inventoryRepository.recordMovement({
          type: 'receipt', productId: line.productId, warehouseId,
          quantity: line.quantity, unitCost: line.unitCost,
          referenceType: 'purchase_order', referenceId: poId,
          referenceNumber: po.poNumber, postedBy: userId,
        });

        if (newReceived < poLine.quantity) hasPartial = true;
      }

      // Update PO status
      if (hasPartial) {
        purchaseOrderRepository.updateStatus(poId, 'partially_received');
        // Update receipt status to partial
        db.prepare('UPDATE goods_receipt SET status = ? WHERE id = ?').run('partial', receiptId);
      } else {
        purchaseOrderRepository.updateStatus(poId, 'fully_received');
      }

      // Notifications
      const allUsers = db.prepare('SELECT id FROM users WHERE isActive = 1').all() as { id: number }[];
      for (const user of allUsers) {
        notificationRepository.create({
          userId: user.id, type: 'info',
          title: 'Goods Received',
          message: `GR-${receiptId} — ${po.poNumber} from ${po.partnerName}.`,
          entityType: 'purchase_order', entityId: poId,
        });
      }
    });
    transaction();
  },

  matchInvoice(poId: number, invoiceId: number): void {
    const po = purchaseOrderRepository.findById(poId);
    if (!po) throw new NotFoundError('PurchaseOrder', poId);
    if (po.status === 'draft') throw new BusinessRuleError('Cannot match invoice to draft purchase order');

    const invoice = invoiceRepository.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);

    const transaction = db.transaction(() => {
      const poLines = purchaseOrderRepository.findLines(poId);
      const invLines = invoiceRepository.findLines(invoiceId);

      // For each PO line, update invoiced quantity based on matching invoice lines
      for (const poLine of poLines) {
        const matchedInvLines = invLines.filter(il => il.productId === poLine.productId);
        const totalInvoiced = matchedInvLines.reduce((sum, il) => sum + il.quantity, 0);
        const cumulativeInvoiced = poLine.invoicedQuantity + totalInvoiced;

        if (cumulativeInvoiced > poLine.quantity) {
          throw new BusinessRuleError(`Line ${poLine.lineNumber}: invoiced quantity (${cumulativeInvoiced}) exceeds ordered quantity (${poLine.quantity})`);
        }
        purchaseOrderRepository.updatePOInvoicedQuantity(poLine.id, cumulativeInvoiced);
      }

      // Link PO to invoice
      db.prepare('UPDATE invoice SET purchaseOrderId = ? WHERE id = ?').run(poId, invoiceId);

      const allUsers = db.prepare('SELECT id FROM users WHERE isActive = 1').all() as { id: number }[];
      for (const user of allUsers) {
        notificationRepository.create({
          userId: user.id, type: 'info',
          title: 'Invoice Matched',
          message: `Invoice ${invoice.invoiceNumber} matched to ${po.poNumber}.`,
          entityType: 'purchase_order', entityId: poId,
        });
      }
    });
    transaction();
  },

  unlinkInvoice(poId: number, invoiceId: number): void {
    const po = purchaseOrderRepository.findById(poId);
    if (!po) throw new NotFoundError('PurchaseOrder', poId);

    const invoice = invoiceRepository.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    if (invoice.purchaseOrderId !== poId) {
      throw new BusinessRuleError('Invoice is not linked to this purchase order');
    }

    const transaction = db.transaction(() => {
      const poLines = purchaseOrderRepository.findLines(poId);
      const invLines = invoiceRepository.findLines(invoiceId);

      // Subtract invoice quantities from PO line invoiced quantities
      for (const poLine of poLines) {
        const matchedInvLines = invLines.filter(il => il.productId === poLine.productId);
        const totalToSubtract = matchedInvLines.reduce((sum, il) => sum + il.quantity, 0);
        const newInvoiced = Math.max(0, poLine.invoicedQuantity - totalToSubtract);
        purchaseOrderRepository.updatePOInvoicedQuantity(poLine.id, newInvoiced);
      }

      // Unlink PO from invoice
      db.prepare('UPDATE invoice SET purchaseOrderId = NULL WHERE id = ?').run(invoiceId);

      const allUsers = db.prepare('SELECT id FROM users WHERE isActive = 1').all() as { id: number }[];
      for (const user of allUsers) {
        notificationRepository.create({
          userId: user.id, type: 'info',
          title: 'Invoice Unlinked',
          message: `Invoice ${invoice.invoiceNumber} unlinked from ${po.poNumber}.`,
          entityType: 'purchase_order', entityId: poId,
        });
      }
    });
    transaction();
  },

  closePO(poId: number, userId: string): void {
    const po = purchaseOrderRepository.findById(poId);
    if (!po) throw new NotFoundError('PurchaseOrder', poId);
    if (po.status === 'cancelled') throw new BusinessRuleError('Purchase order is already cancelled');
    if (po.status === 'draft') throw new BusinessRuleError('Cannot close a draft purchase order');

    const transaction = db.transaction(() => {
      purchaseOrderRepository.updateStatus(poId, 'closed', userId);

      const allUsers = db.prepare('SELECT id FROM users WHERE isActive = 1').all() as { id: number }[];
      for (const user of allUsers) {
        notificationRepository.create({
          userId: user.id, type: 'info',
          title: 'Purchase Order Closed',
          message: `${po.poNumber} — ${po.partnerName} has been closed.`,
          entityType: 'purchase_order', entityId: poId,
        });
      }
    });
    transaction();
  },
};
