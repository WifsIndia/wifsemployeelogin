/**
 * Import ./migration-export into a NEW, freshly migrated Supabase project.
 * Run: bun scripts/import-data.ts --confirm-target=<new-project-ref>
 * Env: TARGET_SUPABASE_URL, TARGET_SUPABASE_SERVICE_ROLE_KEY
 * Optional: INCLUDE_ORPHAN_AUTH_USERS=true (also recreate auth users that have no profile)
 * Prerequisite: run scripts/migration/pre-import.sql on the NEW project first.
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
const includeOrphans = process.env.INCLUDE_ORPHAN_AUTH_USERS === "true";

function fail(msg: string): never { console.error(`ABORT: ${msg}`); process.exit(1); }

// ---------- Safeguards ----------
if (!URL_ || !KEY) fail("TARGET_SUPABASE_URL and TARGET_SUPABASE_SERVICE_ROLE_KEY are required.");
const host = new URL(URL_).hostname;
const ref = host.split(".")[0];
const sources = [process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL].filter(Boolean).map((u) => new URL(u!).hostname);
if (ref === CURRENT_PROJECT_REF || host.includes(CURRENT_PROJECT_REF) || host.endsWith("lovable.cloud") || sources.includes(host))
  fail("Target is the current Lovable-managed database. Import refused.");
if (!host.endsWith(".supabase.co")) fail("Target must be a *.supabase.co project URL.");
if (confirm !== ref) fail(`Pass --confirm-target=${ref} to confirm the destination project.`);
if (!existsSync(join(EXPORT_DIR, "manifest.json"))) fail(`No export found in ./${EXPORT_DIR}. Run the export first.`);

const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) as any;
const read = async (f: string) => JSON.parse(await readFile(join(EXPORT_DIR, f), "utf-8"));
const chunk = <T,>(a: T[], n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function count(t: string) {
  const { count: c, error } = await db.from(t).select("*", { count: "exact", head: true });
  if (error) fail(`${t}: ${error.message} (were migrations 0000–0026 applied?)`);
  return c as number;
}

async function upsert(t: string, rows: any[], conflict: string) {
  for (const part of chunk(rows)) {
    const { error } = await db.from(t).upsert(part, { onConflict: conflict });
    if (error) fail(`${t}: ${error.message}`);
  }
}

async function main() {
  const manifest = await read("manifest.json");
  if (manifest.errors?.length) fail("The export contains errors; re-run the export.");

  // Fresh-project check: nothing but trigger-created rows may exist.
  if ((await count("attendance")) + (await count("tasks")) + (await count("payroll_records")) > 0)
    fail("Target already contains operational data. Import only into a fresh project.");
  const existingProfiles = await count("profiles");
  if (existingProfiles > 0) fail("Target already has profiles. Use a fresh project (no signups before import).");

  const data: Record<string, any[]> = {};
  for (const t of TABLES) data[t.name] = await read(`tables/${t.name}.json`);
  const users: any[] = await read("auth_users.json");
  const profileIds = new Set(data.profiles.map((p) => p.id));
  const toCreate = users.filter((u) => includeOrphans || profileIds.has(u.id));
  const createdIds = new Set(toCreate.map((u) => u.id));

  // 1. Replace migration-seeded reference rows so original IDs are kept.
  for (const t of SEEDED_DELETE_ORDER) {
    const { error } = await db.from(t).delete().not(SEEDED_KEY[t], "is", null);
    if (error) fail(`clearing seeded ${t}: ${error.message}`);
  }
  const refTables = TABLES.slice(0, TABLES.findIndex((t) => t.name === "profiles"));
  for (const t of refTables) { await upsert(t.name, data[t.name], t.conflict); console.log(`✔ ${t.name}: ${data[t.name].length}`); }

  // 2. Auth users with original UUIDs and random temporary passwords (written to a local file only).
  const creds: { id: string; email: string; temp_password: string }[] = [];
  for (const u of toCreate) {
    const pw = randomBytes(18).toString("base64url");
    const { error } = await db.auth.admin.createUser({
      id: u.id, email: u.email, phone: u.phone || undefined, password: pw,
      email_confirm: true, user_metadata: u.user_metadata ?? {},
    });
    if (error) fail(`auth user ${u.id}: ${error.message}`);
    creds.push({ id: u.id, email: u.email, temp_password: pw });
  }
  const credFile = join(EXPORT_DIR, "temp-credentials.json");
  await writeFile(credFile, JSON.stringify(creds, null, 2));
  await chmod(credFile, 0o600);
  console.log(`✔ auth users: ${creds.length} (temporary passwords saved to ${credFile}, not printed)`);

  // Remove rows auto-created by on_auth_user_created (if it was left enabled).
  for (const part of chunk([...createdIds], 200)) {
    const r = await db.from("user_roles").delete().in("user_id", part);
    if (r.error) fail(`cleanup user_roles: ${r.error.message}`);
  }
  const orphanIds = [...createdIds].filter((id) => !profileIds.has(id));
  for (const part of chunk(orphanIds, 200)) {
    const r = await db.from("profiles").delete().in("id", part);
    if (r.error) fail(`cleanup profiles: ${r.error.message}`);
  }

  // 3. Identity + remaining tables; self-references in a second pass.
  const rest = TABLES.slice(refTables.length);
  for (const t of rest) {
    let rows = data[t.name];
    if (t.name === "user_roles") rows = rows.filter((r) => createdIds.has(r.user_id));
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

  // 4. Verify counts.
  const mismatches: string[] = [];
  for (const t of TABLES) {
    const expected = t.name === "user_roles" ? data.user_roles.filter((r) => createdIds.has(r.user_id)).length : data[t.name].length;
    const got = await count(t.name);
    if (got !== expected) mismatches.push(`${t.name}: expected ${expected}, found ${got}`);
  }
  if (mismatches.length) {
    console.error("Count mismatches (usually triggers left enabled — see guide):\n" + mismatches.join("\n"));
    process.exit(1);
  }
  console.log("\nImport complete. Now run scripts/migration/post-import.sql on the NEW project.");
}

async function uploadFiles(docs: any[]) {
  const { data: buckets } = await db.storage.listBuckets();
  if (!buckets?.some((b: any) => b.id === "documents" && !b.public)) fail('Create a PRIVATE bucket named "documents" first.');
  let n = 0;
  for (const d of docs) {
    const buf = await readFile(join(EXPORT_DIR, "storage", "documents", d.file_path));
    const { error } = await db.storage.from("documents").upload(d.file_path, buf, {
      contentType: d.mime_type || "application/octet-stream", upsert: true,
    });
    if (error) fail(`upload ${d.file_path}: ${error.message}`);
    n++;
  }
  console.log(`✔ document files uploaded: ${n}`);
}

main().catch((e) => fail(e.message));
