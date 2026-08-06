import { db } from '../db';
import { User } from '@/types/erp';
import { createHmac, timingSafeEqual } from 'crypto';

const SESSION_COOKIE = 'erp_session';
const SESSION_MAX_AGE = 86400;

/**
 * Session secret — always set SESSION_SECRET in production. The dev fallback
 * keeps local development working but must never be used in production
 * (Critical Bug Fix #11: cookies are HMAC-signed, so a known secret would let
 * anyone forge sessions).
 */
function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    // Throwing in production prevents silently running with a forgeable secret.
    throw new Error('SESSION_SECRET must be set in production');
  }
  return secret || 'dev-secret-change-in-production';
}

function sign(data: string): string {
  return createHmac('sha256', getSecret()).update(data).digest('base64url');
}

function verify(data: string, signature: string): boolean {
  const expected = sign(data);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export function getCurrentUser(request: Request): User | null {
  const cookie = request.headers.get('cookie') || '';
  const userId = parseSessionCookie(cookie);
  if (!userId) return null;

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
    status: row.status || (row.isActive === 1 ? 'active' : 'suspended'),
    forcePasswordChange: row.forcePasswordChange === 1,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

/**
 * Parses and verifies a session cookie header. Cookie format is
 * `erp_session=<userId>:<hmac-sha256-signature>` — any tampered or forged
 * value fails the signature check and returns null.
 */
export function parseSessionCookie(cookieHeader: string): number | null {
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;

  const value = match[1];
  const parts = value.split(':');
  if (parts.length !== 2) return null;

  const [userIdStr, signature] = parts;
  const userId = parseInt(userIdStr, 10);
  if (isNaN(userId)) return null;

  if (!verify(userIdStr, signature)) return null;

  return userId;
}

export function createSessionCookie(userId: number): string {
  const data = String(userId);
  const signature = sign(data);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${data}:${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function setLastLogin(userId: number): void {
  db.prepare('UPDATE users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?').run(
    new Date().toISOString(),
    new Date().toISOString(),
    userId,
  );
}
