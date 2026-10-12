/**
 * Import ./migration-export into a NEW, freshly migrated Supabase project.
 *
 * Run:  bun scripts/import-data.ts --confirm-target=<new-project-ref>
 * Env:  TARGET_SUPABASE_URL, TARGET_SUPABASE_SERVICE_ROLE_KEY
 * Optional: EXCLUDE_ORPHAN_AUTH_USERS=true  -> skip auth accounts that have no profile
 *           (default: ALL exported auth accounts are recreated, including those without a profile)
 *
 * Prerequisites (checked before anything is written):
 *   - migrations 0000–0026 applied, private "documents" bucket exists,
 *   - scripts/migration/pre-import.sql has been run (creates public.migration_import_state).
 *
 * Safe to re-run: every write is an upsert on the original primary key, existing auth users are
 * reused (never recreated, passwords never regenerated), and only rows the auth trigger created
 * for imported accounts are removed. Any error stops the run with a non-zero exit code.
 */
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { TABLES, SEEDED_DELETE_ORDER, SEEDED_KEY, CURRENT_PROJECT_REF, EXPORT_DIR } from "./migration/tables";

const URL_ = process.env.TARGET_SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY;
const confirm = process.argv.find((a) => a.startsWith("--confirm-target="))?.split("=")[1];
const excludeOrphans = process.env.EXCLUDE_ORPHAN_AUTH_USERS === "true";

function fail(msg: string): never {
  console.error(`\nABORT: ${msg}\nNothing after this step was written. Fix the cause and re-run the same command; completed steps are skipped or safely overwritten.`);
  process.exit(1);
}

// ---------- Destination safeguards ----------
if (!URL_ || !KEY) fail("TARGET_SUPABASE_URL and TARGET_SUPABASE_SERVICE_ROLE_KEY are required.");
let host: string;
try { host = new URL(URL_).hostname; } catch { fail("TARGET_SUPABASE_URL is not a valid URL."); }
const ref = host.split(".")[0];
const sources = [process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL]
  .filter(Boolean).map((u) => { try { return new URL(u!).hostname; } catch { return ""; } });
if (ref === CURRENT_PROJECT_REF || host.includes(CURRENT_PROJECT_REF) || host.endsWith("lovable.cloud") || sources.includes(host))
  fail("Target is the current Lovable-managed database. Import refused.");
if (KEY === process.env.SUPABASE_SERVICE_ROLE_KEY) fail("Target key equals the current backend key. Import refused.");
if (!host.endsWith(".supabase.co")) fail("Target must be a https://<ref>.supabase.co project URL.");
if (!confirm || confirm !== ref) fail(`Pass --confirm-target=${ref} to confirm the destination project.`);
if (!existsSync(join(EXPORT_DIR, "manifest.json"))) fail(`No export found in ./${EXPORT_DIR}. Run the export first.`);

