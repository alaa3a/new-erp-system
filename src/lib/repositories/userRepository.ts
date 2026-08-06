import { db } from '../db';

export const userRepository = {
  findAll: () => (db.prepare('SELECT id, email, firstName, lastName, permissionIds, isActive, status, forcePasswordChange, lastLoginAt, createdAt, updatedAt, version FROM users').all() as any[]).map(r => ({ ...r, permissionIds: JSON.parse(r.permissionIds || '[]'), isActive: r.isActive === 1, forcePasswordChange: r.forcePasswordChange === 1 })),
  findById: (id: number) => { const r = db.prepare('SELECT id, email, firstName, lastName, permissionIds, isActive, status, forcePasswordChange, lastLoginAt, createdAt, updatedAt, version FROM users WHERE id = ?').get(id) as any; return r ? { ...r, permissionIds: JSON.parse(r.permissionIds || '[]'), isActive: r.isActive === 1, forcePasswordChange: r.forcePasswordChange === 1 } : null; },
  findByEmail: (email: string) => { const r = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any; return r ? { ...r, permissionIds: JSON.parse(r.permissionIds || '[]'), isActive: r.isActive === 1, forcePasswordChange: r.forcePasswordChange === 1 } : null; },
  create: (data: any) => { const now = new Date().toISOString(); return db.prepare('INSERT INTO users (email, passwordHash, firstName, lastName, permissionIds, isActive, status, forcePasswordChange, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').run(data.email, data.passwordHash, data.firstName, data.lastName, JSON.stringify(data.permissionIds || []), data.isActive !== false ? 1 : 0, data.status || (data.isActive !== false ? 'active' : 'suspended'), data.forcePasswordChange ? 1 : 0, now, now).lastInsertRowid as number; },
  update: (id: number, data: any, version: number) => { const now = new Date().toISOString(); return db.prepare('UPDATE users SET firstName=?, lastName=?, isActive=?, status=?, forcePasswordChange=?, permissionIds=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(data.firstName, data.lastName, data.isActive !== false ? 1 : 0, data.status || (data.isActive !== false ? 'active' : 'suspended'), data.forcePasswordChange ? 1 : 0, JSON.stringify(data.permissionIds || []), now, id, version).changes > 0; },
  softDelete: (id: number, version: number) => db.prepare('UPDATE users SET isActive=0, status=\'suspended\', updatedAt=?, version=version+1 WHERE id=? AND version=?').run(new Date().toISOString(), id, version).changes > 0,
  updatePermissions: (id: number, permissionIds: number[]) => db.prepare('UPDATE users SET permissionIds=?, updatedAt=? WHERE id=?').run(JSON.stringify(permissionIds), new Date().toISOString(), id),
  setLastLogin: (id: number) => db.prepare('UPDATE users SET lastLoginAt=?, updatedAt=? WHERE id=?').run(new Date().toISOString(), new Date().toISOString(), id),
};

export const auditLogRepository = {
  log: (data: { userId: number; action: string; entityType: string; entityId: number; entityNumber?: string; changes?: any; ipAddress?: string; userAgent?: string }) => {
    db.prepare('INSERT INTO audit_log (userId, action, entityType, entityId, entityNumber, changes, ipAddress, userAgent, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      data.userId, data.action, data.entityType, data.entityId, data.entityNumber || '',
      data.changes ? JSON.stringify(data.changes) : null, data.ipAddress || '', data.userAgent || '', new Date().toISOString(),
    );
  },
  findAll: (filters?: { entityType?: string; userId?: number; action?: string }) => {
    let sql = 'SELECT al.*, u.firstName, u.lastName FROM audit_log al LEFT JOIN users u ON u.id = al.userId WHERE 1=1';
    const params: any[] = [];
    if (filters?.entityType) { sql += ' AND al.entityType = ?'; params.push(filters.entityType); }
    if (filters?.userId) { sql += ' AND al.userId = ?'; params.push(filters.userId); }
    if (filters?.action) { sql += ' AND al.action = ?'; params.push(filters.action); }
    sql += ' ORDER BY al.createdAt DESC LIMIT 500';
    return db.prepare(sql).all(...params);
  },
};

export const notificationRepository = {
  findByUser: (userId: number) => db.prepare('SELECT * FROM notification WHERE userId = ? ORDER BY createdAt DESC LIMIT 50').all(userId),
  markRead: (id: number) => db.prepare('UPDATE notification SET isRead = 1 WHERE id = ?').run(id),
  markAllRead: (userId: number) => db.prepare('UPDATE notification SET isRead = 1 WHERE userId = ? AND isRead = 0').run(userId),
  create: (data: { userId: number; type: string; title: string; message: string; entityType?: string; entityId?: number }) => {
    db.prepare('INSERT INTO notification (userId, type, title, message, entityType, entityId, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?)').run(
      data.userId, data.type, data.title, data.message, data.entityType || null, data.entityId || null, new Date().toISOString(),
    );
  },
  getUnreadCount: (userId: number) => (db.prepare('SELECT count(1) AS count FROM notification WHERE userId = ? AND isRead = 0').get(userId) as any).count,
};
