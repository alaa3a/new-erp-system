import { db } from '../db';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { inventoryCountRepository } from '../repositories/inventoryCountRepository';
import { notificationRepository } from '../repositories/userRepository';
import { BusinessRuleError, NotFoundError } from '../utils/errors';

/** Fires low-stock notifications for every product below its reorder point (Task 39). */
function checkReorderPoints(): void {
  const alerts = inventoryRepository.getReorderAlerts();
  if (alerts.length === 0) return;
  const allUsers = db.prepare('SELECT id FROM users WHERE isActive = 1').all() as { id: number }[];
  for (const alert of alerts) {
    for (const user of allUsers) {
      notificationRepository.create({
        userId: user.id,
        type: 'warning',
        title: 'Low Stock Alert',
        message: `${alert.productName} (${alert.productCode}) is below reorder point (current: ${alert.quantity}, reorder: ${alert.reorderPoint}) in ${alert.warehouseName}`,
        entityType: 'product',
        entityId: alert.productId,
      });
    }
  }
}

export const inventoryService = {
  /** Public wrapper so invoice posting can trigger low-stock notifications too. */
  checkReorderPoints,
  adjustStock(productId: number, warehouseId: number, newQuantity: number, userId: string, reason?: string): void {
    const current = inventoryRepository.getStock(productId, warehouseId);
    const currentQty = current?.quantity || 0;
    const delta = newQuantity - currentQty;
    if (delta === 0) return;

    inventoryRepository.upsertStock(productId, warehouseId, delta, current?.averageCost || 0);
    inventoryRepository.recordMovement({ type: 'adjustment', productId, warehouseId, quantity: delta, unitCost: current?.averageCost || 0, referenceType: 'adjustment', referenceId: 0, referenceNumber: reason || 'Manual Adjustment', postedBy: userId });
    checkReorderPoints();
  },

  transferStock(productId: number, fromWarehouseId: number, toWarehouseId: number, quantity: number, userId: string): void {
    if (quantity <= 0) throw new BusinessRuleError('Transfer quantity must be positive');
    if (fromWarehouseId === toWarehouseId) throw new BusinessRuleError('Source and destination warehouses must be different');

    // All-or-nothing: both stock updates and both movement records commit or
    // roll back together (Critical Bug Fix #10).
    const transaction = db.transaction(() => {
      const stock = inventoryRepository.getStock(productId, fromWarehouseId);
      if (!stock || stock.available < quantity) {
        const available = stock?.available ?? 0;
        throw new BusinessRuleError(`Insufficient stock: ${available} available (${stock?.quantity ?? 0} on hand, ${stock?.reservedQuantity ?? 0} reserved)`);
      }

      inventoryRepository.upsertStock(productId, fromWarehouseId, -quantity, stock.averageCost);
      inventoryRepository.upsertStock(productId, toWarehouseId, quantity, stock.averageCost);
      inventoryRepository.recordMovement({ type: 'transfer', productId, warehouseId: fromWarehouseId, quantity: -quantity, unitCost: stock.averageCost, referenceType: 'transfer', referenceId: toWarehouseId, referenceNumber: `Transfer to WH-${toWarehouseId}`, postedBy: userId });
      inventoryRepository.recordMovement({ type: 'transfer', productId, warehouseId: toWarehouseId, quantity, unitCost: stock.averageCost, referenceType: 'transfer', referenceId: fromWarehouseId, referenceNumber: `Transfer from WH-${fromWarehouseId}`, postedBy: userId });
    });
    transaction();
    checkReorderPoints();
  },

  getValuation(): any[] {
    return inventoryRepository.getValuation();
  },

  getMovements(productId?: number, warehouseId?: number): any[] {
    return inventoryRepository.getMovements(productId, warehouseId);
  },

  getReorderAlerts() {
    return inventoryRepository.getReorderAlerts();
  },

  /** Reserves on-hand units for an order (Task 38). Validates availability. */
  reserveStock(productId: number, warehouseId: number, quantity: number): void {
    inventoryRepository.reserveStock(productId, warehouseId, quantity);
  },

  /** Releases previously-reserved units (Task 38). */
  releaseStock(productId: number, warehouseId: number, quantity: number): void {
    inventoryRepository.releaseStock(productId, warehouseId, quantity);
  },

  /**
   * Submits a cycle count: applies an adjustment for every line with a
   * non-zero variance and marks the count as adjusted (Task 40).
   */
  submitCount(countId: number, userId: string): void {
    const count = inventoryCountRepository.findById(countId);
    if (!count) throw new NotFoundError('InventoryCount', countId);
    if (count.status !== 'draft') throw new BusinessRuleError('Only draft counts can be submitted');

    const transaction = db.transaction(() => {
      const lines = inventoryCountRepository.findLines(countId);
      for (const line of lines) {
        if (line.variance === 0) continue;
        const current = inventoryRepository.getStock(line.productId, count.warehouseId);
        inventoryRepository.upsertStock(line.productId, count.warehouseId, line.variance, current?.averageCost || 0);
        inventoryRepository.recordMovement({
          type: 'adjustment',
          productId: line.productId,
          warehouseId: count.warehouseId,
          quantity: line.variance,
          unitCost: current?.averageCost || 0,
          referenceType: 'adjustment',
          referenceId: countId,
          referenceNumber: `Cycle count ${count.countNumber}`, // passed as referenceNumber
          postedBy: userId,
        });
      }
      inventoryCountRepository.updateStatus(countId, 'adjusted', new Date().toISOString());
    });
    transaction();
    checkReorderPoints();
  },
};
