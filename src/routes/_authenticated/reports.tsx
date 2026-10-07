import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pageHead, monthStartISO, hoursBetween } from "@/lib/meta";
import { downloadCSV, formatDate, formatTime, todayISO } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/permissions";
import { AccessDenied, Empty, Loading, PageHeader, StatCard } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () =>
    pageHead("Reports", "Employee, attendance, leave, payroll, task and daily work reports with CSV export."),
  component: Page,
});

type ReportKey = "employees" | "attendance" | "leave" | "payroll" | "tasks" | "work";
const REPORTS: { key: ReportKey; label: string; module: string; statuses: string[] }[] = [
  { key: "employees", label: "Employees", module: "employees", statuses: ["active", "inactive"] },
  { key: "attendance", label: "Attendance", module: "attendance", statuses: ["checked_in", "checked_out"] },
  { key: "leave", label: "Leave", module: "leave", statuses: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] },
  { key: "payroll", label: "Payroll", module: "payroll", statuses: ["draft", "finalized"] },
  { key: "tasks", label: "Tasks", module: "tasks", statuses: ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"] },
  { key: "work", label: "Daily work", module: "work_logs", statuses: ["IN_PROGRESS", "COMPLETED", "BLOCKED"] },
];

const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";
type Row = Record<string, string | number>;

