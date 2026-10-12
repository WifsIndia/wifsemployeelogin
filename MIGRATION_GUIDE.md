# WiFS Portal — Data Migration Guide (current backend → new Supabase project)

Nothing in this guide changes the running app or its current database. The export only reads data. The import refuses to run against the current database.

## Files
| File | Purpose |
|---|---|
| `scripts/export-data.ts` | Read-only export of 29 tables, auth user info (no passwords) and document files |
| `scripts/import-data.ts` | Imports into a **new** project only, keeping original UUIDs |
| `scripts/migration/tables.ts` | Table list, import order, seeded-table rules, safeguards |
| `scripts/migration/pre-import.sql` | Run on the NEW project before import (pauses triggers) |
| `scripts/migration/post-import.sql` | Run on the NEW project after import (re-enables triggers, cron jobs) |
| `migration-export/` | Output folder (git-ignored). Has employee data, files and temp passwords: **never commit or share it** |

## 1. Export (run from this project)
```bash
bun scripts/export-data.ts
```
Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (already in the Lovable sandbox; not available elsewhere).
Output: `migration-export/tables/*.json`, `auth_users.json`, `storage/documents/<original paths>`, `manifest.json`.
The script pages through every table 1,000 rows at a time and checks each count. It stops with an error if anything is missing.
Download the folder to a secure machine. Do not upload it to GitHub.

## 2. Create and configure the new Supabase project
1. Create the project (pick a region near India, e.g. Mumbai).
2. Database → Extensions: enable **pg_cron**.
3. Storage → New bucket: name `documents`, **Public OFF**, file size limit 20 MB.
4. Authentication → URL Configuration: Site URL = your production URL. Redirect URLs: `https://<your-domain>/**`, `http://localhost:8080/**`.
5. Authentication → Sign In / Providers: Email enabled. Do not let anyone sign up before the import.

## 3. Apply migrations 0000–0026
Either run each file in `drizzle/migrations/` in order in the SQL Editor, or:
```bash
DATABASE_URL="<new project direct connection string>" bunx drizzle-kit migrate
```
(`drizzle.config.ts` reads `LOVABLE_DB_MIGRATION_URL`. Set that to the new connection string, or adjust the config locally.)

## 4. Import
1. SQL Editor (NEW): run `scripts/migration/pre-import.sql` (pauses app triggers, creates the import marker; no auth statements).
2. SQL Editor (NEW), separately: run `scripts/migration/pre-import-auth-trigger.sql`. If it is refused for permissions, ignore it — the import reconciles rows that trigger creates.
3. On a secure machine with the export folder (`bun install` first):

POSIX (macOS/Linux):
```bash
TARGET_SUPABASE_URL="https://<new-ref>.supabase.co" \
TARGET_SUPABASE_SERVICE_ROLE_KEY="<new service role key>" \
bun scripts/import-data.ts --confirm-target=<new-ref>
```
Windows PowerShell:
```powershell
$env:TARGET_SUPABASE_URL="https://<new-ref>.supabase.co"; $env:TARGET_SUPABASE_SERVICE_ROLE_KEY="<new service role key>"
bun scripts/import-data.ts --confirm-target=<new-ref>
```
By default all 16 auth accounts are recreated, including the 8 without a profile. To skip those only: add `EXCLUDE_ORPHAN_AUTH_USERS=true`.

Before writing, the import checks: target is not the current backend, `--confirm-target` matches the URL, all tables/latest columns exist, `pre-import.sql` ran, the private `documents` bucket exists, and the target holds no rows or accounts that are not in the export.

Resume: if it stops, fix the cause and re-run the same command. Rows are upserted by original ID, existing accounts are reused (passwords not regenerated), `temp-credentials.json` is saved after every account, and only trigger-created profile/role rows for imported accounts are removed. It exits non-zero on any error or count mismatch and never reports success after a partial run.

Temporary passwords are never printed. On POSIX the file is mode 600; on Windows it inherits folder permissions, so keep the folder in your private user directory.

4. SQL Editor (NEW): run `scripts/migration/post-import.sql` (re-enables app triggers, drops the marker, schedules cron jobs, sanity checks).
5. SQL Editor (NEW), separately, only if step 2 succeeded: run `scripts/migration/post-import-auth-trigger.sql`.

## 5. Passwords
- Super Admin (`admin@wifsindia.com`): in the new dashboard go to Authentication → Users → the user → set a new password. Or use their temporary password from the credentials file, then change it.
- Everyone else: Authentication → Users → "Send password recovery". Or hand over their temporary password privately and have the Super Admin change it in Employee Edit.
- Delete `temp-credentials.json` once everyone has new passwords.

## 6. Vercel environment variables (later)
Public: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`
Server-only: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
Migration/CLI only (not Vercel): `LOVABLE_DB_MIGRATION_URL`/`DATABASE_URL`, `TARGET_SUPABASE_URL`, `TARGET_SUPABASE_SERVICE_ROLE_KEY`

## Limitations
- Password hashes cannot be exported, so every user needs a new password.
- The bucket, pg_cron extension, cron schedules and auth URLs need the manual steps above.
- The export only runs where the current service key exists, which is the Lovable sandbox.
- The import refuses targets holding data not in the export.
