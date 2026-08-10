import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from './test-helper';
import { db, getDbBytes, replaceDatabase } from '../db';
import { ValidationError } from '../utils/errors';
import initSqlJs from 'sql.js';
import path from 'path';

const DEFAULT_SQLJS_OPTS = {
  locateFile: (f: string) => path.join(process.cwd(), 'node_modules/sql.js/dist', f),
};

describe('db backup / restore', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('getDbBytes returns bytes that load into a fresh SQL.Database', async () => {
    const bytes = getDbBytes();
    expect(bytes.length).toBeGreaterThan(0);
    const SQL = await initSqlJs(DEFAULT_SQLJS_OPTS);
    const fresh = new SQL.Database(bytes);
    const rows = fresh.exec('SELECT count(1) AS c FROM account');
    expect(rows[0].values[0][0]).toBeGreaterThan(0);
    fresh.close();
  });

  it('replaceDatabase swaps the shared db to the uploaded file', async () => {
    // Capture the normal DB before any swap so we can restore it afterwards.
    const originalBytes = getDbBytes();
    const originalCount = db.prepare('SELECT count(1) AS c FROM account').get<{ c: number }>()!.c;

    // Build a separate, valid ERP-shaped file carrying a distinguishable marker row.
    const SQL = await initSqlJs(DEFAULT_SQLJS_OPTS);
    const marker = new SQL.Database();
    marker.run('CREATE TABLE account (id INTEGER PRIMARY KEY, code TEXT, name TEXT, type TEXT)');
    marker.run('CREATE TABLE audit_log (id INTEGER PRIMARY KEY, userId INTEGER, action TEXT, entityType TEXT, entityId INTEGER, entityNumber TEXT, changes TEXT, ipAddress TEXT, userAgent TEXT, createdAt TEXT)');
    marker.run("INSERT INTO account (code, name, type) VALUES ('MARKER-1', 'Marker Account', 'asset')");
    const markerBytes = marker.export();
    marker.close();

    try {
      // The uploaded file becomes the database: the marker must be visible.
      await replaceDatabase(markerBytes);
      const markerCount = db.prepare('SELECT count(1) AS c FROM account WHERE code = ?').get<{ c: number }>('MARKER-1')!.c;
      expect(markerCount).toBe(1);
    } finally {
      // Always restore the normal DB so a failing assertion can't pollute later tests.
      await replaceDatabase(originalBytes);
    }

    // Prove the original DB is back.
    const markerGone = db.prepare('SELECT count(1) AS c FROM account WHERE code = ?').get<{ c: number }>('MARKER-1')!.c;
    const restoredCount = db.prepare('SELECT count(1) AS c FROM account').get<{ c: number }>()!.c;
    expect(markerGone).toBe(0);
    expect(restoredCount).toBe(originalCount);
  });

  it('replaceDatabase rejects an empty upload', async () => {
    await expect(replaceDatabase(new Uint8Array([]))).rejects.toThrow(ValidationError);
  });

  it('replaceDatabase rejects random bytes', async () => {
    await expect(replaceDatabase(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(ValidationError);
  });

  it('replaceDatabase rejects a valid SQLite DB without the account table', async () => {
    const SQL = await initSqlJs(DEFAULT_SQLJS_OPTS);
    const other = new SQL.Database();
    other.run('CREATE TABLE foo (id INTEGER)');
    const bytes = other.export();
    other.close();
    await expect(replaceDatabase(bytes)).rejects.toThrow(ValidationError);
  });

  it('replaceDatabase rejects a valid SQLite DB without the audit_log table', async () => {
    const SQL = await initSqlJs(DEFAULT_SQLJS_OPTS);
    const other = new SQL.Database();
    other.run('CREATE TABLE account (id INTEGER PRIMARY KEY, code TEXT, name TEXT, type TEXT)');
    const bytes = other.export();
    other.close();
    await expect(replaceDatabase(bytes)).rejects.toThrow(ValidationError);
  });
});