function Page() {
  const { user, hasRole } = useAuth();
  const isSuper = hasRole("super_admin");
  const reportsPerm = usePermission("reports");
  const perms = {
    employees: usePermission("employees").view,
    attendance: usePermission("attendance").view,
    leave: usePermission("leave").view,
    payroll: usePermission("payroll").view,
    tasks: usePermission("tasks").view,
    work_logs: usePermission("work_logs").view,
  } as Record<string, boolean>;
  const available = REPORTS.filter((r) => isSuper || perms[r.module]);

  const [tab, setTab] = useState<ReportKey | null>(null);
  const active = available.find((r) => r.key === tab) ?? available[0];
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [emp, setEmp] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("");

  // People and companies visible to this user (database rules limit both).
  const scope = useQuery({
    queryKey: ["report-scope", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [p, c, uc] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, employee_code, email, phone, designation, status, joining_date, employment_type, department:departments(name), manager:profiles!profiles_manager_id_fkey(full_name)")
          .order("full_name"),
        supabase.from("companies").select("id, name").order("name"),
        supabase.from("user_companies").select("user_id, company_id"),
      ]);
      return { people: p.data ?? [], companies: c.data ?? [], links: uc.data ?? [] };
    },
  });

  const people = scope.data?.people ?? [];
  const companyName = useMemo(() => new Map((scope.data?.companies ?? []).map((c) => [c.id, c.name])), [scope.data]);
  const companiesOf = (id: string) =>
    (scope.data?.links ?? []).filter((l) => l.user_id === id).map((l) => companyName.get(l.company_id) ?? "").filter(Boolean).join("; ");
  const allowedIds = useMemo(() => {
    let ids = people.map((p) => p.id);
    if (company) {
      const inCo = new Set((scope.data?.links ?? []).filter((l) => l.company_id === company).map((l) => l.user_id));
      ids = ids.filter((i) => inCo.has(i));
    }
    if (emp) ids = ids.filter((i) => i === emp);
    return ids;
  }, [people, company, emp, scope.data]);

  const key = active?.key;
  const data = useQuery({
    queryKey: ["report", key, from, to, status, allowedIds.join(",")],
    enabled: !!key && !!scope.data,
    queryFn: async (): Promise<Row[]> => {
      if (allowedIds.length === 0) return [];
      const ids = allowedIds;
      const nameOf = (id: string) => people.find((p) => p.id === id)?.full_name ?? "";
      const codeOf = (id: string) => people.find((p) => p.id === id)?.employee_code ?? "";
      switch (key) {
        case "employees":
          return people
            .filter((p) => ids.includes(p.id) && (!status || p.status === status))
            .map((p) => ({
              Code: p.employee_code ?? "", Name: p.full_name, Email: p.email, Phone: p.phone ?? "",
              Department: p.department?.name ?? "", Designation: p.designation ?? "",
              "Reports to": (Array.isArray(p.manager) ? p.manager[0]?.full_name : (p.manager as { full_name?: string } | null)?.full_name) ?? "", Companies: companiesOf(p.id),
              Type: p.employment_type, Joined: p.joining_date ?? "", Status: p.status,
            }));
        case "attendance": {
          let q = supabase.from("attendance").select("*").in("employee_id", ids)
            .gte("attendance_date", from).lte("attendance_date", to).order("attendance_date", { ascending: false });
          if (status) q = q.eq("status", status as "checked_in" | "checked_out");
          const { data, error } = await q;
          if (error) throw error;
          return (data ?? []).map((r) => ({
            Date: r.attendance_date, Code: codeOf(r.employee_id), Employee: nameOf(r.employee_id),
            In: r.check_in_time ? formatTime(r.check_in_time) : "", Out: r.check_out_time ? formatTime(r.check_out_time) : "",
            Hours: hoursBetween(r.check_in_time, r.check_out_time).toFixed(2),
            "Late (min)": r.late_minutes ?? 0, "Early (min)": r.early_departure_minutes ?? 0,
            "Overtime (min)": r.overtime_minutes ?? 0, Day: r.day_status ?? "", Status: r.status,
          }));
        }
        case "leave": {
          let q = supabase.from("leave_requests").select("*").in("employee_id", ids)
            .lte("start_date", to).gte("end_date", from).order("start_date", { ascending: false });
          if (status) q = q.eq("status", status as "PENDING");
          const { data, error } = await q;
          if (error) throw error;
          return (data ?? []).map((r) => ({
            Employee: nameOf(r.employee_id), Type: r.leave_type, From: r.start_date, To: r.end_date,
            Days: r.days ?? "", "Half day": r.half_day ? "Yes" : "No", Status: r.status, Reason: r.reason ?? "",
          }));
        }
        case "payroll": {
          let q = supabase.from("payroll_records").select("*").in("employee_id", ids)
            .gte("month", from.slice(0, 7) + "-01").lte("month", to).order("month", { ascending: false });
          if (status) q = q.eq("status", status);
          const { data, error } = await q;
          if (error) throw error;
          return (data ?? []).map((r) => ({
            Month: r.month.slice(0, 7), Code: codeOf(r.employee_id), Employee: nameOf(r.employee_id),
            Gross: Number(r.gross_salary).toFixed(2), Deductions: Number(r.total_deductions).toFixed(2),
            "Net payable": Number(r.net_salary).toFixed(2), Status: r.status,
          }));
        }
        case "tasks": {
          let q = supabase.from("tasks").select("*, project:projects(name)").in("assignee_id", ids).order("due_date", { ascending: true });
          q = q.or(`due_date.is.null,and(due_date.gte.${from},due_date.lte.${to})`);
          if (status) q = q.eq("status", status as "COMPLETED");
          const { data, error } = await q;
          if (error) throw error;
          return (data ?? []).map((r) => ({
            Title: r.title, Assignee: nameOf(r.assignee_id), Project: r.project?.name ?? "",
            Priority: r.priority, Status: r.status, "Progress %": r.progress, Due: r.due_date ?? "",
          }));
        }
        case "work": {
          let q = supabase.from("daily_work_logs").select("*, task:tasks(title)").in("employee_id", ids)
            .gte("log_date", from).lte("log_date", to).order("log_date", { ascending: false });
          if (status) q = q.eq("status", status);
          const { data, error } = await q;
          if (error) throw error;
          return (data ?? []).map((r) => ({
            Date: r.log_date, Employee: nameOf(r.employee_id), Summary: r.summary,
            Completed: r.work_completed ?? "", Hours: r.hours_worked ?? "", Task: r.task?.title ?? "", Status: r.status ?? "",
          }));
        }
      }
      return [];
    },
  });

  if (!isSuper && !reportsPerm.view) return <AccessDenied />;
  if (available.length === 0) return <AccessDenied />;

  const rows = data.data ?? [];
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const usesDates = active!.key !== "employees";

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Reports cover only the people and records you're allowed to see." />

      <div className="flex flex-wrap gap-2">
        {available.map((r) => (
          <Button key={r.key} size="sm" variant={r.key === active!.key ? "default" : "outline"}
            onClick={() => { setTab(r.key); setStatus(""); }}>
            {r.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {people.length > 1 && (
          <div className="flex flex-col gap-1"><Label>Employee</Label>
            <select className={sel} value={emp} onChange={(e) => setEmp(e.target.value)}>
              <option value="">All</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
        )}
        {(scope.data?.companies.length ?? 0) > 0 && people.length > 1 && (
          <div className="flex flex-col gap-1"><Label>Company</Label>
            <select className={sel} value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">All</option>
              {scope.data!.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {usesDates && (
          <>
            <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </>
        )}
        <div className="flex flex-col gap-1"><Label>Status</Label>
          <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {active!.statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>)}
          </select>
        </div>
        <Button variant="outline" disabled={rows.length === 0}
          onClick={() => downloadCSV(`${active!.key}_report_${usesDates ? `${from}_${to}` : todayISO()}.csv`, rows)}>
          Export CSV
        </Button>
      </div>

      {data.isLoading || scope.isLoading ? <Loading /> : data.error ? (
        <Empty>Couldn't load this report.</Empty>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Records" value={rows.length} />
            {active!.key === "attendance" && (
              <StatCard label="Hours worked" value={rows.reduce((s, r) => s + Number(r["Hours"]), 0).toFixed(1)} />
            )}
            {active!.key === "payroll" && (
              <StatCard label="Total net payable" value={rows.reduce((s, r) => s + Number(r["Net payable"]), 0).toFixed(2)} />
            )}
            {active!.key === "work" && (
              <StatCard label="Hours logged" value={rows.reduce((s, r) => s + Number(r["Hours"] || 0), 0).toFixed(1)} />
            )}
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            {rows.length === 0 ? <Empty>No records for these filters.</Empty> : (
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>{cols.map((c) => <th key={c} className="p-3 whitespace-nowrap">{c}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.slice(0, 200).map((r, i) => (
                    <tr key={i}>
                      {cols.map((c) => (
                        <td key={c} className="p-3 align-top">
                          {/^\d{4}-\d{2}-\d{2}$/.test(String(r[c])) ? formatDate(String(r[c])) : String(r[c] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {rows.length > 200 && <p className="text-xs text-muted-foreground">Showing first 200 rows — export CSV for all {rows.length}.</p>}
        </>
      )}
    </div>
  );
}
