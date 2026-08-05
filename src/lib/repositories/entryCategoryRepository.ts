import { db, ensureCategorySequence } from '../db';

function mapRow(row: any) {
  return {
    ...row,
    isActive: row.isActive === 1,
  };
}

export const entryCategoryRepository = {
  findAll: () => (db.prepare('SELECT * FROM entry_category WHERE isActive = 1 ORDER BY code ASC').all() as any[]).map(mapRow),
  findById: (id: number) => { const r = db.prepare('SELECT * FROM entry_category WHERE id = ?').get(id) as any; return r ? mapRow(r) : null; },
  create: (data: any) => {
    const now = new Date().toISOString();
    const id = db.prepare('INSERT INTO entry_category (code, name, description, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, 1)')
      .run(data.code, data.name, data.description || '', data.isActive !== false ? 1 : 0, now, now).lastInsertRowid as number;
    // Per-category entry sequence (JE-<CODE>-) so entries auto-number by category
    ensureCategorySequence(id, data.code);
    return id;
  },
  update: (id: number, data: any, version: number) => {
    const now = new Date().toISOString();
    return db.prepare('UPDATE entry_category SET code=?, name=?, description=?, isActive=?, updatedAt=?, version=version+1 WHERE id=? AND version=?')
      .run(data.code, data.name, data.description, data.isActive !== false ? 1 : 0, now, id, version).changes > 0;
  },
  /**
   * Soft-delete a category, atomically refusing when any entry still references it.
   * Returns 'deleted' | 'in_use' | 'conflict'.
   */
  softDelete: (id: number, version: number): 'deleted' | 'in_use' | 'conflict' => {
    const now = new Date().toISOString();
    const inUse = (db.prepare('SELECT count(1) AS count FROM entry WHERE categoryId = ?').get(id) as any)?.count ?? 0;
    if (inUse > 0) return 'in_use';
    const ok = db.prepare('UPDATE entry_category SET isActive=0, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(now, id, version).changes > 0;
    return ok ? 'deleted' : 'conflict';
  },
  /** Number of journal entries currently referencing this category */
  entryCount: (id: number) => (db.prepare('SELECT count(1) AS count FROM entry WHERE categoryId = ?').get(id) as any)?.count ?? 0,
  /** categoryId -> entry count map for all categories */
  entryCountMap: (): Record<number, number> => {
    const rows = db.prepare('SELECT categoryId, count(1) AS count FROM entry WHERE categoryId IS NOT NULL GROUP BY categoryId').all() as any[];
    const map: Record<number, number> = {};
    for (const r of rows) map[r.categoryId] = r.count;
    return map;
  },
};
