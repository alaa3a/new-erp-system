# Chart of Accounts Backup & Restore (raw DB file) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two buttons to the Chart of Accounts page — Backup downloads the raw SQLite DB file, Restore uploads a `.sqlite` file back to replace the running database. No merging, no remapping.

**Architecture:** `db.ts` (sql.js, DB state on `globalThis`) gains `getDbBytes()` (wraps `state.db.export()`) and `replaceDatabase(bytes)` (loads a new `SQL.Database`, validates the `account` table exists, closes old, assigns `state.db`, persists to disk). Two thin API routes wrap these. The page gets Backup/Restore toolbar buttons.

**Tech Stack:** Next.js App Router, sql.js, `requireAuth`/`requirePermission`, `useToast`, client-side Blob download + `<input type="file">`.

**Spec:** `docs/superpowers/specs/2026-08-10-coa-backup-design.md`

## Global Constraints

- Backup route: `requireAuth` only. Restore route: `requirePermission(request, 'settings.manage')` (permission seeded in `src/lib/db.ts:1106`).
- Restore is **whole-file replacement** — the uploaded file becomes the entire DB. Never merge.
- `replaceDatabase` validates before swapping: empty bytes, invalid SQLite, or missing `account` table → ValidationError; the running DB is untouched on rejection.
- All tests: `npx vitest run <file>` and `npx tsc --noEmit` after each task. Restore generated `next-env.d.ts` churn with `git checkout -- next-env.d.ts`.
- sql.js type shim: `db.export(): Uint8Array`, `new SQL.Database(bytes)`, `db.exec(sql)` all available (`src/types/sql.js.d.ts`).
- No `rg` in PowerShell — use the `grep` tool for searches. No code comments unless surrounding style uses them.

---

### Task 1: `db.ts` — `getDbBytes()` + `replaceDatabase()`

**Files:**
- Modify: `src/lib/db.ts` (add two exported functions near `resetForTest` at line 1257; add them to the export at line 1265)
- Test: `src/lib/__tests__/db-backup.test.ts` (Create)

**Interfaces:**
- Consumes: existing `getState()`, `ensureSync()`, `DB_PATH`, `initSqlJs` with the `locateFile` config pattern from `ensureDb` (line 180-182).
- Produces:
  - `export function getDbBytes(): Uint8Array` — returns `ensureSync().export()`.
  - `export async function replaceDatabase(bytes: Uint8Array): Promise<void>` — validate → swap → persist. Throws `ValidationError` from `@/lib/utils/errors` on bad input.
  - `export function getDbFilePath(): string` — returns `DB_PATH` (used by the Task 2 status route).

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/db-backup.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from './test-helper';
import { db, getDbBytes, replaceDatabase } from './db';
import { ValidationError } from './utils/errors';
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';

const TMP_DB = 'erp-backup-test.sqlite';

describe('db backup / restore', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(() => {
    teardownTestDatabase();
    if (existsSync(TMP_DB)) { try { unlinkSync(TMP_DB); } catch { /* ignore */ } }
  });

  it('getDbBytes returns bytes that load into a fresh SQL.Database', async () => {
    const bytes = getDbBytes();
    expect(bytes.length).toBeGreaterThan(0);
    const SQL = await initSqlJs({ locateFile: (f) => `node_modules/sql.js/dist/${f}` });
    const fresh = new SQL.Database(bytes);
    const rows = fresh.exec("SELECT count(1) AS c FROM account");
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
    const SQL = await initSqlJs({ locateFile: (f) => `node_modules/sql.js/dist/${f}` });
    const other = new SQL.Database();
    other.run('CREATE TABLE foo (id INTEGER)');
    const bytes = other.export();
    other.close();
    await expect(replaceDatabase(bytes)).rejects.toThrow(ValidationError);
  });
});
```

Note: `db`'s `Statement.get` needs the `cap` generic — the test queries `account` which the seed always creates, so `count > 0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/db-backup.test.ts -v`
Expected: FAIL — `getDbBytes is not a function` / `replaceDatabase is not a function`.

- [ ] **Step 3: Implement `getDbBytes` and `replaceDatabase`**

Add to `src/lib/db.ts`, immediately before `resetForTest` (line 1256):

```ts
/** Export the full in-memory database as raw SQLite bytes (for backup downloads). */
function getDbExportBytes(): Uint8Array {
  return ensureSync().export();
}

