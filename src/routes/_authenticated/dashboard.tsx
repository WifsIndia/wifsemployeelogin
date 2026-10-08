import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { pageHead } from "@/lib/meta";
import { formatDate, todayISO } from "@/lib/format";
import { AttendanceCard } from "@/components/AttendanceCard";
import { Panel, TeamOverview } from "@/components/TeamOverview";
import { Empty, StatCard, StatusPill } from "@/components/AppShell";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => pageHead("Dashboard", "Your daily overview: attendance, tasks, leave and announcements."),
  component: Dashboard,
});

function Dashboard() {
  const { profile, primaryRole, user } = useAuth();
  const today = todayISO();
  const uid = user?.id;

  const mine = useQuery({
    queryKey: ["my-dashboard", uid, today],
    enabled: !!uid,
    queryFn: async () => {
      const [tasks, log, leave, ann, notes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, status, progress, due_date, priority")
          .eq("assignee_id", uid!)
          .neq("status", "COMPLETED")
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(6),
        supabase.from("daily_work_logs").select("id").eq("employee_id", uid!).eq("log_date", today).maybeSingle(),
        supabase
          .from("leave_requests")
          .select("id, leave_type, start_date, end_date, status")
          .eq("employee_id", uid!)
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("announcements")
          .select("id, title, message, published_at")
          .eq("active", true)
          .order("published_at", { ascending: false })
          .limit(3),
        supabase
          .from("notifications")
          .select("id, title, body, read, created_at").or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .eq("user_id", uid!)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      return {
        tasks: tasks.data ?? [],
        logDone: !!log.data,
        leave: leave.data ?? [],
        ann: ann.data ?? [],
        notes: notes.data ?? [],
      };
    },
  });

  const d = mine.data;
  const dateStr = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{dateStr}</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Welcome, {profile?.full_name?.split(" ")[0] || "there"}
        </h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <AttendanceCard />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Today's work log">
            {d?.logDone ? (
              <p className="text-sm text-success">Submitted for today. Thank you!</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not submitted yet.{" "}
                <Link to="/work-log" className="font-semibold text-primary hover:underline">
                  Write today's log
                </Link>
              </p>
            )}
          </Panel>
          <Panel title="Leave status" action={<Link to="/leave" className="text-xs font-semibold text-primary">View all</Link>}>
            {!d || d.leave.length === 0 ? (
              <Empty>No leave requests.</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.leave.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2">
                    <span>
                      {formatDate(l.start_date)} – {formatDate(l.end_date)}
                    </span>
                    <StatusPill status={l.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="My open tasks" action={<Link to="/tasks" className="text-xs font-semibold text-primary">All tasks</Link>}>
          {!d || d.tasks.length === 0 ? (
            <Empty>No open tasks assigned to you.</Empty>
          ) : (
            <ul className="space-y-3">
              {d.tasks.map((t) => (
                <li key={t.id}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{t.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t.due_date ? formatDate(t.due_date) : ""}</span>
                  </div>
                  <Progress value={t.progress} className="mt-1 h-1.5" />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Announcements" action={<Link to="/announcements" className="text-xs font-semibold text-primary">View all</Link>}>
          {!d || d.ann.length === 0 ? (
            <Empty>No announcements.</Empty>
          ) : (
            <ul className="space-y-3 text-sm">
              {d.ann.map((a) => (
                <li key={a.id}>
                  <p className="font-medium">{a.title}</p>
                  <p className="line-clamp-2 text-muted-foreground">{a.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Notifications" action={<Link to="/notifications" className="text-xs font-semibold text-primary">View all</Link>}>
          {!d || d.notes.length === 0 ? (
            <Empty>You're all caught up.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.notes.map((n) => (
                <li key={n.id} className={n.read ? "text-muted-foreground" : "font-medium"}>
                  {n.title}
                  {n.body && <span className="block truncate text-xs font-normal text-muted-foreground">{n.body}</span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {primaryRole === "employee" && uid && <MyLeaveBalance userId={uid} />}

      {primaryRole === "super_admin" && <SystemStats />}

      {primaryRole !== "employee" && (
        <section>
          <h2 className="mb-3 font-display text-xl font-bold">
            {primaryRole === "manager" ? "My team" : primaryRole === "hr" ? "HR overview" : "Organisation overview"}
          </h2>
          <TeamOverview scope={primaryRole === "manager" || primaryRole === "ado" ? "team" : "all"} variant={primaryRole === "manager" || primaryRole === "ado" ? "manager" : primaryRole === "hr" ? "hr" : "admin"} gate={["super_admin", "admin", "hr", "manager"].includes(primaryRole)} />
        </section>
      )}
    </div>
  );
}

function MyLeaveBalance({ userId }: { userId: string }) {
  const q = useQuery({
    queryKey: ["leave-balances", userId],
    queryFn: async () => (await supabase.rpc("leave_balances", { _employee: userId })).data ?? [],
  });
  if (!q.data?.length) return null;
  return (
    <Panel title="My leave balance" action={<Link to="/leave" className="text-xs font-semibold text-primary">Apply / view</Link>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {q.data.map((b) => (
          <div key={b.leave_type} className="rounded-lg border border-border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{b.label}</p>
            <p className="font-display text-xl font-bold">{Number(b.available)}</p>
            <p className="text-[11px] text-muted-foreground">used {Number(b.used)} · pending {Number(b.pending)}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SystemStats() {
  const month = todayISO().slice(0, 7) + "-01";
  const q = useQuery({
    queryKey: ["system-stats", month],
    queryFn: async () => {
      const h = { count: "exact" as const, head: true };
      const [emp, inactive, comp, loc, pol, docs, pay] = await Promise.all([
        supabase.from("profiles").select("id", h).eq("status", "active"),
        supabase.from("profiles").select("id", h).eq("status", "inactive"),
        supabase.from("companies").select("id", h).eq("active", true),
        supabase.from("office_locations").select("id", h).eq("active", true),
        supabase.from("leave_policy_sets").select("id", h).eq("active", true),
        supabase.from("documents").select("id", h),
        supabase.from("payroll_records").select("status").eq("month", month),
      ]);
      const p = pay.data ?? [];
      return {
        emp: emp.count ?? 0,
        inactive: inactive.count ?? 0,
        comp: comp.count ?? 0,
        loc: loc.count ?? 0,
        pol: pol.count ?? 0,
        docs: docs.count ?? 0,
        payDraft: p.filter((r) => r.status === "draft").length,
        payFinal: p.filter((r) => r.status === "finalized").length,
      };
    },
  });
  const d = q.data;
  return (
    <section>
      <h2 className="mb-3 font-display text-xl font-bold">System summary</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active employees" value={d?.emp ?? "—"} hint={d ? `${d.inactive} inactive` : undefined} />
        <StatCard label="Companies" value={d?.comp ?? "—"} />
        <StatCard label="Office locations" value={d?.loc ?? "—"} />
        <StatCard label="Leave policies" value={d?.pol ?? "—"} />
        <StatCard label="Documents" value={d?.docs ?? "—"} />
        <StatCard label="Payroll this month" value={d ? d.payFinal : "—"} hint={d ? `finalized · ${d.payDraft} draft` : undefined} />
      </div>
    </section>
  );
}
