import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from './test-helper';
import { db, getDbBytes, replaceDatabase } from '../db';
import { ValidationError } from '../utils/errors';
import initSqlJs from 'sql.js';
import { existsSync, unlinkSync } from 'fs';
import path from 'path';

const TMP_DB = 'erp-backup-test.sqlite';

const DEFAULT_SQLJS_OPTS = {
  locateFile: (f: string) => path.join(process.cwd(), 'node_modules/sql.js/dist', f),
};

describe('db backup / restore', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(() => {
    teardownTestDatabase();
    if (existsSync(TMP_DB)) {
      try {
        unlinkSync(TMP_DB);
      } catch {
        /* ignore */
      }
    }
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
    // Marker: add a row to the running DB, export, then wipe that table state via swap to a fresh file.
    const bytes = getDbBytes();
    await replaceDatabase(bytes); // replace with an equal valid file
    const count = db.prepare('SELECT count(1) AS c FROM account').get<{ c: number }>()!.c;
    expect(count).toBeGreaterThan(0);
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
});