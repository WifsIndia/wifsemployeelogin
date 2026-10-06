import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Panel } from "@/components/TeamOverview";
import { Loading, StatusPill, Empty } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDelete, Field, tableCls, tdCls, thCls } from "./shared";

type Company = Database["public"]["Tables"]["companies"]["Row"];
type Loc = Database["public"]["Tables"]["office_locations"]["Row"];

export function CompaniesSection() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["companies-admin"],
    queryFn: async () => {
      const [c, u] = await Promise.all([
        supabase.from("companies").select("*").order("name"),
        supabase.from("user_companies").select("company_id"),
      ]);
      const counts = new Map<string, number>();
      for (const r of u.data ?? []) counts.set(r.company_id, (counts.get(r.company_id) ?? 0) + 1);
      return { companies: c.data ?? [], counts };
    },
  });
  const [edit, setEdit] = useState<Partial<Company> | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["companies-admin"] });
  const save = async () => {
    if (!edit?.name?.trim()) return toast.error("Name is required.");
    const row = { name: edit.name.trim(), code: edit.code || null, description: edit.description || null, active: edit.active ?? true };
    const { error } = edit.id
      ? await supabase.from("companies").update(row).eq("id", edit.id)
      : await supabase.from("companies").insert(row);
    if (error) return toast.error(error.message.includes("duplicate") ? "A company with that name already exists." : "Could not save company.");
    toast.success("Company saved");
    setEdit(null);
    refresh();
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (error) return toast.error("Could not delete company.");
    refresh();
  };
  return (
    <Panel title="Companies" action={<Button size="sm" onClick={() => setEdit({ active: true })}><Plus className="size-4" /> Add company</Button>}>
      {q.isLoading ? <Loading /> : !q.data?.companies.length ? <Empty>No companies yet. Add WiFS, Star Care or others.</Empty> : (
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Name</th><th className={thCls}>Code</th><th className={thCls}>Staff</th><th className={thCls}>Status</th><th className={thCls} /></tr></thead>
            <tbody>
              {q.data.companies.map((c) => (
                <tr key={c.id}>
                  <td className={tdCls + " font-medium"}>{c.name}</td>
                  <td className={tdCls}>{c.code ?? "—"}</td>
                  <td className={tdCls}>{q.data.counts.get(c.id) ?? 0}</td>
                  <td className={tdCls}><StatusPill status={c.active ? "active" : "inactive"} /></td>
                  <td className={tdCls + " text-right"}>
                    <Button variant="ghost" size="sm" onClick={() => setEdit(c)}><Pencil className="size-4" /></Button>
                    <ConfirmDelete what={c.name} onConfirm={() => del(c.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{edit.id ? "Edit company" : "Add company"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Field label="Name"><Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Short code"><Input value={edit.code ?? ""} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
              <Field label="Description"><Input value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
              <label className="flex items-center gap-3 text-sm"><Switch checked={edit.active ?? true} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /> Active</label>
              <Button onClick={save}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Panel>
  );
}

export function LocationsSection() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["locations-admin"],
    queryFn: async () => {
      const [l, p] = await Promise.all([
        supabase.from("office_locations").select("*").order("created_at"),
        supabase.from("profiles").select("id, full_name, location_id"),
      ]);
      return { locs: l.data ?? [], people: p.data ?? [] };
    },
  });
  const [edit, setEdit] = useState<Partial<Loc> | null>(null);
  const [viewing, setViewing] = useState<Loc | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["locations-admin"] });
  const save = async () => {
    if (!edit?.name?.trim()) return toast.error("Name is required.");
    const row = {
      name: edit.name.trim(), address: edit.address || null, city: edit.city || null, state: edit.state || null,
      pin_code: edit.pin_code || null, phone: edit.phone || null, email: edit.email || null,
      latitude: edit.latitude ?? null, longitude: edit.longitude ?? null,
      radius_meters: edit.radius_meters ?? 100, active: edit.active ?? true,
    };
    const { error } = edit.id
      ? await supabase.from("office_locations").update(row).eq("id", edit.id)
      : await supabase.from("office_locations").insert(row);
    if (error) return toast.error("Could not save location.");
    toast.success("Location saved");
    setEdit(null);
    refresh();
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("office_locations").delete().eq("id", id);
    if (error) return toast.error("Location is in use — deactivate it instead.");
    refresh();
  };
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <Panel title="Locations" action={<Button size="sm" onClick={() => setEdit({ active: true, radius_meters: 100 })}><Plus className="size-4" /> Add location</Button>}>
      <p className="mb-3 text-xs text-muted-foreground">
        GPS check-in uses the first active location. Use the <Link to="/admin/settings/office-location" className="font-semibold text-primary hover:underline">Office Location</Link> page to pick coordinates on a map.
      </p>
      {q.isLoading ? <Loading /> : (
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Name</th><th className={thCls}>Address</th><th className={thCls}>Staff</th><th className={thCls}>Status</th><th className={thCls} /></tr></thead>
            <tbody>
              {q.data?.locs.map((l) => (
                <tr key={l.id}>
                  <td className={tdCls + " font-medium"}>{l.name}</td>
                  <td className={tdCls}>{[l.address, l.city, l.state, l.pin_code].filter(Boolean).join(", ") || "—"}</td>
                  <td className={tdCls}>
                    <button className="text-primary hover:underline" onClick={() => setViewing(l)}>
                      {q.data.people.filter((p) => p.location_id === l.id).length}
                    </button>
                  </td>
                  <td className={tdCls}><StatusPill status={l.active ? "active" : "inactive"} /></td>
                  <td className={tdCls + " text-right"}>
                    <Button variant="ghost" size="sm" onClick={() => setEdit(l)}><Pencil className="size-4" /></Button>
                    <ConfirmDelete what={l.name} onConfirm={() => del(l.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {viewing && (
        <Dialog open onOpenChange={(o) => !o && setViewing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Staff at {viewing.name}</DialogTitle></DialogHeader>
            <ul className="space-y-1 text-sm">
              {q.data?.people.filter((p) => p.location_id === viewing.id).map((p) => <li key={p.id}>{p.full_name}</li>)}
            </ul>
            <p className="text-xs text-muted-foreground">Assign staff to a location from the Staff section.</p>
          </DialogContent>
        </Dialog>
      )}
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{edit.id ? "Edit location" : "Add location"}</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["name", "address", "city", "state", "pin_code", "phone", "email"] as const).map((k) => (
                <Field key={k} label={k.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}>
                  <Input value={(edit[k] as string | null) ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
                </Field>
              ))}
              <Field label="Latitude"><Input type="number" step="any" value={edit.latitude ?? ""} onChange={(e) => setEdit({ ...edit, latitude: num(e.target.value) })} /></Field>
              <Field label="Longitude"><Input type="number" step="any" value={edit.longitude ?? ""} onChange={(e) => setEdit({ ...edit, longitude: num(e.target.value) })} /></Field>
              <Field label="Radius (meters)"><Input type="number" min={10} value={edit.radius_meters ?? 100} onChange={(e) => setEdit({ ...edit, radius_meters: Number(e.target.value) })} /></Field>
              <label className="flex items-center gap-3 text-sm"><Switch checked={edit.active ?? true} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /> Active</label>
            </div>
            <Button onClick={save}>Save</Button>
          </DialogContent>
        </Dialog>
      )}
    </Panel>
  );
}
