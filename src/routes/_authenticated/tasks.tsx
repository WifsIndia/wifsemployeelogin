import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/permissions";
import { pageHead } from "@/lib/meta";
import { formatDate } from "@/lib/format";
import { Empty, Loading, PageHeader, StatusPill } from "@/components/AppShell";
import { useScopedPeople } from "@/components/TeamOverview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => pageHead("Tasks", "View, update and assign tasks."),
  component: TasksPage,
});

type TaskStatus = Database["public"]["Enums"]["task_status"];
type TaskPriority = Database["public"]["Enums"]["task_priority"];
const STATUSES: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"];
const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const label = (s: string) =>
  s === "NOT_STARTED" ? "Pending" : s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  assignee_id: string;
  created_by: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  assignee: { full_name: string } | null;
  project: { name: string } | null;
}

function TasksPage() {
  const { user, hasRole } = useAuth();
  const perm = usePermission("tasks");
  const canManage = hasRole("admin", "manager", "ado") && perm.create;
  const [filter, setFilter] = useState<"ALL" | TaskStatus>("ALL");
  const [mineOnly, setMineOnly] = useState(!canManage);
  const [editing, setEditing] = useState<TaskRow | "new" | null>(null);
  const [viewing, setViewing] = useState<TaskRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", user?.id, mineOnly],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select("*, assignee:profiles!tasks_assignee_id_fkey(full_name), project:projects(name)")
        .order("created_at", { ascending: false });
      if (mineOnly) q = q.eq("assignee_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TaskRow[];
    },
  });

  const rows = (data ?? []).filter((t) => filter === "ALL" || t.status === filter);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={canManage ? "Tasks" : "My Tasks"}
        description={canManage ? "Create, assign and monitor tasks." : "Tasks assigned to you."}
        action={
          canManage && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> New task
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(["ALL", ...STATUSES] as const).map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>
            {s === "ALL" ? "All" : label(s)}
          </Button>
        ))}
        {canManage && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setMineOnly((v) => !v)}>
            {mineOnly ? "Show all tasks I can see" : "Show only mine"}
          </Button>
        )}
      </div>
      {isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <Empty>No tasks found.</Empty>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((t) => (
            <button
              key={t.id}
              onClick={() => setViewing(t)}
              className="min-w-0 rounded-xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-md"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <p className="min-w-0 break-words font-semibold">{t.title}</p>
                <StatusPill status={t.priority} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.assignee?.full_name ?? "—"}
                {t.project?.name ? ` · ${t.project.name}` : ""}
                {t.due_date ? ` · due ${formatDate(t.due_date)}` : ""}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <Progress value={t.progress} className="h-2 min-w-0 flex-1" />
                <span className="text-xs font-semibold">{t.progress}%</span>
                <StatusPill status={t.status} />
              </div>
            </button>
          ))}
        </div>
      )}
      {editing && <TaskForm task={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {viewing && (
        <TaskDetail
          task={viewing}
          onClose={() => setViewing(null)}
          onEdit={
            canManage && (hasRole("admin") || viewing.assignee_id !== user?.id || viewing.created_by === user?.id)
              ? () => {
                  setEditing(viewing);
                  setViewing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function TaskForm({ task, onClose }: { task: TaskRow | null; onClose: () => void }) {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const people = useScopedPeople(hasRole("admin") ? "all" : "team");
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await supabase.from("projects").select("id, name").eq("active", true).order("name")).data ?? [],
  });
  const [f, setF] = useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    project_id: task?.project_id ?? "",
    assignee_id: task?.assignee_id ?? "",
    priority: task?.priority ?? ("MEDIUM" as TaskPriority),
    status: task?.status ?? ("NOT_STARTED" as TaskStatus),
    start_date: task?.start_date ?? "",
    due_date: task?.due_date ?? "",
  });
  const [newProject, setNewProject] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!f.title.trim() || !f.assignee_id) return toast.error("Title and assignee are required.");
    setSaving(true);
    let projectId = f.project_id || null;
    if (newProject.trim()) {
      const { data, error } = await supabase
        .from("projects")
        .insert({ name: newProject.trim(), created_by: user!.id })
        .select("id")
        .single();
      if (error) {
        setSaving(false);
        return toast.error("Could not create project.");
      }
      projectId = data.id;
    }
    const payload = {
      title: f.title.trim(),
      description: f.description || null,
      project_id: projectId,
      assignee_id: f.assignee_id,
      priority: f.priority,
      status: f.status,
      start_date: f.start_date || null,
      due_date: f.due_date || null,
    };
    const { error } = task
      ? await supabase.from("tasks").update(payload).eq("id", task.id)
      : await supabase.from("tasks").insert({ ...payload, created_by: user!.id });
    setSaving(false);
    if (error) return toast.error("You are not allowed to assign this task, or the details are invalid.");
    toast.success(task ? "Task updated" : "Task created and assigned");
    qc.invalidateQueries({ queryKey: ["tasks"] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Title">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} />
          </Field>
          <Field label="Description">
            <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={4000} />
          </Field>
          <Field label="Assign to">
            <Select value={f.assignee_id} onValueChange={(v) => setF({ ...f, assignee_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder={people.data?.length ? "Select employee" : "No team members available"} />
              </SelectTrigger>
              <SelectContent>
                {(people.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Project">
              <Select value={f.project_id || "none"} onValueChange={(v) => setF({ ...f, project_id: v === "none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {(projects.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Or new project">
              <Input value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="Project name" />
            </Field>
            <Field label="Priority">
              <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v as TaskPriority })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {label(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v as TaskStatus })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {label(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Start date">
              <Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
            </Field>
            <Field label="Due date">
              <Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskDetail({ task, onClose, onEdit }: { task: TaskRow; onClose: () => void; onEdit?: () => void }) {
  const { user, hasRole } = useAuth();
  const perm = usePermission("tasks");
  const qc = useQueryClient();
  const [progress, setProgress] = useState(task.progress);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const comments = useQuery({
    queryKey: ["task-comments", task.id],
    queryFn: async () =>
      (
        await supabase
          .from("task_comments")
          .select("id, comment, created_at, author:profiles!task_comments_author_id_fkey(full_name)")
          .eq("task_id", task.id)
          .order("created_at")
      ).data ?? [],
  });

  const saveProgress = async () => {
    setSaving(true);
    const finalProgress = status === "COMPLETED" ? 100 : progress;
    const { error } = await supabase.from("tasks").update({ progress: finalProgress, status }).eq("id", task.id);
    setSaving(false);
    if (error) return toast.error("You cannot update this task.");
    toast.success("Progress updated");
    qc.invalidateQueries({ queryKey: ["tasks"] });
    onClose();
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    const { error } = await supabase.from("task_comments").insert({ task_id: task.id, author_id: user!.id, comment: comment.trim() });
    if (error) return toast.error("Could not add comment.");
    setComment("");
    comments.refetch();
  };

  const history = useQuery({
    queryKey: ["task-history", task.id],
    queryFn: async () =>
      (
        await supabase
          .from("task_history")
          .select("id, change, created_at, actor:profiles!task_history_actor_id_fkey(full_name)")
          .eq("task_id", task.id)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const canDelete = perm.delete && hasRole("admin", "manager") && task.assignee_id !== user?.id;
  const remove = async () => {
    if (!window.confirm(`Delete task "${task.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) return toast.error("You are not allowed to delete this task.");
    toast.success("Task deleted");
    qc.invalidateQueries({ queryKey: ["tasks"] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {task.description && <p className="whitespace-pre-wrap text-muted-foreground">{task.description}</p>}
          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <p>Assigned to: <b>{task.assignee?.full_name ?? "—"}</b></p>
            <p>Project: <b>{task.project?.name ?? "—"}</b></p>
            <p>Start: <b>{formatDate(task.start_date)}</b></p>
            <p>Due: <b>{formatDate(task.due_date)}</b></p>
            <p>Priority: <b>{label(task.priority)}</b></p>
          </div>
          <div className="space-y-2 rounded-lg bg-muted/50 p-3">
            <Label>Progress: {status === "COMPLETED" ? 100 : progress}%</Label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={status === "COMPLETED" ? 100 : progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {label(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={saveProgress} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Update progress
            </Button>
          </div>
          <div>
            <p className="mb-2 font-semibold">Comments</p>
            <ul className="mb-2 space-y-2">
              {(comments.data ?? []).map((c) => (
                <li key={c.id} className="rounded-md border border-border p-2">
                  <p className="text-xs text-muted-foreground">
                    {(c.author as { full_name: string } | null)?.full_name ?? "Someone"} · {formatDate(c.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap">{c.comment}</p>
                </li>
              ))}
              {comments.data?.length === 0 && <li className="text-xs text-muted-foreground">No comments yet.</li>}
            </ul>
            <div className="flex gap-2">
              <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" maxLength={2000} />
              <Button variant="outline" onClick={addComment}>
                Post
              </Button>
            </div>
          </div>
          <div>
            <p className="mb-2 font-semibold">History</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {(history.data ?? []).map((h) => (
                <li key={h.id}>
                  {formatDate(h.created_at)} · {(h.actor as { full_name: string } | null)?.full_name ?? "System"} — {h.change}
                </li>
              ))}
              {history.data?.length === 0 && <li>No history recorded yet.</li>}
            </ul>
          </div>
        </div>
        {(onEdit || canDelete) && (
          <DialogFooter>
            {canDelete && (
              <Button variant="destructive" onClick={remove}>
                Delete task
              </Button>
            )}
            {onEdit && (
              <Button variant="outline" onClick={onEdit}>
                Edit task
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
