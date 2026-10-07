import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/settings/shared";

export const ASSIGNABLE_ROLES: AppRole[] = ["employee", "agent", "ado", "manager", "hr", "admin"];
export const ROLE_ORDER: AppRole[] = ["super_admin", "admin", "hr", "manager", "ado", "agent", "employee"];

export type EmpRow = {
  id: string; full_name: string; email: string; phone: string | null; employee_code: string | null;
  designation: string | null; department_id: string | null; manager_id: string | null;
  joining_date: string | null; status: "active" | "inactive"; location_id?: string | null;
  employment_type?: string; role: AppRole;
};

/** Shared org-assignment editor used by Employees page and Super Admin Staff settings. */
export function EmployeeEditDialog({ row, people, onClose, onSaved }: {
  row: EmpRow; people: EmpRow[]; onClose: () => void; onSaved: () => void;
}) {
  const { hasRole, roles, user } = useAuth();
  const isSuper = roles.includes("super_admin");
  const isAdmin = hasRole("admin");
  const isSelf = row.id === user?.id;
  const canRole = isAdmin && !isSelf && (isSuper || row.role !== "super_admin");
  const [f, setF] = useState(row);
  const [companies, setCompanies] = useState<string[]>([]);
  const [comp, setComp] = useState({ basic_salary: 0, allowances: 0, deductions: 0, payment_mode: "bank", bank_name: "", account_holder: "", account_number: "", ifsc: "", upi_id: "" });
  const [saving, setSaving] = useState(false);

  const meta = useQuery({
    queryKey: ["emp-edit-meta", row.id],
    queryFn: async () => {
      const [d, l, c, uc, ec] = await Promise.all([
        supabase.from("departments").select("id, name").order("name"),
        supabase.from("office_locations").select("id, name").order("name"),
        supabase.from("companies").select("id, name, active").order("name"),
        supabase.from("user_companies").select("company_id").eq("user_id", row.id),
        isSuper ? supabase.from("employee_compensation").select("*").eq("employee_id", row.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      return { depts: d.data ?? [], locs: l.data ?? [], companies: c.data ?? [], mine: (uc.data ?? []).map((x) => x.company_id), comp: ec.data };
    },
  });
  useEffect(() => {
    if (!meta.data) return;
    setCompanies(meta.data.mine);
    if (meta.data.comp) {
      const c = meta.data.comp;
      setComp({ basic_salary: Number(c.basic_salary), allowances: Number(c.allowances), deductions: Number(c.deductions), payment_mode: c.payment_mode, bank_name: c.bank_name ?? "", account_holder: c.account_holder ?? "", account_number: c.account_number ?? "", ifsc: c.ifsc ?? "", upi_id: c.upi_id ?? "" });
    }
  }, [meta.data]);

  // Agents report to an ADO; everyone else to a manager-level person.
  const supervisors = people.filter((p) =>
    p.id !== row.id && (f.role === "agent" ? p.role === "ado" : !["employee", "agent"].includes(p.role)),
  );

  const save = async () => {
    setSaving(true);
    try {
      const upd: Database["public"]["Tables"]["profiles"]["Update"] = {
        full_name: f.full_name.trim(), phone: f.phone || null, employee_code: f.employee_code || null,
        designation: f.designation || null, department_id: f.department_id || null, manager_id: f.manager_id || null,
        joining_date: f.joining_date || null, status: f.status,
      };
      if (isSuper) { upd.location_id = f.location_id || null; upd.employment_type = f.employment_type || "full_time"; }
      const { error } = await supabase.from("profiles").update(upd).eq("id", row.id);
      if (error) throw new Error("Could not save employee details.");

      if (canRole && f.role !== row.role) {
        await supabase.from("user_roles").delete().eq("user_id", row.id).neq("role", "super_admin");
        const r = await supabase.from("user_roles").insert({ user_id: row.id, role: f.role });
        if (r.error) throw new Error("Could not change role.");
      }

      if (isAdmin && !isSelf || isSuper) {
        const before = new Set(meta.data?.mine ?? []);
        const after = new Set(companies);
        const add = companies.filter((c) => !before.has(c)).map((company_id) => ({ user_id: row.id, company_id }));
        const remove = [...before].filter((c) => !after.has(c));
        if (add.length) { const r = await supabase.from("user_companies").insert(add); if (r.error) throw new Error("Could not update companies."); }
        if (remove.length) await supabase.from("user_companies").delete().eq("user_id", row.id).in("company_id", remove);
      }

      if (isSuper) {
        const r = await supabase.from("employee_compensation").upsert({ employee_id: row.id, ...comp, bank_name: comp.bank_name || null, account_holder: comp.account_holder || null, account_number: comp.account_number || null, ifsc: comp.ifsc || null, upi_id: comp.upi_id || null });
        if (r.error) throw new Error("Could not save salary details.");
      }
      toast.success("Employee updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const d = meta.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Edit employee</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" className="sm:col-span-2"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Employee ID"><Input value={f.employee_code ?? ""} onChange={(e) => setF({ ...f, employee_code: e.target.value })} /></Field>
          <Field label="Phone"><Input value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Designation"><Input value={f.designation ?? ""} onChange={(e) => setF({ ...f, designation: e.target.value })} /></Field>
          <Field label="Joining date"><Input type="date" value={f.joining_date ?? ""} onChange={(e) => setF({ ...f, joining_date: e.target.value })} /></Field>
          <Field label="Department">
            <NativeSelect value={f.department_id ?? ""} onChange={(e) => setF({ ...f, department_id: e.target.value || null })}>
              <option value="">None</option>{d?.depts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Role">
            <NativeSelect disabled={!canRole} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as AppRole, manager_id: null })}>
              {row.role === "super_admin" && <option value="super_admin">super admin</option>}
              {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </NativeSelect>
            {!canRole && <p className="text-xs text-muted-foreground">{isSelf ? "You can't change your own role." : "Only Admin can change roles."}</p>}
          </Field>
          <Field label={f.role === "agent" ? "Assigned ADO" : "Reporting manager"}>
            <NativeSelect value={f.manager_id ?? ""} onChange={(e) => setF({ ...f, manager_id: e.target.value || null })}>
              <option value="">None</option>{supervisors.map((m) => <option key={m.id} value={m.id}>{m.full_name} ({m.role})</option>)}
            </NativeSelect>
          </Field>
          <Field label="Status">
            <NativeSelect value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as EmpRow["status"] })}>
              <option value="active">Active</option><option value="inactive">Inactive</option>
            </NativeSelect>
          </Field>
          {isSuper && (
            <>
              <Field label="Location">
                <NativeSelect value={f.location_id ?? ""} onChange={(e) => setF({ ...f, location_id: e.target.value || null })}>
                  <option value="">None</option>{d?.locs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Employment type">
                <NativeSelect value={f.employment_type ?? "full_time"} onChange={(e) => setF({ ...f, employment_type: e.target.value })}>
                  {["full_time", "part_time", "contract", "intern"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                </NativeSelect>
              </Field>
            </>
          )}
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-medium">Company access</p>
            {!d?.companies.length ? <p className="text-xs text-muted-foreground">No companies set up yet.</p> : (
              <div className="flex flex-wrap gap-3">
                {d.companies.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      disabled={isSelf && !isSuper}
                      checked={companies.includes(c.id)}
                      onCheckedChange={(v) => setCompanies(v ? [...companies, c.id] : companies.filter((x) => x !== c.id))}
                    />
                    {c.name}{!c.active && " (inactive)"}
                  </label>
                ))}
              </div>
            )}
          </div>
          {isSuper && (
            <div className="grid gap-3 rounded-lg border border-border p-3 sm:col-span-2 sm:grid-cols-3">
              <p className="text-sm font-medium sm:col-span-3">Salary & payment (Super Admin only)</p>
              <Field label="Basic salary"><Input type="number" value={comp.basic_salary} onChange={(e) => setComp({ ...comp, basic_salary: Number(e.target.value) })} /></Field>
              <Field label="Allowances"><Input type="number" value={comp.allowances} onChange={(e) => setComp({ ...comp, allowances: Number(e.target.value) })} /></Field>
              <Field label="Other deductions"><Input type="number" value={comp.deductions} onChange={(e) => setComp({ ...comp, deductions: Number(e.target.value) })} /></Field>
              <Field label="Payment mode">
                <NativeSelect value={comp.payment_mode} onChange={(e) => setComp({ ...comp, payment_mode: e.target.value })}>
                  <option value="bank">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option>
                </NativeSelect>
              </Field>
              <Field label="Bank name"><Input value={comp.bank_name} onChange={(e) => setComp({ ...comp, bank_name: e.target.value })} /></Field>
              <Field label="Account holder"><Input value={comp.account_holder} onChange={(e) => setComp({ ...comp, account_holder: e.target.value })} /></Field>
              <Field label="Account number"><Input value={comp.account_number} onChange={(e) => setComp({ ...comp, account_number: e.target.value })} /></Field>
              <Field label="IFSC"><Input value={comp.ifsc} onChange={(e) => setComp({ ...comp, ifsc: e.target.value })} /></Field>
              <Field label="UPI ID"><Input value={comp.upi_id} onChange={(e) => setComp({ ...comp, upi_id: e.target.value })} /></Field>
            </div>
          )}
        </div>
        <Button onClick={save} disabled={saving}>Save changes</Button>
      </DialogContent>
    </Dialog>
  );
}
