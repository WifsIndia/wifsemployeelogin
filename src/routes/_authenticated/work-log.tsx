import { RequireModule } from "@/components/AppShell";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { daysAgoISO, pageHead } from "@/lib/meta";
import { formatDate, formatTime, todayISO } from "@/lib/format";
import { NativeSelect } from "@/components/settings/shared";
import { Empty, Loading, PageHeader } from "@/components/AppShell";
import { Panel } from "@/components/TeamOverview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/work-log")({
  head: () => pageHead("Daily Work Log", "Record what you worked on today and view previous logs."),
  component: () => <RequireModule module="work_logs"><WorkLogPage /></RequireModule>,
});

function WorkLogPage() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const today = todayISO();
  const canSeeTeam = hasRole("admin", "hr", "manager", "ado");
  const [tab, setTab] = useState<"mine" | "team" | "diary">("mine");
  const [emp, setEmp] = useState("");
  const [diaryEmp, setDiaryEmp] = useState("");
  const [from, setFrom] = useState(daysAgoISO(7));

  const mine = useQuery({
    queryKey: ["work-logs", "mine", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (
        await supabase
          .from("daily_work_logs")
          .select("*, task:tasks(title)")
          .eq("employee_id", user!.id)
          .order("log_date", { ascending: false })
          .limit(60)
      ).data ?? [],
  });

  const team = useQuery({
    queryKey: ["work-logs", "team", user?.id, from],
    enabled: !!user && canSeeTeam && tab === "team",
    queryFn: async () =>
      (
        await supabase
          .from("daily_work_logs")
          .select("*, task:tasks(title), employee:profiles!daily_work_logs_employee_id_fkey(full_name)")
          .neq("employee_id", user!.id)
          .gte("log_date", from)
          .order("employee_id")
          .order("log_date", { ascending: false })
          .limit(300)
      ).data ?? [],
  });

  // Team members the viewer can already see (database-scoped), for the employee filters.
  const teamPeople = useQuery({
    queryKey: ["work-logs", "people", user?.id],
    enabled: !!user && canSeeTeam && tab !== "mine",
    queryFn: async () =>
      (await supabase.from("profiles").select("id, full_name").neq("id", user!.id).is("deleted_at", null).order("full_name")).data ?? [],
  });
  const diaryId = diaryEmp || user?.id;
  const diary = useQuery({
    queryKey: ["work-logs", "diary", diaryId],
    enabled: !!diaryId && tab === "diary",
    queryFn: async () =>
      (
        await supabase
          .from("daily_work_logs")
          .select("*, task:tasks(title)")
          .eq("employee_id", diaryId!)
          .order("log_date", { ascending: true })
          .limit(1000)
      ).data ?? [],
  });

  const [logDate, setLogDate] = useState(today);
  const todayLog = mine.data?.find((l) => l.log_date === logDate);
  const myTasks = useQuery({
    queryKey: ["work-log-tasks", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (
        await supabase
          .from("tasks")
          .select("id, title, status")
          .eq("assignee_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(100)
      ).data ?? [],
  });
  const empty = { summary: "", work_completed: "", hours_worked: "", notes: "", task_id: "", status: "" };
  const [f, setF] = useState(empty);
  useEffect(() => {
    setF(
      todayLog
        ? {
            summary: todayLog.summary,
            work_completed: todayLog.work_completed ?? "",
            hours_worked: todayLog.hours_worked?.toString() ?? "",
            notes: todayLog.notes ?? "",
            task_id: todayLog.task_id ?? "",
            status: todayLog.status ?? "",
          }
        : empty,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayLog, logDate]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!f.summary.trim()) return toast.error("Please enter a summary.");
    if (logDate > today) return toast.error("You cannot log work for a future date.");
    const hours = f.hours_worked ? Number(f.hours_worked) : null;
    if (hours != null && (isNaN(hours) || hours < 0 || hours > 24)) return toast.error("Hours must be between 0 and 24.");
    setSaving(true);
    const payload = {
      summary: f.summary.trim(),
      work_completed: f.work_completed || null,
      hours_worked: hours,
      notes: f.notes || null,
      task_id: f.task_id || null,
      status: f.status || null,
    };
    const { error } = todayLog
      ? await supabase.from("daily_work_logs").update(payload).eq("id", todayLog.id)
      : await supabase.from("daily_work_logs").insert({ ...payload, employee_id: user!.id, log_date: logDate });
    setSaving(false);
    if (error) return toast.error("Could not save your work log.");
    toast.success("Work log saved");
    qc.invalidateQueries({ queryKey: ["work-logs"] });
    qc.invalidateQueries({ queryKey: ["my-dashboard"] });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Daily Work" description="Summarise your work each day. You can edit today's log until the day ends." />
      {(
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={tab === "mine" ? "default" : "outline"} onClick={() => setTab("mine")}>
            My logs
          </Button>
          {canSeeTeam && (
            <Button size="sm" variant={tab === "team" ? "default" : "outline"} onClick={() => setTab("team")}>
              {hasRole("admin", "hr") ? "All employees" : "My team"}
            </Button>
          )}
          <Button size="sm" variant={tab === "diary" ? "default" : "outline"} onClick={() => setTab("diary")}>
            Diary
          </Button>
        </div>
      )}

      {tab === "mine" ? (
        <>
          <Panel
            title={`Work log · ${formatDate(logDate)}`}
            action={<Input type="date" max={today} value={logDate} onChange={(e) => setLogDate(e.target.value || today)} className="w-auto" />}
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Summary *</Label>
                <Input value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} maxLength={300} />
              </div>
              <div className="space-y-1.5">
                <Label>Work description</Label>
                <Textarea value={f.work_completed} onChange={(e) => setF({ ...f, work_completed: e.target.value })} maxLength={4000} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Hours worked</Label>
                  <Input type="number" min={0} max={24} step={0.5} value={f.hours_worked} onChange={(e) => setF({ ...f, hours_worked: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Related task (optional)</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={f.task_id}
                    onChange={(e) => setF({ ...f, task_id: e.target.value })}
                  >
                    <option value="">No task</option>
                    {(myTasks.data ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={f.status}
                    onChange={(e) => setF({ ...f, status: e.target.value })}
                  >
                    <option value="">—</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="BLOCKED">Blocked</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes / comments</Label>
                <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} />
              </div>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />} {todayLog ? "Update log" : "Submit log"}
              </Button>
            </div>
          </Panel>
          <Panel title="Previous logs">
            {mine.isLoading ? <Loading /> : <LogList grouped logs={(mine.data ?? []).filter((l) => l.log_date !== logDate)} />}
          </Panel>
        </>
      ) : tab === "team" ? (
        <Panel
          title="Team work logs"
          action={
            <div className="flex flex-wrap gap-2">
              <NativeSelect aria-label="Filter by employee" value={emp} onChange={(e) => setEmp(e.target.value)} className="w-full sm:w-48">
                <option value="">All employees</option>
                {(teamPeople.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </NativeSelect>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
            </div>
          }
        >
          {team.isLoading ? <Loading /> : <LogList grouped logs={(team.data ?? []).filter((l) => !emp || l.employee_id === emp)} showName />}
        </Panel>
      ) : (
        <Panel
          title="Diary"
          action={
            canSeeTeam && (
              <NativeSelect aria-label="Employee" value={diaryEmp} onChange={(e) => setDiaryEmp(e.target.value)} className="w-full sm:w-56">
                <option value="">Me</option>
                {(teamPeople.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </NativeSelect>
            )
          }
        >
          <p className="mb-2 text-xs text-muted-foreground">Work entries in date order, oldest first.</p>
          {diary.isLoading ? <Loading /> : <LogList grouped logs={diary.data ?? []} />}
        </Panel>
      )}
    </div>
  );
}

interface Log {
  id: string;
  log_date: string;
  employee_id?: string;
  created_at?: string;
  updated_at?: string;
  summary: string;
  work_completed: string | null;
  hours_worked: number | null;
  notes: string | null;
  employee?: { full_name: string } | null;
  status?: string | null;
  task?: { title: string } | null;
}

function LogList({ logs, showName, grouped }: { logs: Log[]; showName?: boolean; grouped?: boolean }) {
  if (!logs.length) return <Empty>No work logs found.</Empty>;
  return (
    <ul className="divide-y divide-border">
      {logs.map((l, i) => (
        <li key={l.id} className="py-3 text-sm">
          {grouped && logs[i - 1]?.log_date !== l.log_date && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">{formatDate(l.log_date)}</p>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <p className="font-semibold">
              {showName && `${l.employee?.full_name ?? "—"} · `}
              {l.summary}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(l.log_date)}
              {l.hours_worked != null && ` · ${l.hours_worked}h`}
            </p>
          </div>
          {l.work_completed && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{l.work_completed}</p>}
          {(l.task || l.status) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {l.task && `Task: ${l.task.title}`}
              {l.task && l.status && " · "}
              {l.status && l.status.replace("_", " ").toLowerCase()}
            </p>
          )}
          {l.notes && <p className="mt-1 text-xs italic text-muted-foreground">{l.notes}</p>}
          {l.created_at && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Saved {formatDate(l.created_at)} {formatTime(l.created_at)}
              {l.updated_at && new Date(l.updated_at).getTime() - new Date(l.created_at).getTime() > 60000 && ` · updated ${formatDate(l.updated_at)} ${formatTime(l.updated_at)}`}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
