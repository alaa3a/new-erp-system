# Chart of Accounts Backup & Restore — Design

> **Status:** APPROVED — feature branch `feat/coa-backup-restore`. **Simplified 2026-08-10:** raw SQLite file download/upload instead of a JSON merge. Supersedes the earlier JSON-merge draft.

## Problem

When the DB file is deleted/recreated, the seed only re-inserts the 16 default accounts. User account data disappears.

## Solution (raw DB file)

Backup means "download the actual SQLite database file". Restore means "replace the running in-memory DB with an uploaded `.sqlite` file". No merging, no remapping, no per-entity logic.

### Backup — `GET /api/accounts/backup`

Returns `db.export()` (the raw sql.js binary) as an `application/octet-stream` attachment: `erp-backup-YYYY-MM-DD.sqlite`.

### Status — `GET /api/accounts/backup/status`

Returns metadata about the current on-disk DB file so the page can show "database size / last saved":
`{ success: true, data: { sizeBytes: number, lastModifiedAt: string | null } }` (via `statSync(DB_PATH)`; `lastModifiedAt` null if the file doesn't exist yet). Auth: `requireAuth`.

### Restore — `POST /api/accounts/restore`

Takes the uploaded `.sqlite` bytes in the request body, loads them into a new `SQL.Database`, validates it is a real ERP DB (has the `account` table), then replaces the global in-memory DB (`state.db`) and persists to disk immediately.

- Rejects: empty upload, invalid SQLite, DB missing the `account` table (ValidationError 400).
- Never merges — the uploaded file becomes the entire database.
- Since `state.db` lives on `globalThis` (shared across route bundles), swapping it replaces the DB app-wide.

## Files

- Modify: `src/lib/db.ts` — add `getDbBytes()` and `replaceDatabase(bytes)` exports (validate + swap + persist).
- Create: `src/app/api/accounts/backup/route.ts` (GET, `requireAuth`)
- Create: `src/app/api/accounts/backup/status/route.ts` (GET, `requireAuth`, DB file stats)
- Create: `src/app/api/accounts/restore/route.ts` (POST, `requirePermission('settings.manage')`, audited)
- Create: `src/app/(admin)/settings/backup-restore/page.tsx` — dedicated full-featured Backup & Restore page.
- Modify: `src/layout/AppSidebar.tsx` — add "Backup & Restore" under the Settings section.
- Test: `src/lib/__tests__/db-backup.test.ts`

## Page design (dedicated `/settings/backup-restore`)

A full-featured standalone page in the Settings area (not buttons on the COA page):
- **Header**: "Backup & Restore" + description.
- **Info banner**: explains the backup is a full database snapshot (accounts, cost centers, partners, products, invoices, profiles) — not just the chart of accounts.
- **Backup card**: DB file size + last saved time (from the status endpoint), "Download Backup" button, last-download timestamp stored in `localStorage`.
- **Restore card**: drag-and-drop / file-picker zone showing the selected file name + size, a warning that the entire database is replaced, a "Restore" button that opens a confirmation modal (prominent warning + Cancel/Confirm), then POSTs and does a full page reload on success (the whole DB changed).
- Sidebar: new "Backup & Restore" item under Settings (`settings.manage`).

## Testing

- `getDbBytes()` returns bytes that load into a fresh `SQL.Database` (round-trip).
- `replaceDatabase()` accepts a valid exported DB, rejects random bytes and an empty upload, rejects a valid SQLite DB lacking the `account` table.
- After a successful `replaceDatabase()`, the shared `db` reflects the new file (query a marker row).
- Typecheck (`npx tsc --noEmit`) after each task; restore `next-env.d.ts` churn with `git checkout -- next-env.d.ts`.