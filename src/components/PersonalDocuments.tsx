import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Eye, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";

type Doc = { id: string; name: string; file_path: string; mime_type: string | null; size_bytes: number; created_at: string };
const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);

/** Personal documents for one employee, shown inside their profile. Access is enforced by documents RLS + storage policies. */
export function PersonalDocuments({ employeeId }: { employeeId: string }) {
  const { user, hasRole } = useAuth();
  const perm = usePermission("documents");
  const manager = hasRole("super_admin", "admin", "hr") && employeeId !== user?.id;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const key = ["personal-docs", employeeId];
  const docs = useQuery({
    queryKey: key,
    queryFn: async () =>
      ((await supabase.from("documents").select("id, name, file_path, mime_type, size_bytes, created_at").eq("employee_id", employeeId).order("created_at", { ascending: false })).data ?? []) as Doc[],
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const upload = async (list: FileList | null) => {
    if (!list?.length || !user) return;
    setUploading(true);
    for (const file of Array.from(list)) {
      if (file.size > 20 * 1048576) { toast.error(`${file.name} is larger than 20 MB.`); continue; }
      const path = `${crypto.randomUUID()}/${file.name.replace(/[^\w.\- ]/g, "_")}`;
      const up = await supabase.storage.from("documents").upload(path, file, { contentType: file.type || undefined });
      if (up.error) { toast.error(`Could not upload ${file.name}.`); continue; }
      const { error } = await supabase.from("documents").insert({
        name: file.name, file_path: path, mime_type: file.type || null, size_bytes: file.size,
        employee_id: employeeId, uploaded_by: user.id,
      });
      if (error) { await supabase.storage.from("documents").remove([path]); toast.error(`You are not allowed to add ${file.name}.`); }
      else toast.success(`${file.name} uploaded`);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    refresh();
  };

  const open = async (d: Doc, download: boolean) => {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 120, download ? { download: d.name } : undefined);
    if (error || !data) return toast.error("You cannot open this document.");
    window.open(data.signedUrl, "_blank", "noopener");
  };
  const rename = async (d: Doc) => {
    const name = window.prompt("New name", d.name)?.trim();
    if (!name || name === d.name) return;
    const { data, error } = await supabase.from("documents").update({ name }).eq("id", d.id).select("id");
    if (error || !data?.length) return toast.error("You are not allowed to rename this document.");
    toast.success("Document renamed");
    refresh();
  };
  const remove = async (d: Doc) => {
    if (!window.confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("documents").delete().eq("id", d.id);
    if (error) return toast.error("You are not allowed to delete this document.");
    await supabase.storage.from("documents").remove([d.file_path]);
    toast.success("Document deleted");
    refresh();
  };

  const list = docs.data ?? [];
  return (
    <div className="space-y-2">
      {manager && perm.create && (
        <div>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload document
          </Button>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>
      )}
      {docs.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No personal documents.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {list.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground">{fmtSize(d.size_bytes)} · {formatDate(d.created_at)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" aria-label="View" onClick={() => open(d, false)}><Eye className="size-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Download" onClick={() => open(d, true)}><Download className="size-4" /></Button>
                {manager && perm.edit && <Button size="icon" variant="ghost" aria-label="Rename" onClick={() => rename(d)}><Pencil className="size-4" /></Button>}
                {manager && perm.delete && <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(d)}><Trash2 className="size-4" /></Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
