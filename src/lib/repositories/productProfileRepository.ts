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
      'INSERT INTO product_profile (code, name, description, salesVatCodeId, purchaseVatCodeId, salesAccountId, purchaseAccountId, inventoryAccountId, cogsAccountId, arAccountId, apAccountId, cashAccountId, discountAccountId, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
    ).run(
      data.code, data.name, data.description || '', data.salesVatCodeId || null, data.purchaseVatCodeId || null,
      data.salesAccountId || null, data.purchaseAccountId || null, data.inventoryAccountId || null,
      data.cogsAccountId || null, data.arAccountId || null, data.apAccountId || null,
      data.cashAccountId || null, data.discountAccountId || null,
      now, now
    ).lastInsertRowid as number;
  },

  update: (id: number, data: any) => {
    const now = new Date().toISOString();
    return db.prepare(
      'UPDATE product_profile SET code=?, name=?, description=?, salesVatCodeId=?, purchaseVatCodeId=?, salesAccountId=?, purchaseAccountId=?, inventoryAccountId=?, cogsAccountId=?, arAccountId=?, apAccountId=?, cashAccountId=?, discountAccountId=?, updatedAt=? WHERE id=?'
    ).run(
      data.code, data.name, data.description || '', data.salesVatCodeId || null, data.purchaseVatCodeId || null,
      data.salesAccountId || null, data.purchaseAccountId || null, data.inventoryAccountId || null,
      data.cogsAccountId || null, data.arAccountId || null, data.apAccountId || null,
      data.cashAccountId || null, data.discountAccountId || null,
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
      salesVatCodeId: profile.salesVatCodeId,
      purchaseVatCodeId: profile.purchaseVatCodeId,
      salesAccountId: profile.salesAccountId,
      purchaseAccountId: profile.purchaseAccountId,
      inventoryAccountId: profile.inventoryAccountId,
      cogsAccountId: profile.cogsAccountId,
      arAccountId: profile.arAccountId,
      apAccountId: profile.apAccountId,
      cashAccountId: profile.cashAccountId,
      discountAccountId: profile.discountAccountId,
    };
  },
};