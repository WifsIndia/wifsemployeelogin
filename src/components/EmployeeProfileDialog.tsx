import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/lib/permissions";
import { PersonalDocuments } from "@/components/PersonalDocuments";
import { formatDate } from "@/lib/format";
import { Loading, StatusPill } from "@/components/AppShell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Row = {
  id: string; full_name: string; email: string; username: string | null; phone: string | null; employee_code: string | null;
  designation: string | null; joining_date: string | null; status: "active" | "inactive"; role: string;
};

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="break-words text-sm font-medium">{children || "—"}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** Read-only employee profile. Every query runs as the viewer, so the database decides what shows. */
export function EmployeeProfileDialog({ row, deptName, managerName, onClose }: { row: Row; deptName: string; managerName: string; onClose: () => void }) {
  const { get } = usePermissions();
  const can = (m: string) => get(m).view;
  const q = useQuery({
    queryKey: ["employee-profile", row.id],
    queryFn: async () => {
      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const [p, uc, el, docs, bal, att, tasks, logs] = await Promise.all([
        supabase.from("profiles").select("leave_policy_id, employment_type").eq("id", row.id).maybeSingle(),
        supabase.from("user_companies").select("company:companies(name)").eq("user_id", row.id),
        supabase.from("employee_locations").select("location:office_locations(name)").eq("user_id", row.id),
        can("documents") ? supabase.from("documents").select("id, name, size_bytes, created_at").eq("employee_id", row.id).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: null }),
        can("leave") ? supabase.rpc("leave_balances", { _employee: row.id }) : Promise.resolve({ data: null }),
        can("attendance") ? supabase.from("attendance").select("id", { count: "exact", head: true }).eq("employee_id", row.id).gte("attendance_date", monthStart) : Promise.resolve({ count: null }),
        can("tasks") ? supabase.from("tasks").select("status").eq("assignee_id", row.id) : Promise.resolve({ data: null }),
        can("work_logs") ? supabase.from("daily_work_logs").select("id", { count: "exact", head: true }).eq("employee_id", row.id).gte("log_date", monthStart) : Promise.resolve({ count: null }),
      ]);
      const policy = p.data?.leave_policy_id
        ? (await supabase.from("leave_policy_sets").select("name").eq("id", p.data.leave_policy_id).maybeSingle()).data?.name
        : null;
      const names = (rows: unknown[] | null, k: string) =>
        (rows ?? []).map((r) => (r as Record<string, { name: string } | null>)[k]?.name).filter(Boolean).join(", ");
      const t = (tasks.data ?? []) as { status: string }[];
      return {
        employmentType: p.data?.employment_type ?? null,
        policy,
        companies: names(uc.data, "company"),
        locations: names(el.data, "location"),
        docs: docs.data as { id: string; name: string; size_bytes: number; created_at: string }[] | null,
        balances: bal.data as { label: string; available: number }[] | null,
        attendance: att.count,
        tasks: tasks.data ? { open: t.filter((x) => ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD"].includes(x.status)).length, done: t.filter((x) => x.status === "COMPLETED").length } : null,
        logs: logs.count,
      };
    },
  });
  const d = q.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{row.full_name || row.email}</DialogTitle></DialogHeader>
        {q.isLoading || !d ? <Loading /> : (
          <div className="space-y-4">
            <Section title="Employment">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Item label="Email">{row.email}</Item>
                <Item label="Username">{row.username ? `@${row.username}` : null}</Item>
                <Item label="Phone">{row.phone}</Item>
                <Item label="Employee code">{row.employee_code}</Item>
                <Item label="Designation">{row.designation}</Item>
                <Item label="Department">{deptName}</Item>
                <Item label="Role"><span className="capitalize">{row.role.replace("_", " ")}</span></Item>
                <Item label="Employment type"><span className="capitalize">{d.employmentType?.replace("_", " ")}</span></Item>
                <Item label="Joining date">{row.joining_date ? formatDate(row.joining_date) : null}</Item>
                <Item label="Status"><StatusPill status={row.status} /></Item>
                <Item label="Reporting person">{managerName}</Item>
              </div>
            </Section>
            <Section title="Assignments">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Item label="Companies">{d.companies}</Item>
                <Item label="Authorized office locations">{d.locations}</Item>
                <Item label="Leave policy">{d.policy}</Item>
              </div>
            </Section>
            {(d.balances || d.attendance !== null || d.tasks || d.logs !== null) && (
              <Section title="Records">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {d.attendance !== null && <Item label="Days present (this month)">{String(d.attendance)}</Item>}
                  {d.tasks && <Item label="Open tasks">{String(d.tasks.open)}</Item>}
                  {d.tasks && <Item label="Completed tasks">{String(d.tasks.done)}</Item>}
                  {d.logs !== null && <Item label="Work logs (this month)">{String(d.logs)}</Item>}
                </div>
                {d.balances && d.balances.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {d.balances.map((b) => (
                      <span key={b.label} className="rounded-full bg-muted px-3 py-1 text-xs">{b.label}: {Number(b.available)} left</span>
                    ))}
                  </div>
                )}
              </Section>
            )}
            {d.docs && (
              <Section title="Personal documents">
                <PersonalDocuments employeeId={row.id} />
              </Section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
