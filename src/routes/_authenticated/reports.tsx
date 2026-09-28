import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pageHead, monthStartISO, hoursBetween } from "@/lib/meta";
import { downloadCSV, formatDate, formatTime, todayISO } from "@/lib/format";
import { Empty, Loading, PageHeader, RequireRole, StatCard } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => pageHead("Reports", "Attendance, leave and work log reports with CSV export."),
  component: () => (
    <RequireRole roles={["admin", "hr"]}>
      <Page />
    </RequireRole>
  ),
});

function Page() {
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());

  const q = useQuery({
    queryKey: ["reports", from, to],
    queryFn: async () => {
      const [a, l, w] = await Promise.all([
        supabase.from("attendance").select("*, employee:profiles!attendance_employee_id_fkey(full_name, employee_code)")
          .gte("attendance_date", from).lte("attendance_date", to).order("attendance_date", { ascending: false }),
        supabase.from("leave_requests").select("*, employee:profiles!leave_requests_employee_id_fkey(full_name)")
          .lte("start_date", to).gte("end_date", from).order("start_date", { ascending: false }),
        supabase.from("daily_work_logs").select("*, employee:profiles!daily_work_logs_employee_id_fkey(full_name)")
          .gte("log_date", from).lte("log_date", to).order("log_date", { ascending: false }),
      ]);
      return { att: a.data ?? [], leave: l.data ?? [], work: w.data ?? [] };
    },
  });

  const d = q.data;
  const totalHours = (d?.att ?? []).reduce((s, r) => s + hoursBetween(r.check_in_time, r.check_out_time), 0);

  const exportAtt = () =>
    downloadCSV(`attendance_${from}_${to}.csv`, (d?.att ?? []).map((r) => ({
      date: r.attendance_date, employee: r.employee?.full_name ?? "", code: r.employee?.employee_code ?? "",
      check_in: r.check_in_time ? formatTime(r.check_in_time) : "", check_out: r.check_out_time ? formatTime(r.check_out_time) : "",
      hours: hoursBetween(r.check_in_time, r.check_out_time).toFixed(2), status: r.status,
    })));
  const exportLeave = () =>
    downloadCSV(`leave_${from}_${to}.csv`, (d?.leave ?? []).map((r) => ({
      employee: r.employee?.full_name ?? "", type: r.leave_type, from: r.start_date, to: r.end_date, status: r.status, reason: r.reason ?? "",
    })));
  const exportWork = () =>
    downloadCSV(`work_logs_${from}_${to}.csv`, (d?.work ?? []).map((r) => ({
      date: r.log_date, employee: r.employee?.full_name ?? "", summary: r.summary, completed: r.work_completed ?? "", hours: r.hours_worked ?? "",
    })));

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Choose a date range and export data as CSV." />
      <div className="flex flex-wrap items-end gap-3">
        <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      {q.isLoading ? <Loading /> : !d ? <Empty>No data.</Empty> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Attendance records" value={d.att.length} />
            <StatCard label="Hours worked" value={totalHours.toFixed(1)} />
            <StatCard label="Leave requests" value={d.leave.length} hint={`${d.leave.filter((x) => x.status === "APPROVED").length} approved`} />
            <StatCard label="Work logs" value={d.work.length} />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={exportAtt}>Export attendance</Button>
            <Button variant="outline" onClick={exportLeave}>Export leave</Button>
            <Button variant="outline" onClick={exportWork}>Export work logs</Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr><th className="p-3">Date</th><th className="p-3">Employee</th><th className="p-3">In</th><th className="p-3">Out</th><th className="p-3">Hours</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.att.slice(0, 100).map((r) => (
                  <tr key={r.id}>
                    <td className="p-3">{formatDate(r.attendance_date)}</td>
                    <td className="p-3">{r.employee?.full_name}</td>
                    <td className="p-3">{r.check_in_time ? formatTime(r.check_in_time) : "—"}</td>
                    <td className="p-3">{r.check_out_time ? formatTime(r.check_out_time) : "—"}</td>
                    <td className="p-3">{hoursBetween(r.check_in_time, r.check_out_time).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.att.length === 0 && <Empty>No attendance in this range.</Empty>}
          </div>
        </>
      )}
    </div>
  );
}
