import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { pageHead } from "@/lib/meta";
import { createEmployee } from "@/lib/employees.functions";
import { Empty, Loading, PageHeader, RequireRole, StatusPill } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/employees")({
  head: () => pageHead("Employees", "Manage WiFS employees, roles and reporting managers."),
  component: () => (
    <RequireRole roles={["super_admin", "admin", "hr"]}>
      <Page />
    </RequireRole>
  ),
});

const ROLES: AppRole[] = ["employee", "agent", "ado", "manager", "hr", "admin"];
const NONE = "__none";

type Row = {
  id: string; full_name: string; email: string; phone: string | null; employee_code: string | null;
  designation: string | null; department_id: string | null; manager_id: string | null;
  joining_date: string | null; status: "active" | "inactive";
};

function Page() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<(Row & { role: AppRole }) | null>(null);
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const [p, r, d] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("departments").select("id, name").order("name"),
      ]);
      const roleOf = new Map<string, AppRole>();
      const order = ["super_admin", "admin", "hr", "manager", "ado", "agent", "employee"];
      for (const x of (r.data ?? []) as { user_id: string; role: AppRole }[]) {
        const cur = roleOf.get(x.user_id);
        if (!cur || order.indexOf(x.role) < order.indexOf(cur)) roleOf.set(x.user_id, x.role);
      }
      return {
        people: ((p.data ?? []) as Row[]).map((x) => ({ ...x, role: roleOf.get(x.id) ?? ("employee" as AppRole) })),
        depts: d.data ?? [],
      };
    },
  });

  const people = (q.data?.people ?? []).filter((p) =>
    `${p.full_name} ${p.email} ${p.employee_code ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  const deptName = (id: string | null) => q.data?.depts.find((d) => d.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Employees"
        description={`${q.data?.people.length ?? 0} employees`}
        action={<Button onClick={() => setCreating(true)}>Add employee</Button>}
      />
      <Input placeholder="Search by name, email or code" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      {q.isLoading ? (
        <Loading />
      ) : people.length === 0 ? (
        <Empty>No employees found.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Name</th><th className="p-3">Code</th><th className="p-3">Department</th>
                <th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="p-3"><p className="font-medium">{p.full_name || "—"}</p><p className="text-xs text-muted-foreground">{p.email}</p></td>
                  <td className="p-3">{p.employee_code ?? "—"}</td>
                  <td className="p-3">{deptName(p.department_id)}</td>
                  <td className="p-3 capitalize">{p.role}</td>
                  <td className="p-3"><StatusPill status={p.status} /></td>
                  <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => setEdit(p)}>Edit</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <EditDialog
          row={edit}
          isAdmin={isAdmin}
          depts={q.data?.depts ?? []}
          managers={(q.data?.people ?? []).filter((p) => p.id !== edit.id && p.role !== "employee")}
          onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); qc.invalidateQueries({ queryKey: ["employees"] }); }}
        />
      )}
      {creating && (
        <CreateDialog isAdmin={isAdmin} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); qc.invalidateQueries({ queryKey: ["employees"] }); }} />
      )}
    </div>
  );
}

function EditDialog({ row, isAdmin, depts, managers, onClose, onSaved }: {
  row: Row & { role: AppRole }; isAdmin: boolean; depts: { id: string; name: string }[];
  managers: { id: string; full_name: string }[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState(row);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: f.full_name.trim(), phone: f.phone || null, employee_code: f.employee_code || null,
      designation: f.designation || null, department_id: f.department_id, manager_id: f.manager_id,
      joining_date: f.joining_date || null, status: f.status,
    }).eq("id", row.id);
    if (!error && isAdmin && f.role !== row.role) {
      await supabase.from("user_roles").delete().eq("user_id", row.id);
      const r = await supabase.from("user_roles").insert({ user_id: row.id, role: f.role });
      if (r.error) toast.error("Could not change role.");
    }
    setSaving(false);
    if (error) return toast.error("Could not save employee.");
    toast.success("Employee updated");
    onSaved();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit employee</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Full name</Label><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
          <div><Label>Employee code</Label><Input value={f.employee_code ?? ""} onChange={(e) => setF({ ...f, employee_code: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><Label>Designation</Label><Input value={f.designation ?? ""} onChange={(e) => setF({ ...f, designation: e.target.value })} /></div>
          <div><Label>Joining date</Label><Input type="date" value={f.joining_date ?? ""} onChange={(e) => setF({ ...f, joining_date: e.target.value })} /></div>
          <div>
            <Label>Department</Label>
            <Select value={f.department_id ?? NONE} onValueChange={(v) => setF({ ...f, department_id: v === NONE ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>None</SelectItem>{depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reporting manager</Label>
            <Select value={f.manager_id ?? NONE} onValueChange={(v) => setF({ ...f, manager_id: v === NONE ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>None</SelectItem>{managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v as Row["status"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label>Role {!isAdmin && "(admin only)"}</Label>
            <Select disabled={!isAdmin} value={f.role} onValueChange={(v) => setF({ ...f, role: v as AppRole })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={save} disabled={saving}>Save changes</Button>
      </DialogContent>
    </Dialog>
  );
}

function CreateDialog({ isAdmin, onClose, onSaved }: { isAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const create = useServerFn(createEmployee);
  const [f, setF] = useState({ full_name: "", email: "", password: "", role: "employee" as AppRole });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (f.password.length < 8) return toast.error("Temporary password must be at least 8 characters.");
    setSaving(true);
    try {
      await create({ data: f });
      toast.success("Employee account created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create employee.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add employee</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Full name</Label><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><Label>Temporary password</Label><Input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          <div>
            <Label>Role</Label>
            <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v as AppRole })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.filter((r) => isAdmin || r !== "admin").map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">Share the temporary password with the employee; they can change it from My Profile.</p>
          <Button onClick={submit} disabled={saving}>Create account</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
