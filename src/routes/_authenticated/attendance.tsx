import { RequireModule } from "@/components/AppShell";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { daysAgoISO, monthStartISO, pageHead, weekStartISO } from "@/lib/meta";
import { downloadCSV, duration, formatDate, formatTime, todayISO } from "@/lib/format";
import { AttendanceCard } from "@/components/AttendanceCard";
import { Empty, Loading, PageHeader, StatusPill } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => pageHead("Attendance", "Check in, check out and view attendance history."),
  component: () => <RequireModule module="attendance"><AttendancePage /></RequireModule>,
});

type Range = "week" | "month" | "custom";

function AttendancePage() {
  const { user, hasRole } = useAuth();
  const canSeeOthers = hasRole("admin", "hr", "manager", "ado");
  const [range, setRange] = useState<Range>("week");
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [who, setWho] = useState<"me" | "team">("me");

  const start = range === "week" ? weekStartISO() : range === "month" ? monthStartISO() : from;
  const end = range === "custom" ? to : todayISO();

  const { data, isLoading } = useQuery({
    queryKey: ["attendance", "history", user?.id, who, start, end],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("attendance")
        .select("*, employee:profiles!attendance_employee_id_fkey(full_name, employee_code)")
        .gte("attendance_date", start)
        .lte("attendance_date", end)
        .order("attendance_date", { ascending: false })
        .order("employee_id")
        .order("check_in_time", { ascending: true })
        .limit(1000);
      if (who === "me") q = q.eq("employee_id", user!.id);
      else q = q.neq("employee_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const exportCsv = () =>
    downloadCSV(
      `attendance_${start}_${end}.csv`,
      (data ?? []).map((r) => ({
        Employee: r.employee?.full_name ?? "",
        Code: r.employee?.employee_code ?? "",
        Date: r.attendance_date,
        CheckIn: formatTime(r.check_in_time),
        CheckOut: formatTime(r.check_out_time),
        Duration: duration(r.check_in_time, r.check_out_time),
        Status: r.status,
        Note: r.auto_checked_out ? "Auto checked out — no logout recorded" : "",
      })),
    );

  // Completed minutes per employee per day, across all sessions.
  const dayTotal = new Map<string, number>();
  for (const r of data ?? []) {
    const k = `${r.employee_id}|${r.attendance_date}`;
    dayTotal.set(k, (dayTotal.get(k) ?? 0) + (r.worked_minutes ?? 0));
  }
  const fmtMin = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Attendance" description="Check in when you arrive at the office and check out when you leave." />
      <div className="max-w-2xl">
        <AttendanceCard />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-display text-lg font-semibold">Attendance history</h2>
          {canSeeOthers && (
            <div className="flex rounded-md border border-border p-0.5">
              {(["me", "team"] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setWho(w)}
                  className={`rounded px-3 py-1 text-sm ${who === w ? "bg-primary text-primary-foreground" : ""}`}
                >
                  {w === "me" ? "Mine" : hasRole("admin", "hr") ? "All employees" : "My team"}
                </button>
              ))}
            </div>
          )}
          <div className="flex rounded-md border border-border p-0.5">
            {(["week", "month", "custom"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded px-3 py-1 text-sm ${range === r ? "bg-primary text-primary-foreground" : ""}`}
              >
                {r === "week" ? "This week" : r === "month" ? "This month" : "Custom"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data?.length}>
            Export CSV
          </Button>
        </div>
        {range === "custom" && (
          <div className="mb-4 flex flex-wrap gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
          </div>
        )}
        {isLoading ? (
          <Loading />
        ) : !data?.length ? (
          <Empty>No attendance records for this period.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {who === "team" && <TableHead>Employee</TableHead>}
                  <TableHead>Date</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Day total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r, i) => {
                  const prev = data[i - 1];
                  const newDate = !prev || prev.attendance_date !== r.attendance_date;
                  const firstOfGroup = newDate || prev.employee_id !== r.employee_id;
                  return [
                    newDate && (
                      <TableRow key={`d-${r.attendance_date}`} className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={who === "team" ? 7 : 6} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {formatDate(r.attendance_date)}
                        </TableCell>
                      </TableRow>
                    ),
                    <TableRow key={r.id}>
                      {who === "team" && <TableCell className="font-medium">{firstOfGroup ? r.employee?.full_name : ""}</TableCell>}
                      <TableCell>{firstOfGroup ? formatDate(r.attendance_date) : ""}</TableCell>
                      <TableCell>{formatTime(r.check_in_time)}</TableCell>
                      <TableCell>
                        {formatTime(r.check_out_time)}
                        {r.auto_checked_out && <p className="text-xs italic text-muted-foreground">Auto checked out — no logout recorded</p>}
                      </TableCell>
                      <TableCell>{duration(r.check_in_time, r.check_out_time)}</TableCell>
                      <TableCell className="font-medium">{firstOfGroup ? fmtMin(dayTotal.get(`${r.employee_id}|${r.attendance_date}`) ?? 0) : ""}</TableCell>
                      <TableCell>
                        <StatusPill status={r.status} />
                      </TableCell>
                    </TableRow>,
                  ];
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
