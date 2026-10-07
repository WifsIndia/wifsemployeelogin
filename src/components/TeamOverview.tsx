import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDate, formatTime, todayISO } from "@/lib/format";
import { Empty, Loading, StatCard } from "@/components/AppShell";
import { usePermission } from "@/lib/permissions";

type Scope = "team" | "all";

export function useScopedPeople(scope: Scope) {
  const { user, roles } = useAuth();
  // Managers see their whole reporting line (database limits it to their hierarchy and companies).
  const wholeLine = scope === "team" && roles.includes("manager");
  return useQuery({
    queryKey: ["people", scope, user?.id, wholeLine],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("id, full_name, designation, department_id, manager_id, status, employee_code, email, leave_policy_id")
        .eq("status", "active")
        .order("full_name");
      if (wholeLine) q = q.neq("id", user!.id);
      else if (scope === "team") q = q.eq("manager_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function TeamOverview({
  scope,
  variant,
  gate = false,
}: {
  scope: Scope;
  variant: "manager" | "hr" | "admin";
  /** Hide sections the viewer has no View permission for. */
  gate?: boolean;
}) {
  const today = todayISO();
  const { hasRole } = useAuth();
  const pAtt = usePermission("attendance");
  const pLeave = usePermission("leave");
  const pTasks = usePermission("tasks");
  const pLogs = usePermission("work_logs");
  const all = !gate || hasRole("super_admin");
  const can = { att: all || pAtt.view, leave: all || pLeave.view, tasks: all || pTasks.view, logs: all || pLogs.view };
  const people = useScopedPeople(scope);
  const ids = (people.data ?? []).map((p) => p.id);

  const stats = useQuery({
    queryKey: ["overview", scope, today, ids.join(",")],
    enabled: people.isSuccess,
    queryFn: async () => {
      if (ids.length === 0) return { att: [], leave: [], tasks: [], logs: [], depts: [] };
      const [att, leave, tasks, logs, depts] = await Promise.all([
        supabase.from("attendance").select("employee_id, status, check_in_time").eq("attendance_date", today).in("employee_id", ids),
        supabase
          .from("leave_requests")
          .select("id, employee_id, leave_type, start_date, end_date, status")
          .eq("status", "PENDING")
          .in("employee_id", ids),
        supabase.from("tasks").select("id, status, assignee_id").in("assignee_id", ids),
        supabase
          .from("daily_work_logs")
          .select("id, employee_id, log_date, summary, hours_worked")
          .in("employee_id", ids)
          .order("log_date", { ascending: false })
          .limit(8),
        supabase.from("departments").select("id, name"),
      ]);
      return {
        att: att.data ?? [],
        leave: leave.data ?? [],
        tasks: tasks.data ?? [],
        logs: logs.data ?? [],
        depts: depts.data ?? [],
      };
    },
  });

  if (people.isLoading || stats.isLoading) return <Loading />;
  const s = stats.data;
  if (!s) return null;
  const nameOf = (id: string) => people.data?.find((p) => p.id === id)?.full_name ?? "—";
  const present = s.att.length;
  const working = s.att.filter((a) => a.status === "checked_in").length;
  const checkedOut = present - working;
  const total = ids.length;
  const byStatus = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"].map((st) => ({
    st,
    n: s.tasks.filter((t) => t.status === st).length,
  }));
  const completed = byStatus[3]!.n;
  const active = byStatus[0]!.n + byStatus[1]!.n + byStatus[2]!.n;
  const stLabel = (st: string) => (st === "NOT_STARTED" ? "pending" : st.replace("_", " ").toLowerCase());

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={scope === "team" ? "Team size" : "Total employees"} value={total} />
        {can.att && <StatCard label="Present today" value={present} />}
        {can.att && <StatCard label="Absent today" value={Math.max(0, total - present)} />}
        {can.att && <StatCard label="Currently working" value={working} />}
        {can.att && variant !== "hr" && <StatCard label="Checked out" value={checkedOut} />}
        {can.leave && <StatCard label="Pending leave" value={s.leave.length} />}
        {can.tasks && variant !== "hr" && <StatCard label="Active tasks" value={active} />}
        {can.tasks && variant !== "hr" && (
          <StatCard
            label="Completed tasks"
            value={completed}
            hint={s.tasks.length ? `${Math.round((completed / s.tasks.length) * 100)}% completion` : undefined}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {can.att && <Panel title="Attendance today">
          <Bars
            rows={[
              { label: "Working", n: working },
              { label: "Checked out", n: checkedOut },
              { label: "Absent", n: Math.max(0, total - present) },
            ]}
            max={Math.max(total, 1)}
          />
        </Panel>}
        {variant === "hr" ? (
          <Panel title="Departments">
            <Bars
              rows={s.depts.map((d) => ({
                label: d.name,
                n: (people.data ?? []).filter((p) => p.department_id === d.id).length,
              }))}
              max={Math.max(total, 1)}
            />
          </Panel>
        ) : can.tasks && (
          <Panel title="Tasks by status">
            <Bars
              rows={byStatus.map((b) => ({ label: stLabel(b.st), n: b.n }))}
              max={Math.max(s.tasks.length, 1)}
            />
          </Panel>
        )}
        {can.leave && <Panel title="Pending leave requests">
          {s.leave.length === 0 ? (
            <Empty>No pending requests.</Empty>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {s.leave.slice(0, 6).map((l) => (
                <li key={l.id} className="flex justify-between gap-2 py-2">
                  <span className="font-medium">{nameOf(l.employee_id)}</span>
                  <span className="text-muted-foreground">
                    {l.leave_type.toLowerCase()} · {formatDate(l.start_date)} – {formatDate(l.end_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>}
        {can.logs && <Panel title="Recent work logs">
          {s.logs.length === 0 ? (
            <Empty>No work logs yet.</Empty>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {s.logs.map((l) => (
                <li key={l.id} className="py-2">
                  <p className="flex justify-between">
                    <span className="font-medium">{nameOf(l.employee_id)}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(l.log_date)}</span>
                  </p>
                  <p className="line-clamp-1 text-muted-foreground">{l.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>}
        {variant === "hr" && can.att && (
          <Panel title="Recent activity (today's check-ins)">
            {s.att.length === 0 ? (
              <Empty>No check-ins yet today.</Empty>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {s.att.slice(0, 8).map((a) => (
                  <li key={a.employee_id} className="flex justify-between py-2">
                    <span>{nameOf(a.employee_id)}</span>
                    <span className="text-muted-foreground">checked in {formatTime(a.check_in_time)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

export function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Bars({ rows, max }: { rows: { label: string; n: number }[]; max: number }) {
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="capitalize">{r.label}</span>
            <span className="font-semibold">{r.n}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(r.n / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