/** Replace the running database with an uploaded SQLite file. Validates before swapping. */
async function replaceDatabaseHelper(bytes: Uint8Array): Promise<void> {
  const state = getState();
  if (!bytes || bytes.length === 0) {
    throw new ValidationError('Uploaded backup file is empty');
  }
  const SQL = await initSqlJs({
    locateFile: (file: string) => path.join(process.cwd(), 'node_modules/sql.js/dist', file),
  });
  let candidate: SqlJsDatabase;
  try {
    candidate = new SQL.Database(bytes);
  } catch {
    throw new ValidationError('Uploaded file is not a valid SQLite database');
  }
  const check = candidate.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='account'");
  if (!check.length || !check[0].values.length) {
    candidate.close();
    throw new ValidationError('Uploaded file is not an ERP database (no account table)');
  }
  const previous = state.db;
  state.db = candidate;
  // Requirement: export helper must read from the *new* db, so make the public
  // name read from state. We persist below using the reassigned db.
  state.inTransaction = false;
  candidate.exec('PRAGMA foreign_keys = ON');
  if (previous) { try { previous.close(); } catch { /* ignore */ } }
  // Persist the new database to disk immediately.
  const data = candidate.export();
  writeFileSync(DB_PATH, Buffer.from(data));
  state.initialized = true;
}
```

Now wire exports. Just above `resetForTest` (line 1256) the names are internal; export them publicly:

```ts
export async function replaceDatabase(bytes: Uint8Array): Promise<void> {
  const state = getState();
  if (state.inTransaction) throw new ValidationError('Cannot restore database while a transaction is open');
  await replaceDatabaseHelper(bytes);
  void state.db;
}

export function getDbBytes(): Uint8Array {
  return getDbExportBytes();
}

export function getDbFilePath(): string {
  return DB_PATH;
}

