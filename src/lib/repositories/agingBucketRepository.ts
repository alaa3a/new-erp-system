import { db } from '../db';
import type { AgingBucket } from '@/types/erp';

export const agingBucketRepository = {
  findAll: (): AgingBucket[] =>
    (db.prepare('SELECT * FROM aging_bucket ORDER BY sortOrder ASC').all() as any[]).map(r => ({
      ...r, version: r.version as number,
    })),

  update: (id: number, data: { label: string; fromDays: number; toDays: number; sortOrder: number }, version: number): boolean => {
    const now = new Date().toISOString();
    return db.prepare(
      'UPDATE aging_bucket SET label=?, fromDays=?, toDays=?, sortOrder=?, updatedAt=?, version=version+1 WHERE id=? AND version=?'
    ).run(data.label, data.fromDays, data.toDays, data.sortOrder, now, id, version).changes > 0;
  },
};
