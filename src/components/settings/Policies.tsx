import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Panel } from "@/components/TeamOverview";
import { Empty, Loading, StatusPill } from "@/components/AppShell";
import { EmployeeEditDialog, ROLE_ORDER, type EmpRow } from "@/components/EmployeeEditDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AppRole } from "@/lib/auth";
import { ConfirmDelete, Field, NativeSelect, tableCls, tdCls, thCls } from "./shared";

/* ---------------- Staff ---------------- */
export function StaffSection() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<EmpRow | null>(null);
  const [flt, setFlt] = useState({ q: "", location: "", dept: "", role: "", status: "", type: "" });
  const q = useQuery({
    queryKey: ["staff-settings"],
    queryFn: async () => {
      const [p, r, d, l] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("departments").select("id, name"),
        supabase.from("office_locations").select("id, name"),
      ]);
      const roleOf = new Map<string, AppRole>();
      for (const x of r.data ?? []) {
        const cur = roleOf.get(x.user_id);
        if (!cur || ROLE_ORDER.indexOf(x.role as AppRole) < ROLE_ORDER.indexOf(cur)) roleOf.set(x.user_id, x.role as AppRole);
      }
      return {
        people: (p.data ?? []).map((x) => ({ ...x, role: roleOf.get(x.id) ?? "employee" }) as EmpRow),
        depts: d.data ?? [], locs: l.data ?? [],
      };
    },
  });
  const rows = (q.data?.people ?? []).filter((p) =>
    `${p.full_name} ${p.email} ${p.employee_code ?? ""}`.toLowerCase().includes(flt.q.toLowerCase()) &&
    (!flt.location || p.location_id === flt.location) && (!flt.dept || p.department_id === flt.dept) &&
    (!flt.role || p.role === flt.role) && (!flt.status || p.status === flt.status) &&
    (!flt.type || p.employment_type === flt.type));
  const name = (list: { id: string; name: string }[] | undefined, id?: string | null) => list?.find((x) => x.id === id)?.name ?? "—";
  return (
    <Panel title={`Staff (${rows.length})`}>
      <div className="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Input placeholder="Search" value={flt.q} onChange={(e) => setFlt({ ...flt, q: e.target.value })} />
        <NativeSelect value={flt.location} onChange={(e) => setFlt({ ...flt, location: e.target.value })}><option value="">All locations</option>{q.data?.locs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect>
        <NativeSelect value={flt.dept} onChange={(e) => setFlt({ ...flt, dept: e.target.value })}><option value="">All departments</option>{q.data?.depts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect>
        <NativeSelect value={flt.role} onChange={(e) => setFlt({ ...flt, role: e.target.value })}><option value="">All roles</option>{ROLE_ORDER.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}</NativeSelect>
        <NativeSelect value={flt.status} onChange={(e) => setFlt({ ...flt, status: e.target.value })}><option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option></NativeSelect>
        <NativeSelect value={flt.type} onChange={(e) => setFlt({ ...flt, type: e.target.value })}><option value="">Any type</option>{["full_time", "part_time", "contract", "intern"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</NativeSelect>
      </div>
      {q.isLoading ? <Loading /> : !rows.length ? <Empty>No staff match these filters.</Empty> : (
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Name</th><th className={thCls}>ID</th><th className={thCls}>Department</th><th className={thCls}>Location</th><th className={thCls}>Role</th><th className={thCls}>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className={tdCls}><p className="font-medium">{p.full_name}</p><p className="text-xs text-muted-foreground">{p.email}</p></td>
                  <td className={tdCls}>{p.employee_code ?? "—"}</td>
                  <td className={tdCls}>{name(q.data?.depts, p.department_id)}</td>
                  <td className={tdCls}>{name(q.data?.locs, p.location_id)}</td>
                  <td className={tdCls + " capitalize"}>{p.role.replace("_", " ")}</td>
                  <td className={tdCls}><StatusPill status={p.status} /></td>
                  <td className={tdCls + " text-right"}><Button size="sm" variant="ghost" onClick={() => setEdit(p)}><Pencil className="size-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <EmployeeEditDialog row={edit} people={q.data?.people ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); qc.invalidateQueries({ queryKey: ["staff-settings"] }); }} />}
    </Panel>
  );
}

/* ---------------- Roles & Permissions ---------------- */
export const MODULES: [string, string][] = [
  ["dashboard", "Dashboard"], ["staff", "Staff"], ["employees", "Employees"], ["attendance", "Attendance"],
  ["locations", "Locations"], ["tasks", "Tasks"], ["work_logs", "Work Logs"], ["leave", "Leave"],
  ["payroll", "Payroll"], ["reports", "Reports"], ["documents", "Documents"], ["announcements", "Announcements"],
  ["notifications", "Notifications"], ["companies", "Companies"], ["business_activity", "Business Activity"],
  ["audit_logs", "Audit Logs"], ["settings", "Settings"], ["roles", "Roles & Permissions"], ["useful_links", "Useful Links"],
];
const ACTIONS = ["can_view", "can_create", "can_edit", "can_delete", "can_approve"] as const;
type Perm = Database["public"]["Tables"]["role_permissions"]["Row"];
type Role = Database["public"]["Tables"]["roles"]["Row"];

export function RolesSection() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["roles-admin"],
    queryFn: async () => {
      const [r, p] = await Promise.all([
        supabase.from("roles").select("*").order("created_at"),
        supabase.from("role_permissions").select("*"),
      ]);
      return { roles: r.data ?? [], perms: p.data ?? [] };
    },
  });
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Role> | null>(null);
  const [matrix, setMatrix] = useState<Record<string, Perm>>({});
  const role = q.data?.roles.find((r) => r.id === sel) ?? q.data?.roles[0];
  useEffect(() => {
    if (!role || !q.data) return;
    const m: Record<string, Perm> = {};
    for (const [mod] of MODULES) {
      m[mod] = q.data.perms.find((p) => p.role_id === role.id && p.module === mod) ??
        { role_id: role.id, module: mod, can_view: false, can_create: false, can_edit: false, can_delete: false, can_approve: false };
    }
    setMatrix(m);
  }, [role?.id, q.data]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["roles-admin"] });
  const locked = role?.base_role === "super_admin";

  const saveMatrix = async () => {
    const { error } = await supabase.from("role_permissions").upsert(Object.values(matrix));
    if (error) return toast.error("Could not save permissions.");
    toast.success("Permissions saved");
    refresh();
  };
  const saveRole = async () => {
    if (!edit?.name?.trim()) return toast.error("Name is required.");
    const row = { name: edit.name.trim(), description: edit.description || null, active: edit.active ?? true };
    const { error } = edit.id ? await supabase.from("roles").update(row).eq("id", edit.id) : await supabase.from("roles").insert(row);
    if (error) return toast.error("Could not save role.");
    setEdit(null);
    refresh();
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("roles").delete().eq("id", id);
    if (error) return toast.error("Could not delete role (it may be in use).");
    setSel(null);
    refresh();
  };

  if (q.isLoading) return <Loading />;
  return (
    <div className="space-y-4">
      <Panel title="Roles" action={<Button size="sm" onClick={() => setEdit({ active: true })}><Plus className="size-4" /> Add role</Button>}>
        <div className="flex flex-wrap gap-2">
          {q.data?.roles.map((r) => (
            <div key={r.id} className={"flex items-center gap-1 rounded-lg border px-2 py-1 " + (r.id === role?.id ? "border-primary bg-primary/5" : "border-border")}>
              <button className="text-sm font-medium" onClick={() => setSel(r.id)}>{r.name}{!r.active && " (inactive)"}</button>
              {!r.is_system && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEdit(r)}><Pencil className="size-3.5" /></Button>
                  <ConfirmDelete what={`role "${r.name}"`} onConfirm={() => del(r.id)} />
                </>
              )}
            </div>
          ))}
        </div>
      </Panel>
      {role && (
        <Panel title={`Permissions — ${role.name}`} action={!locked && <Button size="sm" onClick={saveMatrix}>Save permissions</Button>}>
          {locked && <p className="mb-2 text-sm text-muted-foreground">Super Admin always has full access.</p>}
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr><th className={thCls}>Module</th>{["View", "Create", "Edit", "Delete", "Approve"].map((a) => <th key={a} className={thCls + " text-center"}>{a}</th>)}</tr></thead>
              <tbody>
                {MODULES.map(([mod, label]) => (
                  <tr key={mod}>
                    <td className={tdCls}>{label}</td>
                    {ACTIONS.map((a) => (
                      <td key={a} className={tdCls + " text-center"}>
                        <Checkbox disabled={locked} checked={locked || !!matrix[mod]?.[a]}
                          onCheckedChange={(v) => setMatrix({ ...matrix, [mod]: { ...matrix[mod]!, [a]: !!v } })} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{edit.id ? "Edit role" : "New role"}</DialogTitle></DialogHeader>
            <Field label="Name"><Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Description"><Input value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><Switch checked={edit.active ?? true} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /> Active</label>
            <Button onClick={saveRole}>Save</Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ---------------- Leave Policy ---------------- */
type LP = Database["public"]["Tables"]["leave_policies"]["Row"];
type PSet = Database["public"]["Tables"]["leave_policy_sets"]["Row"];
type PType = Database["public"]["Tables"]["leave_policy_types"]["Row"];
type PTypeDraft = Omit<PType, "id" | "policy_id" | "created_at"> & { id?: string };
const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]] as const;
const blankType = (): PTypeDraft => ({ name: "", base_type: null, days_per_year: 0, is_paid: true, allow_half_day: true, min_notice_days: 0, carry_forward: false, max_carry_forward: 0, requires_approval: true, approver: "manager", active: true });

export function LeavePolicySection() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<{ set: Partial<PSet>; types: PTypeDraft[] } | null>(null);
  const q = useQuery({
    queryKey: ["leave-policy-sets"],
    queryFn: async () => {
      const [s, t, p] = await Promise.all([
        supabase.from("leave_policy_sets").select("*").order("name"),
        supabase.from("leave_policy_types").select("*").order("name"),
        supabase.from("profiles").select("leave_policy_id"),
      ]);
      return { sets: s.data ?? [], types: t.data ?? [], counts: (p.data ?? []).reduce<Record<string, number>>((m, r) => { if (r.leave_policy_id) m[r.leave_policy_id] = (m[r.leave_policy_id] ?? 0) + 1; return m; }, {}) };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["leave-policy-sets"] });
  const toggle = async (x: PSet) => {
    const { error } = await supabase.from("leave_policy_sets").update({ active: !x.active }).eq("id", x.id);
    if (error) toast.error("You don't have permission to change leave policies.");
    refresh();
  };
  if (q.isLoading) return <Loading />;
  const d = q.data!;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEdit({ set: { name: "", description: "", working_days: [1, 2, 3, 4, 5, 6], active: true, notify_user_ids: [] }, types: [blankType()] })}><Plus className="size-4" /> New policy</Button>
      </div>
      {d.sets.length === 0 ? <Empty>No leave policies yet.</Empty> : d.sets.map((x) => {
        const types = d.types.filter((t) => t.policy_id === x.id);
        return (
          <Panel key={x.id} title={x.name} action={
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm"><Switch checked={x.active} onCheckedChange={() => toggle(x)} /> Active</label>
              <Button size="sm" variant="outline" onClick={() => setEdit({ set: x, types: types.map(({ policy_id: _p, created_at: _c, ...r }) => r) })}><Pencil className="size-4" /> Edit</Button>
            </div>
          }>
            {x.description && <p className="mb-2 text-sm text-muted-foreground">{x.description}</p>}
            <p className="text-sm">Working days: {DAYS.filter(([n]) => x.working_days.includes(n)).map(([, l]) => l).join(", ") || "none"} · {d.counts[x.id] ?? 0} employees</p>
            <div className="mt-3 overflow-x-auto">
              <table className={tableCls}>
                <thead><tr><th className={thCls}>Leave type</th><th className={thCls}>Days/yr</th><th className={thCls}>Paid</th><th className={thCls}>Half-day</th><th className={thCls}>Notice</th><th className={thCls}>Carry fwd</th><th className={thCls}>Approver</th></tr></thead>
                <tbody>{types.map((t) => (
                  <tr key={t.id} className={t.active ? "" : "opacity-50"}>
                    <td className={tdCls}>{t.name}</td><td className={tdCls}>{t.days_per_year}</td><td className={tdCls}>{t.is_paid ? "Paid" : "Unpaid"}</td>
                    <td className={tdCls}>{t.allow_half_day ? "Yes" : "No"}</td><td className={tdCls}>{t.min_notice_days}d</td>
                    <td className={tdCls}>{t.carry_forward ? `Up to ${t.max_carry_forward}` : "No"}</td><td className={tdCls}>{t.requires_approval ? t.approver : "Not needed"}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </Panel>
        );
      })}
      {edit && <PolicyDialog init={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
    </div>
  );
}

function PolicyDialog({ init, onClose, onSaved }: { init: { set: Partial<PSet>; types: PTypeDraft[] }; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState(init.set);
  const [types, setTypes] = useState(init.types);
  const [saving, setSaving] = useState(false);
  const setT = (i: number, patch: Partial<PTypeDraft>) => setTypes(types.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const save = async () => {
    const name = (s.name ?? "").trim();
    if (!name) return toast.error("Policy name is required.");
    const clean = types.map((t) => ({ ...t, name: t.name.trim() }));
    if (clean.some((t) => !t.name)) return toast.error("Every leave type needs a name.");
    if (new Set(clean.map((t) => t.name.toLowerCase())).size !== clean.length) return toast.error("Leave type names must be unique.");
    if (clean.some((t) => t.days_per_year < 0 || t.days_per_year > 365 || t.min_notice_days < 0 || t.max_carry_forward < 0)) return toast.error("Check the day values.");
    setSaving(true);
    try {
      const row = { name, description: s.description?.trim() || null, working_days: s.working_days ?? [], active: s.active ?? true, notify_user_ids: s.notify_user_ids ?? [] };
      const r = s.id ? await supabase.from("leave_policy_sets").update(row).eq("id", s.id).select("id").single() : await supabase.from("leave_policy_sets").insert(row).select("id").single();
      if (r.error) throw new Error(r.error.code === "23505" ? "A policy with this name already exists." : "You don't have permission to save leave policies.");
      const pid = r.data.id;
      const keep = clean.filter((t) => t.id).map((t) => t.id!);
      const removed = init.types.filter((t) => t.id && !keep.includes(t.id)).map((t) => t.id!);
      if (removed.length) await supabase.from("leave_policy_types").delete().in("id", removed);
      const up = await supabase.from("leave_policy_types").upsert(clean.map((t) => ({ ...t, policy_id: pid, max_carry_forward: t.carry_forward ? t.max_carry_forward : 0 })));
      if (up.error) throw new Error("Could not save leave types.");
      toast.success("Leave policy saved");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save."); } finally { setSaving(false); }
  };
  const wd = s.working_days ?? [];
  const notify = s.notify_user_ids ?? [];
  const people = useQuery({
    queryKey: ["policy-notify-people"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, designation").eq("status", "active").order("full_name")).data ?? [],
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{s.id ? "Edit leave policy" : "New leave policy"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Policy name"><Input maxLength={100} value={s.name ?? ""} onChange={(e) => setS({ ...s, name: e.target.value })} /></Field>
          <label className="flex items-center gap-2 sm:pt-6 text-sm"><Switch checked={s.active ?? true} onCheckedChange={(v) => setS({ ...s, active: v })} /> Active</label>
          <Field label="Description" className="sm:col-span-2"><Input maxLength={500} value={s.description ?? ""} onChange={(e) => setS({ ...s, description: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-medium">Working days (unticked = non-working)</p>
            <div className="flex flex-wrap gap-3">{DAYS.map(([n, l]) => (
              <label key={n} className="flex items-center gap-2 text-sm">
                <Checkbox checked={wd.includes(n)} onCheckedChange={(v) => setS({ ...s, working_days: v ? [...wd, n].sort() : wd.filter((x) => x !== n) })} />{l}
              </label>))}</div>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1 text-sm font-medium">Also notify when leave is requested</p>
            <p className="mb-2 text-xs text-muted-foreground">The employee's manager is always notified. People listed here are notified too, but only for employees they are allowed to see.</p>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2">
              {(people.data ?? []).map((u) => (
                <label key={u.id} className="flex items-center gap-2 py-1 text-sm">
                  <Checkbox checked={notify.includes(u.id)} onCheckedChange={(v) => setS({ ...s, notify_user_ids: v ? [...notify, u.id] : notify.filter((x) => x !== u.id) })} />
                  <span className="min-w-0 break-words">{u.full_name}{u.designation ? ` · ${u.designation}` : ""}</span>
                </label>))}
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Leave types</p>
          {types.map((t, i) => (
            <div key={t.id ?? `new-${i}`} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Name"><Input maxLength={60} placeholder="e.g. Casual Leave" value={t.name} onChange={(e) => setT(i, { name: e.target.value })} /></Field>
              <Field label="Days per year"><Input type="number" min={0} value={t.days_per_year} onChange={(e) => setT(i, { days_per_year: Number(e.target.value) })} /></Field>
              <Field label="Notice (days)"><Input type="number" min={0} value={t.min_notice_days} onChange={(e) => setT(i, { min_notice_days: Number(e.target.value) })} /></Field>
              <Field label="Approved by">
                <NativeSelect value={t.approver} onChange={(e) => setT(i, { approver: e.target.value })}>
                  <option value="manager">Manager</option><option value="hr">HR</option><option value="admin">Admin</option><option value="super_admin">Super Admin</option>
                </NativeSelect>
              </Field>
              <label className="flex items-center gap-2 text-sm"><Switch checked={t.is_paid} onCheckedChange={(v) => setT(i, { is_paid: v })} /> Paid</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={t.allow_half_day} onCheckedChange={(v) => setT(i, { allow_half_day: v })} /> Half-day allowed</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={t.requires_approval} onCheckedChange={(v) => setT(i, { requires_approval: v })} /> Needs approval</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={t.active} onCheckedChange={(v) => setT(i, { active: v })} /> Active</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={t.carry_forward} onCheckedChange={(v) => setT(i, { carry_forward: v })} /> Carry forward</label>
              {t.carry_forward && <Field label="Carry-forward limit (days)"><Input type="number" min={0} value={t.max_carry_forward} onChange={(e) => setT(i, { max_carry_forward: Number(e.target.value) })} /></Field>}
              <div className="flex items-end justify-end lg:col-span-4"><Button size="sm" variant="ghost" onClick={() => setTypes(types.filter((_, j) => j !== i))}>Remove type</Button></div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setTypes([...types, blankType()])}><Plus className="size-4" /> Add leave type</Button>
        </div>
        <Button onClick={save} disabled={saving}>Save policy</Button>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Holidays ---------------- */
type Hol = Database["public"]["Tables"]["holidays"]["Row"];
const HTYPES = ["public", "national", "festival", "company", "optional"];
export function HolidaysSection() {
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [view, setView] = useState<"list" | "calendar">("list");
  const [edit, setEdit] = useState<Partial<Hol> | null>(null);
  const q = useQuery({
    queryKey: ["holidays-admin", year],
    queryFn: async () => {
      const [h, l] = await Promise.all([
        supabase.from("holidays").select("*").gte("holiday_date", `${year}-01-01`).lte("holiday_date", `${year}-12-31`).order("holiday_date"),
        supabase.from("office_locations").select("id, name"),
      ]);
      return { hol: h.data ?? [], locs: l.data ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["holidays-admin"] });
  const save = async () => {
    if (!edit?.name?.trim() || !edit.holiday_date) return toast.error("Date and name are required.");
    const row = { name: edit.name.trim(), holiday_date: edit.holiday_date, holiday_type: edit.holiday_type ?? "public", mandatory: edit.mandatory ?? true, location_id: edit.location_id || null, active: edit.active ?? true };
    const { error } = edit.id ? await supabase.from("holidays").update(row).eq("id", edit.id) : await supabase.from("holidays").insert(row);
    if (error) return toast.error("Could not save holiday.");
    setEdit(null);
    refresh();
  };
  const toggle = async (h: Hol) => { await supabase.from("holidays").update({ active: !h.active }).eq("id", h.id); refresh(); };
  const del = async (id: string) => { const { error } = await supabase.from("holidays").delete().eq("id", id); if (error) toast.error("Could not delete."); refresh(); };
  const byMonth = useMemo(() => {
    const m: Hol[][] = Array.from({ length: 12 }, () => []);
    for (const h of q.data?.hol ?? []) m[Number(h.holiday_date.slice(5, 7)) - 1]!.push(h);
    return m;
  }, [q.data]);
  const locName = (id: string | null) => (id ? q.data?.locs.find((l) => l.id === id)?.name ?? "—" : "All locations");
  return (
    <Panel title="Holidays" action={
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24">{[year - 1, year, year + 1].map((y) => <option key={y}>{y}</option>)}</NativeSelect>
        <Button size="sm" variant="outline" onClick={() => setView(view === "list" ? "calendar" : "list")}>{view === "list" ? "Calendar view" : "List view"}</Button>
        <Button size="sm" onClick={() => setEdit({ holiday_type: "public", mandatory: true, active: true })}><Plus className="size-4" /> Add</Button>
      </div>}>
      {q.isLoading ? <Loading /> : view === "calendar" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {byMonth.map((list, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <p className="mb-2 text-sm font-semibold">{new Date(year, i, 1).toLocaleString("en-IN", { month: "long" })}</p>
              {!list.length ? <p className="text-xs text-muted-foreground">—</p> : list.map((h) => (
                <p key={h.id} className={"text-xs " + (h.active ? "" : "text-muted-foreground line-through")}>{h.holiday_date.slice(8)} · {h.name}</p>
              ))}
            </div>
          ))}
        </div>
      ) : !q.data?.hol.length ? <Empty>No holidays for {year}.</Empty> : (
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Date</th><th className={thCls}>Name</th><th className={thCls}>Type</th><th className={thCls}>Mandatory</th><th className={thCls}>Location</th><th className={thCls}>Active</th><th /></tr></thead>
            <tbody>
              {q.data.hol.map((h) => (
                <tr key={h.id}>
                  <td className={tdCls}>{h.holiday_date}</td><td className={tdCls}>{h.name}</td>
                  <td className={tdCls + " capitalize"}>{h.holiday_type}</td><td className={tdCls}>{h.mandatory ? "Yes" : "Optional"}</td>
                  <td className={tdCls}>{locName(h.location_id)}</td>
                  <td className={tdCls}><Switch checked={h.active} onCheckedChange={() => toggle(h)} /></td>
                  <td className={tdCls + " whitespace-nowrap text-right"}>
                    <Button size="sm" variant="ghost" onClick={() => setEdit(h)}><Pencil className="size-4" /></Button>
                    <ConfirmDelete what={`holiday "${h.name}"`} onConfirm={() => del(h.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{edit.id ? "Edit holiday" : "Add holiday"}</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date"><Input type="date" value={edit.holiday_date ?? ""} onChange={(e) => setEdit({ ...edit, holiday_date: e.target.value })} /></Field>
              <Field label="Name"><Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Type"><NativeSelect value={edit.holiday_type} onChange={(e) => setEdit({ ...edit, holiday_type: e.target.value })}>{HTYPES.map((t) => <option key={t} value={t}>{t}</option>)}</NativeSelect></Field>
              <Field label="Location"><NativeSelect value={edit.location_id ?? ""} onChange={(e) => setEdit({ ...edit, location_id: e.target.value || null })}><option value="">All locations</option>{q.data?.locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</NativeSelect></Field>
              <label className="flex items-center gap-2 text-sm"><Switch checked={edit.mandatory ?? true} onCheckedChange={(v) => setEdit({ ...edit, mandatory: v })} /> Mandatory</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={edit.active ?? true} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /> Active</label>
            </div>
            <Button onClick={save}>Save</Button>
          </DialogContent>
        </Dialog>
      )}
    </Panel>
  );
}
