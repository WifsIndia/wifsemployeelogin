import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { pageHead } from "@/lib/meta";
import { createEmployee } from "@/lib/employees.functions";
import { EmployeeEditDialog } from "@/components/EmployeeEditDialog";
import { Empty, Loading, PageHeader, RequireModule, RequireRole, StatusPill } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/employees")({
  head: () => pageHead("Employees", "Manage WiFS employees, roles and reporting managers."),
  component: () => (
    <RequireRole roles={["super_admin", "admin", "hr"]}><RequireModule module="employees">
      <Page />
    </RequireModule></RequireRole>
  ),
});

const ROLES: AppRole[] = ["employee", "agent", "ado", "manager", "hr", "admin"];
const NONE = "__none";

type Row = {
  id: string; full_name: string; email: string; username: string | null; phone: string | null; employee_code: string | null;
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
    `${p.full_name} ${p.email} ${p.username ?? ""} ${p.employee_code ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  const deptName = (id: string | null) => q.data?.depts.find((d) => d.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Employees"
        description={`${q.data?.people.length ?? 0} employees`}
        action={<Button onClick={() => setCreating(true)}>Add employee</Button>}
      />
      <Input placeholder="Search by name, username, email or code" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
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
                  <td className="p-3"><p className="font-medium">{p.full_name || "—"}</p><p className="text-xs text-muted-foreground">{p.username ? `@${p.username} · ` : ""}{p.email}</p></td>
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
        <EmployeeEditDialog
          row={edit}
          people={q.data?.people ?? []}
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

function CreateDialog({ isAdmin, onClose, onSaved }: { isAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const create = useServerFn(createEmployee);
  const [f, setF] = useState({ full_name: "", username: "", email: "", password: "", role: "employee" as AppRole });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!/^[a-z0-9._-]{3,30}$/.test(f.username.trim().toLowerCase())) return toast.error("Username must be 3–30 letters, numbers, dots, dashes or underscores.");
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
          <div><Label>Username</Label><Input autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} placeholder="e.g. rahul.patil" /></div>
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
