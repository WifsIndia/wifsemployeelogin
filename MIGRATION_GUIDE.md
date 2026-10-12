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
1. SQL Editor (NEW project): run `scripts/migration/pre-import.sql`. If the `auth.users` line is refused for permission reasons, skip it. The import cleans up rows that trigger creates.
2. Run on a secure machine that has the export folder and the project code (`bun install` first):
```bash
TARGET_SUPABASE_URL="https://<new-ref>.supabase.co" \
TARGET_SUPABASE_SERVICE_ROLE_KEY="<new service role key>" \
bun scripts/import-data.ts --confirm-target=<new-ref>
```
Optional: `INCLUDE_ORPHAN_AUTH_USERS=true` also recreates the 8 old login accounts that have no profile (removed employees). By default they are skipped, along with their role rows.

What the import does, in order:
- Checks that the target is empty and not the current database.
- Replaces migration-seeded rows (roles, permissions, departments, locations, leave policies/types, holidays). This keeps the original IDs, so there are no duplicates and no broken links.
- Recreates auth users with **their original UUIDs**, confirmed emails and random temporary passwords. The passwords go to `migration-export/temp-credentials.json` (file mode 600) and are never printed.
- Imports profiles in two passes (`manager_id` goes in after every profile exists), then roles, companies, locations, compensation, projects, attendance, leave, payroll, tasks, history, comments and work logs. Next it uploads document files to the same paths, then imports folders (two passes for `parent_id`), documents, announcements, notifications, links and audit logs.
- Checks every table's row count against the export.

No sequences are involved. All keys are UUIDs, and database defaults stay unchanged.

3. SQL Editor (NEW project): run `scripts/migration/post-import.sql`. It turns the triggers back on, schedules the two cron jobs (`attendance_auto_close` 18:01 UTC, `overdue_task_reminders` 04:30 UTC = 10:00 IST) and runs sanity checks.

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
- The import must target a fresh project. It refuses to run if operational data or profiles already exist.
