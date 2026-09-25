import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { pageHead } from "@/lib/meta";
import { formatTime, todayISO } from "@/lib/format";
import { useScopedPeople } from "@/components/TeamOverview";
import { Empty, Loading, PageHeader, RequireRole, StatusPill } from "@/components/AppShell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => pageHead("My Team", "Your team members, today's attendance and open tasks."),
  component: () => (
    <RequireRole roles={["manager", "admin", "hr"]}>
      <TeamPage />
    </RequireRole>
  ),
});

function TeamPage() {
  const { hasRole } = useAuth();
  const scope = hasRole("admin", "hr") ? "all" : "team";
  const people = useScopedPeople(scope);
  const ids = (people.data ?? []).map((p) => p.id);
  const today = todayISO();

  const extra = useQuery({
    queryKey: ["team-extra", today, ids.join(",")],
    enabled: people.isSuccess && ids.length > 0,
    queryFn: async () => {
      const [att, tasks] = await Promise.all([
        supabase.from("attendance").select("employee_id, status, check_in_time, check_out_time").eq("attendance_date", today).in("employee_id", ids),
        supabase.from("tasks").select("assignee_id, status").in("assignee_id", ids).neq("status", "COMPLETED"),
      ]);
      return { att: att.data ?? [], tasks: tasks.data ?? [] };
    },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Team" description="People who report to you and their status today." />
      <div className="rounded-xl border border-border bg-card p-2">
        {people.isLoading ? (
          <Loading />
        ) : ids.length === 0 ? (
          <Empty>No team members are assigned to you yet. HR or Admin can assign employees to you.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Today</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Open tasks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.data!.map((p) => {
                  const a = extra.data?.att.find((x) => x.employee_id === p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.full_name}</TableCell>
                      <TableCell>{p.designation ?? "—"}</TableCell>
                      <TableCell>
                        <StatusPill status={a ? a.status : "absent"} />
                      </TableCell>
                      <TableCell>{formatTime(a?.check_in_time)}</TableCell>
                      <TableCell>{formatTime(a?.check_out_time)}</TableCell>
                      <TableCell>{extra.data?.tasks.filter((t) => t.assignee_id === p.id).length ?? 0}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
