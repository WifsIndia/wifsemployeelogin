import { RequireModule } from "@/components/AppShell";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { pageHead } from "@/lib/meta";
import { formatDate, todayISO } from "@/lib/format";
import { Empty, Loading, PageHeader, StatusPill } from "@/components/AppShell";
import { Panel } from "@/components/TeamOverview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/leave")({
  head: () => pageHead("Leave", "Apply for leave and track or review leave requests."),
  component: () => <RequireModule module="leave"><LeavePage /></RequireModule>,
});

type LeaveType = Database["public"]["Enums"]["leave_type"];
const TYPES: LeaveType[] = ["CASUAL", "SICK", "EARNED", "EMERGENCY", "UNPAID", "OTHER"];
function leaveError(msg: string) {
  if (msg.includes("LEAVE_OVERLAP")) return "You already have a pending or approved leave covering some of these dates. Cancel it first or choose different dates.";
  if (msg.includes("INSUFFICIENT_BALANCE")) return "Not enough leave balance for this request.";
  if (msg.includes("NOTICE_REQUIRED")) return `This leave type needs ${msg.split("NOTICE_REQUIRED:")[1]?.split(/\D/)[0] ?? "more"} day(s) advance notice.`;
  if (msg.includes("HALF_DAY_NOT_ALLOWED")) return "Half-day is not allowed for this leave type, or start and end dates differ.";
  if (msg.includes("LEAVE_TYPE_DISABLED")) return "This leave type is currently disabled.";
  if (msg.includes("NO_WORKING_DAYS")) return "The selected dates contain no working days.";
  if (msg.includes("INVALID_DATES")) return "End date cannot be before start date.";
  return "Could not submit leave request.";
}

