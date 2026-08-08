import { db } from '../db';

export const productProfileRepository = {
  findAll: () => {
    return db.prepare('SELECT * FROM product_profile WHERE isActive = 1 ORDER BY name').all() as any[];
  },

  findById: (id: number) => {
    return db.prepare('SELECT * FROM product_profile WHERE id = ?').get(id) as any;
  },

  findByCode: (code: string) => {
    return db.prepare('SELECT * FROM product_profile WHERE code = ?').get(code) as any;
  },

  create: (data: any) => {
    const now = new Date().toISOString();
    return db.prepare(
      'INSERT INTO product_profile (code, name, description, itemType, unitOfMeasure, salesVatCodeId, purchaseVatCodeId, defaultWarehouseId, defaultSalesPrice, defaultPurchasePrice, reorderPoint, salesAccountId, purchaseAccountId, inventoryAccountId, cogsAccountId, defaultCostCenterId, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
    ).run(
      data.code, data.name, data.description || '', data.itemType || 'stock',
      data.unitOfMeasure || 'pcs', data.salesVatCodeId || null, data.purchaseVatCodeId || null,
      data.defaultWarehouseId || null, data.defaultSalesPrice || 0, data.defaultPurchasePrice || 0,
      data.reorderPoint || 0, data.salesAccountId || null, data.purchaseAccountId || null,
      data.inventoryAccountId || null, data.cogsAccountId || null, data.defaultCostCenterId || null,
      now, now
    ).lastInsertRowid as number;
  },

  update: (id: number, data: any) => {
    const now = new Date().toISOString();
    return db.prepare(
      'UPDATE product_profile SET code=?, name=?, description=?, itemType=?, unitOfMeasure=?, salesVatCodeId=?, purchaseVatCodeId=?, defaultWarehouseId=?, defaultSalesPrice=?, defaultPurchasePrice=?, reorderPoint=?, salesAccountId=?, purchaseAccountId=?, inventoryAccountId=?, cogsAccountId=?, defaultCostCenterId=?, updatedAt=? WHERE id=?'
    ).run(
      data.code, data.name, data.description || '', data.itemType || 'stock',
      data.unitOfMeasure || 'pcs', data.salesVatCodeId || null, data.purchaseVatCodeId || null,
      data.defaultWarehouseId || null, data.defaultSalesPrice || 0, data.defaultPurchasePrice || 0,
      data.reorderPoint || 0, data.salesAccountId || null, data.purchaseAccountId || null,
      data.inventoryAccountId || null, data.cogsAccountId || null, data.defaultCostCenterId || null,
      now, id
    ).changes > 0;
  },

  softDelete: (id: number) => {
    const now = new Date().toISOString();
    return db.prepare('UPDATE product_profile SET isActive=0, updatedAt=? WHERE id=?').run(now, id).changes > 0;
  },

  getPreset: (id: number) => {
    const profile = db.prepare('SELECT * FROM product_profile WHERE id = ? AND isActive = 1').get(id) as any;
    if (!profile) return null;
    return {
      itemType: profile.itemType,
      unitOfMeasure: profile.unitOfMeasure,
      salesVatCodeId: profile.salesVatCodeId,
      purchaseVatCodeId: profile.purchaseVatCodeId,
      defaultWarehouseId: profile.defaultWarehouseId,
      defaultSalesPrice: profile.defaultSalesPrice,
      defaultPurchasePrice: profile.defaultPurchasePrice,
      reorderPoint: profile.reorderPoint,
      salesAccountId: profile.salesAccountId,
      purchaseAccountId: profile.purchaseAccountId,
      inventoryAccountId: profile.inventoryAccountId,
      cogsAccountId: profile.cogsAccountId,
      defaultCostCenterId: profile.defaultCostCenterId,
    };
  },
};
