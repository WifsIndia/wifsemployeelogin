import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { pageHead } from "@/lib/meta";
import { getCurrentPosition } from "@/lib/geo";
import { Loading, PageHeader, RequireRole } from "@/components/AppShell";
import { Panel } from "@/components/TeamOverview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const MapPicker = lazy(() => import("@/components/MapPicker"));

export const Route = createFileRoute("/_authenticated/admin/settings/office-location")({
  head: () => pageHead("Office Location", "Configure the office location and attendance radius."),
  component: () => (
    <RequireRole roles={["admin"]}>
      <Page />
    </RequireRole>
  ),
});

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["office-location"],
    queryFn: async () => (await supabase.from("office_locations").select("*").order("created_at").limit(1).maybeSingle()).data,
  });
  const [f, setF] = useState({ name: "WiFS Office", city: "Nashik", latitude: "", longitude: "", radius_meters: "100", active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data) setF({
      name: q.data.name, city: q.data.city ?? "", latitude: q.data.latitude?.toString() ?? "",
      longitude: q.data.longitude?.toString() ?? "", radius_meters: String(q.data.radius_meters), active: q.data.active,
    });
  }, [q.data]);

  const lat = f.latitude === "" ? null : Number(f.latitude);
  const lon = f.longitude === "" ? null : Number(f.longitude);
  const radius = Number(f.radius_meters) || 0;

  const useMyLocation = async () => {
    try {
      const p = await getCurrentPosition();
      setF({ ...f, latitude: p.latitude.toFixed(6), longitude: p.longitude.toFixed(6) });
    } catch {
      toast.error("Could not get your current location.");
    }
  };

  const save = async () => {
    if (!f.name.trim()) return toast.error("Office name is required.");
    if (lat == null || isNaN(lat) || lat < -90 || lat > 90) return toast.error("Enter a valid latitude (-90 to 90).");
    if (lon == null || isNaN(lon) || lon < -180 || lon > 180) return toast.error("Enter a valid longitude (-180 to 180).");
    if (!Number.isInteger(radius) || radius < 10 || radius > 5000) return toast.error("Radius must be a whole number between 10 and 5000 meters.");
    setSaving(true);
    const payload = { name: f.name.trim(), city: f.city.trim() || null, latitude: lat, longitude: lon, radius_meters: radius, active: f.active };
    const { error } = q.data
      ? await supabase.from("office_locations").update(payload).eq("id", q.data.id)
      : await supabase.from("office_locations").insert(payload);
    if (!error) {
      await supabase.from("audit_logs").insert({ actor_id: user!.id, action: "office_location_updated", entity: "office_locations", entity_id: q.data?.id ?? null, details: payload });
    }
    setSaving(false);
    if (error) return toast.error("Could not save office location.");
    toast.success("Office location saved");
    qc.invalidateQueries({ queryKey: ["office-location"] });
  };

  if (q.isLoading) return <Loading />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Office Location" description="Attendance check-in and check-out use these settings." />
      {(lat == null || lon == null) && (
        <div className="rounded-lg border border-warning bg-warning/15 p-3 text-sm">
          The office coordinates are not set yet. Employees cannot check in until you save a latitude and longitude.
        </div>
      )}
      <Panel title="Details">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Office name</Label><Input value={f.name} maxLength={100} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><Label>City</Label><Input value={f.city} maxLength={100} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
          <div><Label>Latitude</Label><Input inputMode="decimal" value={f.latitude} placeholder="e.g. 19.997500" onChange={(e) => setF({ ...f, latitude: e.target.value })} /></div>
          <div><Label>Longitude</Label><Input inputMode="decimal" value={f.longitude} placeholder="e.g. 73.789800" onChange={(e) => setF({ ...f, longitude: e.target.value })} /></div>
          <div><Label>Allowed radius (meters)</Label><Input type="number" value={f.radius_meters} onChange={(e) => setF({ ...f, radius_meters: e.target.value })} /></div>
          <div className="flex items-center gap-3 pt-6"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /><Label>Active</Label></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={save} disabled={saving}>Save settings</Button>
          <Button variant="outline" onClick={useMyLocation}>Use my current location</Button>
        </div>
      </Panel>
      <Panel title="Pick on map">
        <p className="mb-3 text-sm text-muted-foreground">Click the map to set the office point. The shaded circle shows the allowed radius.</p>
        <Suspense fallback={<Loading />}>
          <MapPicker lat={lat != null && !isNaN(lat) ? lat : null} lon={lon != null && !isNaN(lon) ? lon : null} radius={radius}
            onPick={(a, b) => setF((s) => ({ ...s, latitude: a.toFixed(6), longitude: b.toFixed(6) }))} />
        </Suspense>
      </Panel>
    </div>
  );
}
