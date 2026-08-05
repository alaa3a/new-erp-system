import { db } from '../db';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { BusinessRuleError } from '../utils/errors';

export const inventoryService = {
  adjustStock(productId: number, warehouseId: number, newQuantity: number, userId: string, reason?: string): void {
    const current = inventoryRepository.getStock(productId, warehouseId);
    const currentQty = current?.quantity || 0;
    const delta = newQuantity - currentQty;
    if (delta === 0) return;

    inventoryRepository.upsertStock(productId, warehouseId, delta, current?.averageCost || 0);
    inventoryRepository.recordMovement({ type: 'adjustment', productId, warehouseId, quantity: delta, unitCost: current?.averageCost || 0, referenceType: 'adjustment', referenceId: 0, referenceNumber: reason || 'Manual Adjustment', postedBy: userId });
  },

  transferStock(productId: number, fromWarehouseId: number, toWarehouseId: number, quantity: number, userId: string): void {
    if (quantity <= 0) throw new BusinessRuleError('Transfer quantity must be positive');

    // All-or-nothing: both stock updates and both movement records commit or
    // roll back together (Critical Bug Fix #10).
    const transaction = db.transaction(() => {
      const stock = inventoryRepository.getStock(productId, fromWarehouseId);
      if (!stock || stock.quantity < quantity) throw new BusinessRuleError('Insufficient stock');

      inventoryRepository.upsertStock(productId, fromWarehouseId, -quantity, stock.averageCost);
      inventoryRepository.upsertStock(productId, toWarehouseId, quantity, stock.averageCost);
      inventoryRepository.recordMovement({ type: 'transfer', productId, warehouseId: fromWarehouseId, quantity: -quantity, unitCost: stock.averageCost, referenceType: 'transfer', referenceId: toWarehouseId, referenceNumber: `Transfer to WH-${toWarehouseId}`, postedBy: userId });
      inventoryRepository.recordMovement({ type: 'transfer', productId, warehouseId: toWarehouseId, quantity, unitCost: stock.averageCost, referenceType: 'transfer', referenceId: fromWarehouseId, referenceNumber: `Transfer from WH-${fromWarehouseId}`, postedBy: userId });
    });
    transaction();
  },

  getValuation(): any[] {
    return inventoryRepository.getValuation();
  },

  getMovements(productId?: number, warehouseId?: number): any[] {
    return inventoryRepository.getMovements(productId, warehouseId);
  },
};
