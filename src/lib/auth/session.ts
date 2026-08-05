import { db } from '../db';
import { User } from '@/types/erp';

const SESSION_COOKIE = 'erp_session';

export function getCurrentUser(request: Request): User | null {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;

  const userId = parseInt(match[1], 10);
  if (isNaN(userId)) return null;

  const row = db.prepare('SELECT * FROM users WHERE id = ? AND isActive = 1').get(userId) as any;
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    firstName: row.firstName,
    lastName: row.lastName,
    permissionIds: JSON.parse(row.permissionIds || '[]'),
    isActive: row.isActive === 1,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export function createSessionCookie(userId: number): string {
  return `${SESSION_COOKIE}=${userId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function setLastLogin(userId: number): void {
  db.prepare('UPDATE users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?').run(
    new Date().toISOString(),
    new Date().toISOString(),
    userId,
  );
}
