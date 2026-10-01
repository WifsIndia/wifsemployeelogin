import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { pageHead } from "@/lib/meta";
import { formatDate } from "@/lib/format";
import { Empty, Loading, PageHeader } from "@/components/AppShell";
import { Panel } from "@/components/TeamOverview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/announcements")({
  head: () => pageHead("Announcements", "Company announcements for WiFS employees."),
  component: Page,
});

function Page() {
  const { user, hasRole } = useAuth();
  const canPost = hasRole("admin", "hr");
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const q = useQuery({
    queryKey: ["announcements"],
    queryFn: async () =>
      (await supabase.from("announcements").select("*").order("published_at", { ascending: false }).limit(100)).data ?? [],
  });

  const post = async () => {
    if (!title.trim() || !message.trim()) return toast.error("Title and message are required.");
    const { error } = await supabase.from("announcements").insert({ title: title.trim(), message: message.trim(), created_by: user!.id });
    if (error) return toast.error("Could not publish announcement.");
    toast.success("Announcement published");
    setTitle("");
    setMessage("");
    qc.invalidateQueries({ queryKey: ["announcements"] });
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from("announcements").update({ active }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["announcements"] });
  };

  const items = (q.data ?? []).filter((a) => canPost || a.active);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Announcements" description="Latest news from WiFS INDIA." />
      {canPost && (
        <Panel title="New announcement">
          <div className="space-y-3">
            <Input placeholder="Title" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />
            <Textarea placeholder="Message" value={message} maxLength={2000} rows={4} onChange={(e) => setMessage(e.target.value)} />
            <Button onClick={post}>Publish</Button>
          </div>
        </Panel>
      )}
      {q.isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty>No announcements yet.</Empty>
      ) : (
        items.map((a) => (
          <div key={a.id} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold">{a.title}</h3>
                <p className="text-xs text-muted-foreground">{formatDate(a.published_at)}{!a.active && " · hidden"}</p>
              </div>
              {canPost && (
                <Button size="sm" variant="outline" onClick={() => toggle(a.id, !a.active)}>
                  {a.active ? "Hide" : "Show"}
                </Button>
              )}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm">{a.message}</p>
          </div>
        ))
      )}
    </div>
  );
}
