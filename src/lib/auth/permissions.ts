import { db } from '../db';
import { canUser } from '../db';
import { User } from '@/types/erp';

export function hasPermission(user: User, permissionKey: string): boolean {
  return canUser(user.permissionIds, permissionKey);
}

export function hasAnyPermission(user: User, permissionKeys: string[]): boolean {
  return permissionKeys.some((key) => hasPermission(user, key));
}

export function hasAllPermissions(user: User, permissionKeys: string[]): boolean {
  return permissionKeys.every((key) => hasPermission(user, key));
}

export function getUserPermissions(user: User): string[] {
  if (user.permissionIds.length === 0) return [];
  const placeholders = user.permissionIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT key FROM permission WHERE id IN (${placeholders})`).all(...user.permissionIds) as any[];
  return rows.map((r) => r.key);
}

export function getAllPermissions(): Array<{ id: number; key: string; module: string; action: string; description: string }> {
  return db.prepare('SELECT id, key, module, action, description FROM permission ORDER BY module, action').all() as any[];
}

export function updateUserPermissions(userId: number, permissionIds: number[]): void {
  db.prepare('UPDATE users SET permissionIds = ?, updatedAt = ? WHERE id = ?').run(
    JSON.stringify(permissionIds),
    new Date().toISOString(),
    userId,
  );
}
