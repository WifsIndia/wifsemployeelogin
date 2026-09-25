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
  component: LeavePage,
});

type LeaveType = Database["public"]["Enums"]["leave_type"];
const TYPES: LeaveType[] = ["CASUAL", "SICK", "EARNED", "UNPAID", "OTHER"];

function LeavePage() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const canReview = hasRole("admin", "hr", "manager");
  const [tab, setTab] = useState<"mine" | "review">("mine");
  const [f, setF] = useState({ leave_type: "CASUAL" as LeaveType, start_date: todayISO(), end_date: todayISO(), reason: "" });
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
    if (error) return toast.error("Could not submit leave request.");
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