/** Reset the database module state for testing. Only use in test suites. */
function resetForTest(): void {
```

Add a `import { ValidationError } from '@/lib/utils/errors';` at the top of `src/lib/db.ts` (line 5 already imports from `@/lib/auth/password`; add a second import line).

Update the module export at line 1265:

```ts
export { db, ensureDb, initDb, getNextSequence, ensureSequence, sanitizeCategoryCode, ensureCategorySequence, canUser, seedInitialData, ensureInitialized, resetForTest, flushPendingSave, getDbBytes, replaceDatabase, getDbFilePath };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/db-backup.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` — fix errors; `git checkout -- next-env.d.ts` if it churned.
Commit:
```bash
git add src/lib/db.ts src/lib/__tests__/db-backup.test.ts
git commit -m "feat: db getDbBytes + replaceDatabase for raw SQLite backup/restore"
```

---

### Task 2: API routes — backup (GET) + status (GET) + restore (POST)

**Files:**
- Create: `src/app/api/accounts/backup/route.ts`
- Create: `src/app/api/accounts/backup/status/route.ts`
- Create: `src/app/api/accounts/restore/route.ts`

**Interfaces:**
- Consumes: `getDbBytes`, `replaceDatabase` from Task 1; `requireAuth`/`requirePermission` from `@/lib/auth/middleware`; `ensureInitialized` from `@/lib/db`; `handleApiError` from `@/lib/utils/errors`; `auditLogRepository` from `@/lib/repositories/userRepository`; `NextResponse` from `next/server`.
- Produces: `GET /api/accounts/backup` → octet-stream attachment `erp-backup-YYYY-MM-DD.sqlite`; `GET /api/accounts/backup/status` → `{ success: true, data: { sizeBytes, lastModifiedAt } }`; `POST /api/accounts/restore` → `{ success: true, data: { restored: true } }`; errors via `handleApiError`.

- [ ] **Step 1: Create backup route**

Create `src/app/api/accounts/backup/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { ensureInitialized, getDbBytes } from '@/lib/db';
import { handleApiError } from '@/lib/utils/errors';

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    const bytes = getDbBytes();
    const date = new Date().toISOString().slice(0, 10);
    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="erp-backup-${date}.sqlite"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 2: Create status route**

Create `src/app/api/accounts/backup/status/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { statSync } from 'fs';
import { requireAuth } from '@/lib/auth/middleware';
import { ensureInitialized, getDbFilePath } from '@/lib/db';
import { handleApiError } from '@/lib/utils/errors';

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    await ensureInitialized();
    let sizeBytes = 0;
    let lastModifiedAt: string | null = null;
    try {
      const st = statSync(getDbFilePath());
      sizeBytes = st.size;
      lastModifiedAt = new Date(st.mtime).toISOString();
    } catch {
      // DB file not yet persisted to disk — return zeros/null.
    }
    return NextResponse.json({ success: true, data: { sizeBytes, lastModifiedAt } });
  } catch (error) {
    return handleApiError(error);
  }
}
```

This needs `getDbFilePath()` exported from `db.ts` — add it in Task 1 (see note below if it's missing).

- [ ] **Step 3: Create restore route**

Create `src/app/api/accounts/restore/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/middleware';
import { replaceDatabase } from '@/lib/db';
import { auditLogRepository } from '@/lib/repositories/userRepository';
import { handleApiError } from '@/lib/utils/errors';

export async function POST(request: Request) {
  try {
    const auth = await requirePermission(request, 'settings.manage');
    if (auth instanceof NextResponse) return auth;
    const buffer = await request.arrayBuffer();
    await replaceDatabase(new Uint8Array(buffer));
    auditLogRepository.log({
      userId: auth.userId,
      action: 'restore',
      entityType: 'account',
      entityId: 0,
      changes: { restored: true },
    });
    return NextResponse.json({ success: true, data: { restored: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/accounts/backup/route.ts src/app/api/accounts/backup/status/route.ts src/app/api/accounts/restore/route.ts
git commit -m "feat: API routes for raw sqlite backup/status/restore"
```

---

### Task 3: Dedicated Backup & Restore page (`/settings/backup-restore`) + sidebar entry

**Files:**
- Create: `src/app/(admin)/settings/backup-restore/page.tsx`
- Modify: `src/layout/AppSidebar.tsx` (Settings subItems ~line 107-117)

**Interfaces:**
- Consumes: `toast` from `useToast()`, `Button` from `@/components/ui/button/Button`, `Modal` from `@/components/ui/modal`, `formatDate` from `@/lib/formatters`, lucide icons. API: `GET /api/accounts/backup/status` (size + last modified), `GET /api/accounts/backup` (download), `POST /api/accounts/restore` (restore).
- Produces: a full-featured page at `/settings/backup-restore` reachable from the Settings sidebar section.

- [ ] **Step 1: Add sidebar entry**

In `src/layout/AppSidebar.tsx`, in the Settings block `subItems` (after line 113 "System Settings"), add:

```tsx
      { name: "Backup & Restore", path: "/settings/backup-restore", permission: "settings.manage" },
```

- [ ] **Step 2: Create the page**

Create `src/app/(admin)/settings/backup-restore/page.tsx`:

```tsx
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Download,
  Upload,
  Database,
  Loader2,
  AlertTriangle,
  HardDrive,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react'
import Button from '@/components/ui/button/Button'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast/ToastProvider'

const LAST_BACKUP_KEY = 'erp:lastBackupAt'

function formatBytes(n: number): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

export default function BackupRestorePage() {
  const toast = useToast()
  const [status, setStatus] = useState<{ sizeBytes: number; lastModifiedAt: string | null }>({ sizeBytes: 0, lastModifiedAt: null })
  const [lastBackup, setLastBackup] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    fetch('/api/accounts/backup/status')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setStatus(json.data)
      })
      .catch(() => {})
    setLastBackup(typeof window !== 'undefined' ? window.localStorage.getItem(LAST_BACKUP_KEY) : null)
  }, [])

  const pickFile = useCallback((f: File | null) => {
    if (!f) return
    setSelectedFile(f)
    setConfirmError('')
  }, [])

  const handleBackup = async () => {
    setBackingUp(true)
    try {
      const res = await fetch('/api/accounts/backup')
      if (!res.ok) throw new Error(`Backup failed (HTTP ${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `erp-backup-${new Date().toISOString().slice(0, 10)}.sqlite`
      a.click()
      URL.revokeObjectURL(url)
      const now = new Date().toISOString()
      window.localStorage.setItem(LAST_BACKUP_KEY, now)
      setLastBackup(now)
      toast.success('Database backup downloaded')
    } catch (err: any) {
      toast.error(err.message || 'Backup failed')
    } finally {
      setBackingUp(false)
    }
  }

  const confirmRestore = () => {
    if (!selectedFile) {
      setConfirmError('Select a backup file first.')
      return
    }
    setConfirmError('')
    setConfirmOpen(true)
  }

  const handleRestore = async () => {
    setRestoring(true)
    setConfirmError('')
    try {
      const res = await fetch('/api/accounts/restore', {
        method: 'POST',
        body: selectedFile,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `Restore failed (HTTP ${res.status})`)
      setConfirmOpen(false)
      toast.success('Database restored — reloading...')
      window.location.reload()
    } catch (err: any) {
      setConfirmError(err.message || 'Restore failed. Check the file format.')
      setRestoring(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Backup &amp; Restore</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Download a full snapshot of the database and restore it later. The backup contains all data — accounts, cost centers, partners, products, invoices and more.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-4 py-3">
        <ShieldCheck className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-800 dark:text-blue-300">
          The backup is the entire database file. Restoring replaces all current data with the uploaded file — there is no merge. Download backups regularly and keep them somewhere safe.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Backup card */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center">
              <Download className="w-5 h-5 text-brand-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Backup Database</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Download the full database as a .sqlite file</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" /> Database size</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">{formatBytes(status.sizeBytes)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><Database className="w-3.5 h-3.5" /> Last saved</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">{formatTime(status.lastModifiedAt)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">Last backup downloaded</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">{formatTime(lastBackup)}</p>
            </div>
          </div>

          <Button onClick={handleBackup} disabled={backingUp} className="w-full">
            {backingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {backingUp ? 'Preparing backup...' : 'Download Backup'}
          </Button>
        </div>

        {/* Restore card */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
              <Upload className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Restore Database</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Replace all data from a .sqlite backup file</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              pickFile(e.dataTransfer.files?.[0] ?? null)
            }}
            className={`w-full rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
              dragging
                ? 'border-brand-400 bg-brand-50 dark:bg-brand-950/30'
                : 'border-gray-300 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-700'
            }`}
          >
            {selectedFile ? (
              <>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedFile.name}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatBytes(selectedFile.size)}</p>
                <p className="mt-3 text-xs text-brand-500">Click or drop a different file</p>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500" />
                <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Click to choose or drop a backup file</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Accepts .sqlite backup files from the Backup button above</p>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sqlite,application/octet-stream"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />

          <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Restoring replaces the entire database. This cannot be undone — make a backup first.
            </p>
          </div>

          <Button onClick={confirmRestore} disabled={!selectedFile} className="w-full bg-amber-500 hover:bg-amber-600">
            <Upload className="w-4 h-4" />
            Restore Database
          </Button>
        </div>
      </div>

      {/* Restore confirm modal */}
      <Modal isOpen={confirmOpen} onClose={() => { if (!restoring) setConfirmOpen(false) }} className="max-w-md p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Restore database?</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            All current data will be replaced with the contents of <span className="font-medium text-gray-900 dark:text-white">{selectedFile?.name}</span>. This action cannot be undone.
          </p>
          {confirmError && <p className="text-sm text-red-600 dark:text-red-400">{confirmError}</p>}
          <div className="flex items-center gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)} disabled={restoring}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-red-500 hover:bg-red-600"
              onClick={handleRestore}
              disabled={restoring}
            >
              {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {restoring ? 'Restoring...' : 'Restore Now'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/settings/backup-restore/page.tsx" "src/layout/AppSidebar.tsx"
git commit -m "feat: dedicated backup & restore settings page"
```

---

## Self-Review Summary

- **Spec coverage:** `getDbBytes` (Task 1) + backup route (Task 2); `replaceDatabase` with empty/random/account-table validation (Task 1) + restore route (Task 2); status route for DB size/last-saved (Task 2); whole-file replacement never merges; dedicated full-featured page + sidebar entry (Task 3). All spec test cases covered in `db-backup.test.ts`.
- **Type consistency:** `getDbBytes()`/`replaceDatabase()` names match across db exports, routes, tests. `replaceDatabase` returns `Promise<void>` in both the test (`await`) and route (`await`). `ValidationError` reused for all rejection paths. `getDbFilePath()` export (used by the status route) must be added to `db.ts` alongside the Task 1 exports.
- **Correctness risk checked:** the DB lives on `globalThis` so a swapped `state.db` is visible to every route; `ensureInitialized` on the next request sees `state.initialized = true` and seeds idempotently against whatever the uploaded file has.