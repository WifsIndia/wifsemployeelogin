import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/permissions";
import { pageHead } from "@/lib/meta";
import { Empty, Loading, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/useful-links")({
  head: () => pageHead("Useful Links", "Handy links for WiFS staff."),
  component: Page,
});

type LinkRow = Database["public"]["Tables"]["useful_links"]["Row"];
type Role = Database["public"]["Enums"]["app_role"];
const ROLES: [Role, string][] = [
  ["super_admin", "Super Admin"], ["admin", "Admin"], ["hr", "HR"], ["manager", "Manager"],
  ["employee", "Employee"], ["ado", "ADO"], ["agent", "Agent"],
];
const roleLabel = (r: Role) => ROLES.find(([k]) => k === r)?.[1] ?? r;

function Page() {
  const { user } = useAuth();
  const perm = usePermission("useful_links");
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<LinkRow> | null>(null);
  const links = useQuery({
    queryKey: ["useful-links", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("useful_links").select("*").order("name")).data ?? [],
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["useful-links"] });

  const remove = async (l: LinkRow) => {
    if (!window.confirm(`Delete "${l.name}"?`)) return;
    const { error } = await supabase.from("useful_links").delete().eq("id", l.id);
    if (error) return toast.error("You are not allowed to delete this link.");
    toast.success("Link deleted");
    refresh();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Useful Links"
        description="Quick access to tools and resources."
        action={perm.create && (
          <Button onClick={() => setEdit({ name: "", description: "", url: "https://", roles: ROLES.map(([r]) => r), active: true })}>
            <Plus className="size-4" /> Add link
          </Button>
        )}
      />
      {links.isLoading ? <Loading /> : !links.data?.length ? (
        <div className="rounded-xl border border-border bg-card"><Empty>No links available for you yet.</Empty></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {links.data.map((l) => (
            <div key={l.id} className={`flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 ${l.active ? "" : "opacity-60"}`}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="group flex min-w-0 items-start gap-2">
                <ExternalLink className="mt-1 size-4 shrink-0 text-primary" />
                <span className="min-w-0 break-words font-display font-semibold text-primary group-hover:underline">{l.name}</span>
              </a>
              {l.description && <p className="mt-1 break-words text-sm text-muted-foreground">{l.description}</p>}
              {(perm.edit || perm.delete) && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span className="mr-auto min-w-0 break-words">
                    {l.active ? "Active" : "Inactive"} · {l.roles.length ? l.roles.map(roleLabel).join(", ") : "No roles"}
                  </span>
                  {perm.edit && <Button size="sm" variant="outline" onClick={() => setEdit(l)}><Pencil className="size-4" /> Edit</Button>}
                  {perm.delete && <Button size="sm" variant="outline" onClick={() => remove(l)} aria-label="Delete"><Trash2 className="size-4" /></Button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {edit && <LinkDialog init={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
    </div>
  );
}

function LinkDialog({ init, onClose, onSaved }: { init: Partial<LinkRow>; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [l, setL] = useState(init);
  const [saving, setSaving] = useState(false);
  const roles = l.roles ?? [];
  const save = async () => {
    const name = (l.name ?? "").trim();
    const url = (l.url ?? "").trim();
    if (!name) return toast.error("Link name is required.");
    if (!/^https?:\/\/\S+\.\S+/i.test(url)) return toast.error("Enter a full web address starting with https://");
    if (!roles.length) return toast.error("Choose at least one role.");
    setSaving(true);
    const row = { name, url, description: l.description?.trim() || null, roles, active: l.active ?? true };
    const { error } = l.id
      ? await supabase.from("useful_links").update(row).eq("id", l.id)
      : await supabase.from("useful_links").insert({ ...row, created_by: user!.id });
    setSaving(false);
    if (error) return toast.error("You are not allowed to save this link.");
    toast.success("Link saved");
    onSaved();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader><DialogTitle>{l.id ? "Edit link" : "Add link"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Link name</Label><Input maxLength={120} value={l.name ?? ""} onChange={(e) => setL({ ...l, name: e.target.value })} /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea maxLength={500} value={l.description ?? ""} onChange={(e) => setL({ ...l, description: e.target.value })} /></div>
          <div className="space-y-1"><Label>URL</Label><Input type="url" maxLength={2000} value={l.url ?? ""} onChange={(e) => setL({ ...l, url: e.target.value })} /></div>
          <div>
            <p className="mb-2 text-sm font-medium">Visible to roles</p>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(([r, label]) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={roles.includes(r)} onCheckedChange={(v) => setL({ ...l, roles: v ? [...roles, r] : roles.filter((x) => x !== r) })} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={l.active ?? true} onCheckedChange={(v) => setL({ ...l, active: v })} /> Active</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
