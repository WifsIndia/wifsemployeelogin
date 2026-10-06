import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { daysAgoISO, pageHead } from "@/lib/meta";
import { formatDate, todayISO } from "@/lib/format";
import { Empty, Loading, PageHeader } from "@/components/AppShell";
import { Panel } from "@/components/TeamOverview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/work-log")({
  head: () => pageHead("Daily Work Log", "Record what you worked on today and view previous logs."),
  component: WorkLogPage,
});

function WorkLogPage() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const today = todayISO();
  const canSeeTeam = hasRole("admin", "hr", "manager", "ado");
  const [tab, setTab] = useState<"mine" | "team">("mine");
  const [from, setFrom] = useState(daysAgoISO(7));

  const mine = useQuery({
    queryKey: ["work-logs", "mine", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (
        await supabase
          .from("daily_work_logs")
          .select("*")
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
          .select("*, employee:profiles!daily_work_logs_employee_id_fkey(full_name)")
          .neq("employee_id", user!.id)
          .gte("log_date", from)
          .order("log_date", { ascending: false })
          .limit(300)
      ).data ?? [],
  });

  const todayLog = mine.data?.find((l) => l.log_date === today);
  const [f, setF] = useState({ summary: "", work_completed: "", hours_worked: "", notes: "" });
  useEffect(() => {
    if (todayLog)
      setF({
        summary: todayLog.summary,
        work_completed: todayLog.work_completed ?? "",
        hours_worked: todayLog.hours_worked?.toString() ?? "",
        notes: todayLog.notes ?? "",
      });
  }, [todayLog]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!f.summary.trim()) return toast.error("Please enter a summary.");
    const hours = f.hours_worked ? Number(f.hours_worked) : null;
    if (hours != null && (isNaN(hours) || hours < 0 || hours > 24)) return toast.error("Hours must be between 0 and 24.");
    setSaving(true);
    const payload = {
      summary: f.summary.trim(),
      work_completed: f.work_completed || null,
      hours_worked: hours,
      notes: f.notes || null,
    };
    const { error } = todayLog
      ? await supabase.from("daily_work_logs").update(payload).eq("id", todayLog.id)
      : await supabase.from("daily_work_logs").insert({ ...payload, employee_id: user!.id, log_date: today });
    setSaving(false);
    if (error) return toast.error("Could not save your work log.");
    toast.success("Work log saved");
    qc.invalidateQueries({ queryKey: ["work-logs"] });
    qc.invalidateQueries({ queryKey: ["my-dashboard"] });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Daily Work" description="Summarise your work each day. You can edit today's log until the day ends." />
      {canSeeTeam && (
        <div className="flex gap-2">
          <Button size="sm" variant={tab === "mine" ? "default" : "outline"} onClick={() => setTab("mine")}>
            My logs
          </Button>
          <Button size="sm" variant={tab === "team" ? "default" : "outline"} onClick={() => setTab("team")}>
            {hasRole("admin", "hr") ? "All employees" : "My team"}
          </Button>
        </div>
      )}

      {tab === "mine" ? (
        <>
          <Panel title={`Today's log · ${formatDate(today)}`}>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Summary *</Label>
                <Input value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} maxLength={300} />
              </div>
              <div className="space-y-1.5">
                <Label>Work completed</Label>
                <Textarea value={f.work_completed} onChange={(e) => setF({ ...f, work_completed: e.target.value })} maxLength={4000} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Hours worked</Label>
                  <Input type="number" min={0} max={24} step={0.5} value={f.hours_worked} onChange={(e) => setF({ ...f, hours_worked: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Notes</Label>
                  <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} />
                </div>
              </div>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />} {todayLog ? "Update log" : "Submit log"}
              </Button>
            </div>
          </Panel>
          <Panel title="Previous logs">
            {mine.isLoading ? <Loading /> : <LogList logs={(mine.data ?? []).filter((l) => l.log_date !== today)} />}
          </Panel>
        </>
      ) : (
        <Panel title="Team work logs" action={<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />}>
          {team.isLoading ? <Loading /> : <LogList logs={team.data ?? []} showName />}
        </Panel>
      )}
    </div>
  );
}

interface Log {
  id: string;
  log_date: string;
  summary: string;
  work_completed: string | null;
  hours_worked: number | null;
  notes: string | null;
  employee?: { full_name: string } | null;
}

function LogList({ logs, showName }: { logs: Log[]; showName?: boolean }) {
  if (!logs.length) return <Empty>No work logs found.</Empty>;
  return (
    <ul className="divide-y divide-border">
      {logs.map((l) => (
        <li key={l.id} className="py-3 text-sm">
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
          {l.notes && <p className="mt-1 text-xs italic text-muted-foreground">{l.notes}</p>}
        </li>
      ))}
    </ul>
  );
}