const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) as any;
const read = async (f: string) => JSON.parse(await readFile(join(EXPORT_DIR, f), "utf-8"));
const chunk = <T,>(a: T[], n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function count(t: string) {
  const { count: c, error } = await db.from(t).select("*", { count: "exact", head: true });
  if (error) fail(`${t}: ${error.message} (were migrations 0000–0026 applied?)`);
  return c as number;
}
async function selectAll(t: string, cols: string) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(t).select(cols).range(from, from + 999);
    if (error) fail(`${t}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
async function upsert(t: string, rows: any[], conflict: string) {
  for (const part of chunk(rows)) {
    const { error } = await db.from(t).upsert(part, { onConflict: conflict });
    if (error) fail(`${t}: ${error.message}`);
  }
}
const keyOf = (row: any, conflict: string) => conflict.split(",").map((c) => row[c]).join("|");

// Temporary credentials: owner-only on POSIX; on Windows chmod is not supported,
// so the file inherits the folder ACL — keep the export folder in a private user directory.
async function saveCreds(file: string, creds: any[]) {
  await writeFile(file, JSON.stringify(creds, null, 2), { mode: 0o600 });
  if (process.platform !== "win32") {
    try { await chmod(file, 0o600); } catch { console.warn("! Could not restrict credentials file permissions; protect it manually."); }
  } else {
    console.warn("! Windows: file permissions inherit from the folder. Keep the export folder private.");
  }
}

async function preflight(data: Record<string, any[]>, authIds: Set<string>) {
  // Migrations present (every table + latest columns).
  for (const t of TABLES) await count(t.name);
  { const { error } = await db.from("profiles").select("username,deleted_at").limit(1);
    if (error) fail(`profiles is missing newer columns (${error.message}). Apply all migrations 0000–0026.`); }
  // pre-import.sql ran.
  { const { data: s, error } = await db.from("migration_import_state").select("triggers_paused").maybeSingle();
    if (error || !s?.triggers_paused) fail("Run scripts/migration/pre-import.sql in the NEW project's SQL Editor first."); }
  // Private documents bucket.
  { const { data: b, error } = await db.storage.listBuckets();
    if (error) fail(`storage: ${error.message}`);
    if (!b?.some((x: any) => x.id === "documents" && !x.public)) fail('Create a PRIVATE storage bucket named "documents" first.'); }
  // No unrelated data: every existing row must be an exported row (resume) or a trigger row for an imported account.
  for (const t of TABLES) {
    if (t.replaceSeeded || t.name === "organization_settings") continue;
    const exported = new Set(data[t.name].map((r) => keyOf(r, t.conflict)));
    const rows = await selectAll(t.name, t.conflict + (t.name === "user_roles" ? ",user_id" : ""));
    const foreign = rows.filter((r) => !exported.has(keyOf(r, t.conflict))
      && !(t.name === "profiles" && authIds.has(r.id))
      && !(t.name === "user_roles" && authIds.has(r.user_id)));
    if (foreign.length) fail(`Target table ${t.name} has ${foreign.length} row(s) not in the export. Use a fresh project.`);
  }
}

async function main() {
  const manifest = await read("manifest.json");
  if (manifest.errors?.length) fail("The export contains errors; re-run the export.");

  const data: Record<string, any[]> = {};
  for (const t of TABLES) data[t.name] = await read(`tables/${t.name}.json`);
  const users: any[] = await read("auth_users.json");
  const profileIds = new Set(data.profiles.map((p) => p.id));
  const toCreate = users.filter((u) => !excludeOrphans || profileIds.has(u.id));
  const importIds = new Set(toCreate.map((u) => u.id));
  console.log(`Auth accounts to import: ${toCreate.length} of ${users.length}${excludeOrphans ? " (orphans excluded)" : ""}`);

  await preflight(data, importIds);

  // 1. Seeded reference rows: delete only migration-seeded rows that are NOT in the export.
  for (const t of SEEDED_DELETE_ORDER) {
    const k = SEEDED_KEY[t];
    const src = t === "role_permissions" ? data.roles.map((r) => r.id) : data[t].map((r) => r[k]);
    const keep = [...new Set(src)];
    let q = db.from(t).delete().not(k, "is", null);
    if (keep.length) q = q.not(k, "in", `(${keep.map((v) => `"${v}"`).join(",")})`);
    const { error } = await q;
    if (error) fail(`clearing seeded ${t}: ${error.message}`);
  }
  const refTables = TABLES.slice(0, TABLES.findIndex((t) => t.name === "profiles"));
  for (const t of refTables) { await upsert(t.name, data[t.name], t.conflict); console.log(`✔ ${t.name}: ${data[t.name].length}`); }

  // 2. Auth users (original UUIDs). Existing ones are reused; passwords never printed.
  const existing = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data: d, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`listing target auth users: ${error.message}`);
    d.users.forEach((u: any) => existing.set(u.id, (u.email || "").toLowerCase()));
    if (d.users.length < 1000) break;
  }
  const exportedIds = new Set(users.map((u) => u.id));
  const strangers = [...existing.keys()].filter((id) => !exportedIds.has(id));
  if (strangers.length) fail(`Target has ${strangers.length} auth account(s) not in the export. Use a fresh project.`);

  const credFile = join(EXPORT_DIR, "temp-credentials.json");
  const creds: any[] = existsSync(credFile) ? JSON.parse(await readFile(credFile, "utf-8")) : [];
  let created = 0;
  for (const u of toCreate) {
    if (existing.has(u.id)) continue;
    const pw = randomBytes(18).toString("base64url");
    const { error } = await db.auth.admin.createUser({
      id: u.id, email: u.email, phone: u.phone || undefined, password: pw,
      email_confirm: true, user_metadata: u.user_metadata ?? {}, app_metadata: u.app_metadata ?? undefined,
    });
    if (error) { await saveCreds(credFile, creds); fail(`auth user ${u.id}: ${error.message}`); }
    creds.push({ id: u.id, email: u.email, temp_password: pw });
    created++;
    await saveCreds(credFile, creds); // persisted after each account so a crash never loses a password
  }
  console.log(`✔ auth users: ${created} created, ${toCreate.length - created} already present (temporary passwords in ${credFile}, not printed)`);

  // 3. Reconcile rows the auth trigger may have created (only for imported accounts; never exported rows).
  const exportedRoleIds = new Set(data.user_roles.map((r) => r.id));
  const roleRows = await selectAll("user_roles", "id,user_id");
  const extraRoles = roleRows.filter((r) => importIds.has(r.user_id) && !exportedRoleIds.has(r.id)).map((r) => r.id);
  for (const part of chunk(extraRoles, 200)) {
    const r = await db.from("user_roles").delete().in("id", part);
    if (r.error) fail(`reconcile user_roles: ${r.error.message}`);
  }
  const profRows = await selectAll("profiles", "id");
  const extraProfiles = profRows.filter((p) => importIds.has(p.id) && !profileIds.has(p.id)).map((p) => p.id);
  for (const part of chunk(extraProfiles, 200)) {
    const r = await db.from("profiles").delete().in("id", part);
    if (r.error) fail(`reconcile profiles: ${r.error.message}`);
  }
  if (extraRoles.length || extraProfiles.length)
    console.log(`✔ reconciled trigger rows: ${extraRoles.length} role(s), ${extraProfiles.length} profile(s)`);

  // 4. Identity + remaining tables; self-references in a second pass. Exported profiles overwrite trigger profiles by id.
  for (const t of TABLES.slice(refTables.length)) {
    let rows = data[t.name];
    if (t.name === "user_roles") rows = rows.filter((r) => importIds.has(r.user_id));
    if (t.selfRef) rows = rows.map((r) => ({ ...r, [t.selfRef!]: null }));
    await upsert(t.name, rows, t.conflict);
    if (t.selfRef) {
      for (const r of data[t.name].filter((r) => r[t.selfRef!])) {
        const { error } = await db.from(t.name).update({ [t.selfRef!]: r[t.selfRef!] }).eq("id", r.id);
        if (error) fail(`${t.name}.${t.selfRef}: ${error.message}`);
      }
    }
    console.log(`✔ ${t.name}: ${rows.length}`);
    if (t.name === "daily_work_logs") await uploadFiles(data.documents);
  }

  // 5. Verify counts.
  const mismatches: string[] = [];
  for (const t of TABLES) {
    const expected = t.name === "user_roles" ? data.user_roles.filter((r) => importIds.has(r.user_id)).length : data[t.name].length;
    const got = await count(t.name);
    if (got !== expected) mismatches.push(`${t.name}: expected ${expected}, found ${got}`);
  }
  if (mismatches.length) fail("Count mismatches:\n" + mismatches.join("\n"));
  console.log("\nImport complete. Now run scripts/migration/post-import.sql on the NEW project.");
}

async function uploadFiles(docs: any[]) {
  let n = 0;
  for (const d of docs) {
    const path = join(EXPORT_DIR, "storage", "documents", d.file_path);
    if (!existsSync(path)) fail(`missing exported file ${d.file_path}`);
    const { error } = await db.storage.from("documents").upload(d.file_path, await readFile(path), {
      contentType: d.mime_type || "application/octet-stream", upsert: true,
    });
    if (error) fail(`upload ${d.file_path}: ${error.message}`);
    n++;
  }
  console.log(`✔ document files uploaded: ${n}`);
}

main().catch((e) => fail(e?.message ?? String(e)));
