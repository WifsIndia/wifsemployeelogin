import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { pageHead } from "@/lib/meta";
import { formatDate, formatTime } from "@/lib/format";
import { Empty, Loading, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => pageHead("Notifications", "Your task, leave and announcement notifications."),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("notifications").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(100)).data ?? [],
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["unread-notifications"] });
  };
  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    refresh();
  };
  const markAll = async () => {
    await supabase.from("notifications").update({ read: true }).eq("user_id", user!.id).eq("read", false);
    refresh();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        action={<Button variant="outline" size="sm" onClick={markAll}>Mark all as read</Button>}
      />
      {q.isLoading ? (
        <Loading />
      ) : !q.data?.length ? (
        <Empty>You're all caught up.</Empty>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {q.data.map((n) => (
            <div key={n.id} className={cn("flex items-start gap-3 p-4", !n.read && "bg-accent/10")}>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", !n.read && "font-semibold")}>{n.title}</p>
                {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(n.created_at)} · {formatTime(n.created_at)}
                  {n.link && (
                    <>
                      {" · "}
                      <Link to={n.link as "/dashboard"} className="text-primary hover:underline" onClick={() => markRead(n.id)}>
                        Open
                      </Link>
                    </>
                  )}
                </p>
              </div>
              {!n.read && (
                <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>Mark read</Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
