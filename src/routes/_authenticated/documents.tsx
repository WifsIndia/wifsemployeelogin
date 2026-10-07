import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Download, Eye, FileText, Folder, FolderPlus, Loader2, Pencil, Search, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/permissions";
import { pageHead } from "@/lib/meta";
import { formatDate } from "@/lib/format";
import { AccessDenied, Empty, Loading, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => pageHead("Documents", "Company policies and employee documents."),
  component: Page,
});

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  company_id: string | null;
}
interface DocRow {
  id: string;
  name: string;
  folder_id: string | null;
  company_id: string | null;
  file_path: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
  uploader: { full_name: string } | null;
}

const fmtSize = (b: number) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const typeOf = (d: DocRow) => (d.name.includes(".") ? d.name.split(".").pop()!.toUpperCase() : d.mime_type ?? "File");

function Page() {
  const { user } = useAuth();
  const perm = usePermission("documents");
  const qc = useQueryClient();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [folderDialog, setFolderDialog] = useState<FolderRow | "new" | null>(null);
  const [renameDoc, setRenameDoc] = useState<DocRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const folders = useQuery({
    queryKey: ["doc-folders", user?.id],
    enabled: !!user,
    queryFn: async () => ((await supabase.from("document_folders").select("id, name, parent_id, company_id").order("name")).data ?? []) as FolderRow[],
  });
  const docs = useQuery({
    queryKey: ["documents", user?.id],
    enabled: !!user,
    queryFn: async () =>
      ((
        await supabase
          .from("documents")
          .select("id, name, folder_id, company_id, file_path, mime_type, size_bytes, created_at, uploader:profiles!documents_uploaded_by_fkey(full_name)")
          .order("created_at", { ascending: false })
      ).data ?? []) as unknown as DocRow[],
  });
  const companies = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () => (await supabase.from("companies").select("id, name").eq("active", true).order("name")).data ?? [],
  });
  const companyName = (id: string | null) => (id ? companies.data?.find((c) => c.id === id)?.name ?? "Company" : "All staff");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["doc-folders"] });
    qc.invalidateQueries({ queryKey: ["documents"] });
  };

  const allFolders = folders.data ?? [];
  const current = allFolders.find((f) => f.id === folderId) ?? null;
  const trail: FolderRow[] = [];
  for (let f = current; f; f = allFolders.find((x) => x.id === f!.parent_id) ?? null) trail.unshift(f);

  const q = search.trim().toLowerCase();
  const subFolders = q ? [] : allFolders.filter((f) => f.parent_id === folderId);
  const files = (docs.data ?? []).filter((d) => (q ? d.name.toLowerCase().includes(q) : d.folder_id === folderId));
  const folderPath = (id: string | null) => {
    const names: string[] = [];
    for (let f = allFolders.find((x) => x.id === id); f; f = allFolders.find((x) => x.id === f!.parent_id)) names.unshift(f.name);
    return names.join(" / ") || "Home";
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length || !user) return;
    setUploading(true);
    // Files inside a company folder inherit that folder's company.
    const company = current?.company_id ?? (companyId || null);
    for (const file of Array.from(list)) {
      if (file.size > 20 * 1048576) {
        toast.error(`${file.name} is larger than 20 MB.`);
        continue;
      }
      const path = `${crypto.randomUUID()}/${file.name.replace(/[^\w.\- ]/g, "_")}`;
      const up = await supabase.storage.from("documents").upload(path, file, { contentType: file.type || undefined });
      if (up.error) {
        toast.error(`Could not upload ${file.name}.`);
        continue;
      }
      const { error } = await supabase.from("documents").insert({
        name: file.name,
        file_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        folder_id: folderId,
        company_id: company,
        uploaded_by: user.id,
      });
      if (error) {
        await supabase.storage.from("documents").remove([path]);
        toast.error(`You are not allowed to add ${file.name} here.`);
      } else toast.success(`${file.name} uploaded`);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    refresh();
  };

  const openDoc = async (d: DocRow, download: boolean) => {
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(d.file_path, 120, download ? { download: d.name } : undefined);
    if (error || !data) return toast.error("You cannot open this document.");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const deleteDoc = async (d: DocRow) => {
    if (!window.confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("documents").delete().eq("id", d.id);
    if (error) return toast.error("You are not allowed to delete this document.");
    await supabase.storage.from("documents").remove([d.file_path]);
    toast.success("Document deleted");
    refresh();
  };

  const deleteFolder = async (f: FolderRow) => {
    if (!window.confirm(`Delete folder "${f.name}" and everything inside it?`)) return;
    const { error } = await supabase.from("document_folders").delete().eq("id", f.id);
    if (error) return toast.error("You are not allowed to delete this folder.");
    toast.success("Folder deleted");
    refresh();
  };

  if (!perm.view && !folders.isLoading && (folders.data?.length ?? 0) === 0 && (docs.data?.length ?? 0) === 0 && user) {
    // No documents permission at all
    return <AccessDenied />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Documents"
        description="Company policies, forms and shared files."
        action={
          <div className="flex flex-wrap gap-2">
            {perm.create && (
              <Button variant="outline" onClick={() => setFolderDialog("new")}>
                <FolderPlus className="size-4" /> New folder
              </Button>
            )}
            {perm.create && (
              <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload
              </Button>
            )}
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
          </div>
        }
      />

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search all documents" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {perm.create && !current?.company_id && (companies.data?.length ?? 0) > 0 && (
          <select
            className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base sm:h-9 md:text-sm"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            aria-label="Visible to"
          >
            <option value="">Uploads visible to: all staff</option>
            {companies.data!.map((c) => (
              <option key={c.id} value={c.id}>
                Uploads visible to: {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {!q && (
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <button className="font-medium text-primary hover:underline" onClick={() => setFolderId(null)}>
            Home
          </button>
          {trail.map((f) => (
            <span key={f.id} className="flex min-w-0 max-w-full items-center gap-1">
              <ChevronRight className="size-3 text-muted-foreground" />
              <button className="min-w-0 break-words text-left font-medium text-primary hover:underline" onClick={() => setFolderId(f.id)}>
                {f.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      <div className="rounded-xl border border-border bg-card">
        {folders.isLoading || docs.isLoading ? (
          <Loading />
        ) : subFolders.length === 0 && files.length === 0 ? (
          <Empty>{q ? "No documents match your search." : "This folder is empty."}</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {subFolders.map((f) => (
              <li key={f.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 px-4 py-3 sm:gap-3">
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setFolderId(f.id)}>
                  <Folder className="size-5 shrink-0 text-primary" />
                  <span className="truncate font-medium">{f.name}</span>
                  <span className="hidden truncate text-xs text-muted-foreground sm:inline">{companyName(f.company_id)}</span>
                </button>
                {perm.edit && (
                  <Button size="icon" variant="ghost" aria-label="Rename folder" onClick={() => setFolderDialog(f)}>
                    <Pencil className="size-4" />
                  </Button>
                )}
                {perm.delete && (
                  <Button size="icon" variant="ghost" aria-label="Delete folder" onClick={() => deleteFolder(f)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
            {files.map((d) => (
              <li key={d.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 px-4 py-3 sm:flex sm:gap-3">
                <FileText className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {typeOf(d)} · {fmtSize(d.size_bytes)} · {d.uploader?.full_name ?? "—"} · {formatDate(d.created_at)} ·{" "}
                    {companyName(d.company_id)}
                    {q && ` · ${folderPath(d.folder_id)}`}
                  </p>
                </div>
                <div className="col-start-2 flex flex-wrap gap-1 sm:ml-auto sm:shrink-0">
                <Button size="icon" variant="ghost" aria-label="Open" onClick={() => openDoc(d, false)}>
                  <Eye className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Download" onClick={() => openDoc(d, true)}>
                  <Download className="size-4" />
                </Button>
                {perm.edit && (
                  <Button size="icon" variant="ghost" aria-label="Rename or move" onClick={() => setRenameDoc(d)}>
                    <Pencil className="size-4" />
                  </Button>
                )}
                {perm.delete && (
                  <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => deleteDoc(d)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {folderDialog && (
        <FolderDialog
          folder={folderDialog === "new" ? null : folderDialog}
          parent={current}
          companies={companies.data ?? []}
          onClose={() => setFolderDialog(null)}
          onSaved={refresh}
        />
      )}
      {renameDoc && (
        <DocDialog doc={renameDoc} folders={allFolders} folderPath={folderPath} onClose={() => setRenameDoc(null)} onSaved={refresh} />
      )}
    </div>
  );
}

function FolderDialog({
  folder,
  parent,
  companies,
  onClose,
  onSaved,
}: {
  folder: FolderRow | null;
  parent: FolderRow | null;
  companies: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState(folder?.name ?? "");
  const [company, setCompany] = useState(folder?.company_id ?? parent?.company_id ?? "");
  const [saving, setSaving] = useState(false);
  const inherited = !folder && !!parent?.company_id;

  const save = async () => {
    if (!name.trim()) return toast.error("Folder name is required.");
    setSaving(true);
    const { error } = folder
      ? await supabase.from("document_folders").update({ name: name.trim() }).eq("id", folder.id)
      : await supabase.from("document_folders").insert({
          name: name.trim(),
          parent_id: parent?.id ?? null,
          company_id: company || null,
          created_by: user!.id,
        });
    setSaving(false);
    if (error) return toast.error("You are not allowed to do this.");
    toast.success(folder ? "Folder renamed" : "Folder created");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{folder ? "Rename folder" : "New folder"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
          </div>
          {!folder && (
            <div className="space-y-1.5">
              <Label>Visible to</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={company}
                disabled={inherited}
                onChange={(e) => setCompany(e.target.value)}
              >
                <option value="">All staff</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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

function DocDialog({
  doc,
  folders,
  folderPath,
  onClose,
  onSaved,
}: {
  doc: DocRow;
  folders: FolderRow[];
  folderPath: (id: string | null) => string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(doc.name);
  const [folder, setFolder] = useState(doc.folder_id ?? "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim()) return toast.error("Name is required.");
    setSaving(true);
    const target = folders.find((f) => f.id === folder);
    const { error } = await supabase
      .from("documents")
      .update({ name: name.trim(), folder_id: folder || null, company_id: target?.company_id ?? doc.company_id })
      .eq("id", doc.id);
    setSaving(false);
    if (error) return toast.error("You are not allowed to do this.");
    toast.success("Document updated");
    onSaved();
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename or move document</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} />
          </div>
          <div className="space-y-1.5">
            <Label>Folder</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
            >
              <option value="">Home</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {folderPath(f.id)}
                </option>
              ))}
            </select>
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
