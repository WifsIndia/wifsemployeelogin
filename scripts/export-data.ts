/**
 * READ-ONLY export of the current WiFS portal data.
 * Run: bun scripts/export-data.ts
 * Needs (already present in the Lovable sandbox): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Writes only to ./migration-export (git-ignored). Never writes to the database.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { supabaseAdmin } from "../src/integrations/supabase/client.server";
import { TABLES, EXPORT_DIR, PAGE } from "./migration/tables";

const db = supabaseAdmin as any;
const errors: string[] = [];

async function exportTable(name: string, order: string[]) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from(name).select("*");
    for (const c of order) q = q.order(c, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`${name}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  const { count, error } = await db.from(name).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${name} count: ${error.message}`);
  if (count !== rows.length) throw new Error(`${name}: exported ${rows.length} but table has ${count}`);
  return rows;
}

async function exportUsers() {
  const users: any[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth users: ${error.message}`);
    // Whitelist only non-secret fields. Passwords/hashes are never available here.
    for (const u of data.users) {
      users.push({
        id: u.id, email: u.email ?? null, phone: u.phone || null,
        email_confirmed_at: u.email_confirmed_at ?? null, created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        user_metadata: u.user_metadata ?? {}, app_metadata_provider: u.app_metadata?.provider ?? null,
        banned_until: (u as any).banned_until ?? null,
      });
    }
    if (data.users.length < 1000) break;
  }
  return users;
}

async function main() {
  const started = new Date().toISOString();
  await mkdir(join(EXPORT_DIR, "tables"), { recursive: true });
  const counts: Record<string, number> = {};
  const data: Record<string, any[]> = {};

  for (const t of TABLES) {
    try {
      data[t.name] = await exportTable(t.name, t.order);
      counts[t.name] = data[t.name].length;
      await writeFile(join(EXPORT_DIR, "tables", `${t.name}.json`), JSON.stringify(data[t.name], null, 2));
      console.log(`✔ ${t.name}: ${counts[t.name]}`);
    } catch (e: any) { errors.push(e.message); console.error(`✘ ${e.message}`); }
  }

  let users: any[] = [];
  try {
    users = await exportUsers();
    await writeFile(join(EXPORT_DIR, "auth_users.json"), JSON.stringify(users, null, 2));
    console.log(`✔ auth users: ${users.length}`);
  } catch (e: any) { errors.push(e.message); console.error(`✘ ${e.message}`); }

  const files: { path: string; bytes: number }[] = [];
  for (const d of data.documents ?? []) {
    try {
      const { data: blob, error } = await supabaseAdmin.storage.from("documents").download(d.file_path);
      if (error || !blob) throw new Error(error?.message || "empty");
      const buf = Buffer.from(await blob.arrayBuffer());
      const out = join(EXPORT_DIR, "storage", "documents", d.file_path);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, buf);
      files.push({ path: d.file_path, bytes: buf.length });
      if (d.size_bytes && Number(d.size_bytes) !== buf.length) errors.push(`size mismatch ${d.file_path}`);
    } catch (e: any) { errors.push(`file ${d.file_path}: ${e.message}`); }
  }
  console.log(`✔ document files: ${files.length}/${(data.documents ?? []).length}`);

  const profileIds = new Set((data.profiles ?? []).map((p) => p.id));
  const manifest = {
    exported_at: started, finished_at: new Date().toISOString(),
    table_counts: counts, auth_users: users.length,
    auth_users_without_profile: users.filter((u) => !profileIds.has(u.id)).length,
    files, errors,
  };
  await writeFile(join(EXPORT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nSummary: ${Object.keys(counts).length}/${TABLES.length} tables, ${users.length} users, ${files.length} files, ${errors.length} errors`);
  if (errors.length) { console.error("Export finished WITH ERRORS — see manifest.json"); process.exit(1); }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