function LeavePage() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const canReview = hasRole("admin", "hr", "manager", "ado");
  const [tab, setTab] = useState<"mine" | "review">("mine");
  const [f, setF] = useState({ leave_type: "CASUAL" as LeaveType, start_date: todayISO(), end_date: todayISO(), reason: "", half_day: false });
  const [saving, setSaving] = useState(false);

  const mine = useQuery({
    queryKey: ["leave", "mine", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("leave_requests").select("*").eq("employee_id", user!.id).order("created_at", { ascending: false })).data ?? [],
  });

  const review = useQuery({
    queryKey: ["leave", "review", user?.id],
    enabled: !!user && canReview && tab === "review",
    queryFn: async () =>
      (
        await supabase
          .from("leave_requests")
          .select("*, employee:profiles!leave_requests_employee_id_fkey(full_name)")
          .neq("employee_id", user!.id)
          .order("status")
          .order("start_date", { ascending: false })
          .limit(200)
      ).data ?? [],
  });

  const submit = async () => {
    if (f.end_date < f.start_date) return toast.error("End date cannot be before start date.");
    setSaving(true);
    const { error } = await supabase.from("leave_requests").insert({ ...f, reason: f.reason || null, employee_id: user!.id });
    setSaving(false);
    if (error) return toast.error(leaveError(error.message));
    toast.success("Leave request submitted");
    setF({ ...f, reason: "" });
    qc.invalidateQueries({ queryKey: ["leave"] });
  };

  const cancel = async (id: string) => {
    const { error } = await supabase.from("leave_requests").update({ status: "CANCELLED" }).eq("id", id);
    if (error) return toast.error("Could not cancel request.");
    toast.success("Request cancelled");
    qc.invalidateQueries({ queryKey: ["leave"] });
  };

  const decide = async (id: string, status: "APPROVED" | "REJECTED", note: string) => {
    const { error } = await supabase
      .from("leave_requests")
      .update({ status, review_note: note || null, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error("You are not allowed to review this request.");
    toast.success(`Request ${status.toLowerCase()}`);
    qc.invalidateQueries({ queryKey: ["leave"] });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Leave" description="Apply for leave and see the status of your requests." />
      {canReview && (
        <div className="flex gap-2">
          <Button size="sm" variant={tab === "mine" ? "default" : "outline"} onClick={() => setTab("mine")}>
            My leave
          </Button>
          <Button size="sm" variant={tab === "review" ? "default" : "outline"} onClick={() => setTab("review")}>
            Review requests
          </Button>
        </div>
      )}
      {tab === "mine" ? (
        <>
          <Balances userId={user!.id} />
          <Panel title="Apply for leave">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Leave type</Label>
                <Select value={f.leave_type} onValueChange={(v) => setF({ ...f, leave_type: v as LeaveType })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.charAt(0) + t.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Start date</Label>
                <Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>End date</Label>
                <Input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-3">
                <input type="checkbox" checked={f.half_day} onChange={(e) => setF({ ...f, half_day: e.target.checked, end_date: e.target.checked ? f.start_date : f.end_date })} />
                Half-day (start and end date must be the same)
              </label>
              <div className="space-y-1.5 sm:col-span-3">
                <Label>Reason</Label>
                <Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={1000} />
              </div>
            </div>
            <Button className="mt-3" onClick={submit} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Submit request
            </Button>
          </Panel>
          <Panel title="My requests">
            {mine.isLoading ? (
              <Loading />
            ) : !mine.data?.length ? (
              <Empty>No leave requests yet.</Empty>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {mine.data.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-medium">
                        {l.leave_type.charAt(0) + l.leave_type.slice(1).toLowerCase()} · {formatDate(l.start_date)} – {formatDate(l.end_date)}
                      </p>
                      {l.reason && <p className="text-muted-foreground">{l.reason}</p>}
                      {l.review_note && <p className="text-xs italic text-muted-foreground">Note: {l.review_note}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill status={l.status} />
                      {l.status === "PENDING" && (
                        <Button size="sm" variant="ghost" onClick={() => cancel(l.id)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : (
        <Panel title="Requests from your team">
          {review.isLoading ? (
            <Loading />
          ) : !review.data?.length ? (
            <Empty>No leave requests to review.</Empty>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {review.data.map((l) => (
                <ReviewRow
                  key={l.id}
                  name={(l.employee as { full_name: string } | null)?.full_name ?? "—"}
                  l={l}
                  onDecide={(s, n) => decide(l.id, s, n)}
                />
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}

function ReviewRow({
  name,
  l,
  onDecide,
}: {
  name: string;
  l: { leave_type: string; start_date: string; end_date: string; reason: string | null; status: string; review_note: string | null };
  onDecide: (s: "APPROVED" | "REJECTED", note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <b>{name}</b> · {l.leave_type.toLowerCase()} · {formatDate(l.start_date)} – {formatDate(l.end_date)}
        </p>
        <StatusPill status={l.status} />
      </div>
      {l.reason && <p className="text-muted-foreground">{l.reason}</p>}
      {l.status === "PENDING" ? (
        <div className="flex flex-wrap gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="max-w-xs" maxLength={500} />
          <Button size="sm" onClick={() => onDecide("APPROVED", note)}>
            Approve
          </Button>
          <Button size="sm" variant="destructive" onClick={() => onDecide("REJECTED", note)}>
            Reject
          </Button>
        </div>
      ) : (
        l.review_note && <p className="text-xs italic text-muted-foreground">Note: {l.review_note}</p>
      )}
    </li>
  );
}

function Balances({ userId }: { userId: string }) {
  const q = useQuery({
    queryKey: ["leave-balances", userId],
    queryFn: async () => (await supabase.rpc("leave_balances", { _employee: userId })).data ?? [],
  });
  const policy = useQuery({
    queryKey: ["my-leave-policy", userId],
    queryFn: async () => {
      const { data: p } = await supabase.from("profiles").select("leave_policy_id").eq("id", userId).maybeSingle();
      if (!p?.leave_policy_id) return null;
      return (await supabase.from("leave_policy_sets").select("name, working_days").eq("id", p.leave_policy_id).maybeSingle()).data;
    },
  });
  if (!q.data?.length) return null;
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <Panel title="My leave balance">
      {policy.data && (
        <p className="mb-3 text-sm text-muted-foreground">
          Leave policy: <b className="text-foreground">{policy.data.name}</b> · Working days:{" "}
          {(policy.data.working_days ?? []).map((d: number) => DAYS[d % 7]).join(", ") || "—"}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
