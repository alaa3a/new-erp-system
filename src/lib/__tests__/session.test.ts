import { describe, it, expect } from 'vitest';
import { createSessionCookie, parseSessionCookie } from '../auth/session';

describe('Session Security (HMAC-signed cookies)', () => {
  it('should create a signed cookie with security flags', () => {
    const cookie = createSessionCookie(1);
    expect(cookie).toContain('erp_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Max-Age=');
  });

  it('should parse a valid session cookie back to the user id', () => {
    const cookie = createSessionCookie(42);
    expect(parseSessionCookie(cookie)).toBe(42);
  });

  it('should reject a tampered cookie (signature mismatch)', () => {
    const cookie = 'erp_session=42:tampered_signature; Path=/; HttpOnly';
    expect(parseSessionCookie(cookie)).toBeNull();
  });

  it('should reject a forged cookie', () => {
    const cookie = 'erp_session=1:fakesignature; Path=/; HttpOnly';
    expect(parseSessionCookie(cookie)).toBeNull();
  });

  it('should reject malformed cookies', () => {
    expect(parseSessionCookie('erp_session=42; Path=/; HttpOnly')).toBeNull(); // no signature part
    expect(parseSessionCookie('other_cookie=abc; Path=/')).toBeNull(); // not our cookie
    expect(parseSessionCookie('')).toBeNull();
  });

  it('should reject a valid signature replayed on a different user id', () => {
    const cookie = createSessionCookie(42);
    // Swap the id but keep the original signature — must fail verification.
    const swapped = cookie.replace('erp_session=42:', 'erp_session=43:');
    expect(parseSessionCookie(swapped)).toBeNull();
  });
});
