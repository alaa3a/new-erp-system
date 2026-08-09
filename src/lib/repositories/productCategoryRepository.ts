import { db } from '../db';

export const productCategoryRepository = {
  findAll: (search?: string) => {
    let sql = 'SELECT * FROM product_category WHERE deletedAt IS NULL';
    const params: any[] = [];
    if (search) {
      sql += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY code';
    return db.prepare(sql).all(...params) as any[];
  },

  findById: (id: number) => {
    return db.prepare('SELECT * FROM product_category WHERE id = ? AND deletedAt IS NULL').get(id) as any;
  },

  findChildren: (parentId: number) => {
    return db.prepare('SELECT * FROM product_category WHERE parentId = ? AND deletedAt IS NULL ORDER BY code').all(parentId) as any[];
  },

  getTree: () => {
    const rows = db.prepare('SELECT * FROM product_category WHERE deletedAt IS NULL ORDER BY code').all() as any[];
    const map = new Map<number, any>();
    rows.forEach(r => map.set(r.id, { ...r, children: [] }));
    const roots: any[] = [];
    map.forEach(node => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  },

  create: (data: any) => {
    const now = new Date().toISOString();
    return db.prepare(
      'INSERT INTO product_category (code, name, description, parentId, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
    ).run(data.code, data.name, data.description || '', data.parentId || null, data.isActive !== false ? 1 : 0, now, now).lastInsertRowid as number;
  },

  update: (id: number, data: any) => {
    const now = new Date().toISOString();
    return db.prepare(
      'UPDATE product_category SET code=?, name=?, description=?, parentId=?, isActive=?, updatedAt=? WHERE id=? AND deletedAt IS NULL'
    ).run(data.code, data.name, data.description || '', data.parentId || null, data.isActive !== false ? 1 : 0, now, id).changes > 0;
  },

  softDelete: (id: number) => {
    const now = new Date().toISOString();
    return db.prepare('UPDATE product_category SET deletedAt=?, updatedAt=? WHERE id=?').run(now, now, id).changes > 0;
  },

  restore: (id: number) => {
    const now = new Date().toISOString();
    return db.prepare('UPDATE product_category SET deletedAt=NULL, updatedAt=? WHERE id=?').run(now, id).changes > 0;
  },

  isAncestor: (categoryId: number, targetId: number) => {
    let current = db.prepare('SELECT parentId FROM product_category WHERE id = ?').get(targetId) as any;
    const guard = 0;
    while (current && current.parentId && guard < 100) {
      if (current.parentId === categoryId) return true;
      current = db.prepare('SELECT parentId FROM product_category WHERE id = ?').get(current.parentId) as any;
    }
    return false;
  },

  getChildCount: (parentId: number) => {
    return (db.prepare('SELECT count(1) AS count FROM product_category WHERE parentId = ?').get(parentId) as any)?.count || 0;
  },

  getProductCount: (categoryId: number) => {
    return (db.prepare('SELECT count(1) AS count FROM product WHERE categoryId = ? AND deletedAt IS NULL').get(categoryId) as any)?.count || 0;
  },
};
