import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, LogIn, LogOut, MapPin, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { distanceMeters, friendlyError, getCurrentPosition } from "@/lib/geo";
import { duration, formatTime, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/AppShell";

/** All of today's check-in/check-out sessions for the signed-in employee, oldest first. */
export function useTodayAttendance() {
  const { user } = useAuth();
  const today = todayISO();
  return useQuery({
    queryKey: ["attendance-today", user?.id, today],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_id", user!.id)
        .eq("attendance_date", today)
        .order("check_in_time", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** The signed-in employee's authorized, active office locations. */
export function useMyOffices() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-offices", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_locations")
        .select("office:office_locations(id, name, latitude, longitude, radius_meters, active)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.office).filter((o): o is NonNullable<typeof o> => !!o && o.active);
    },
  });
}

interface LocState {
  office?: string | null;
  distance: number | null;
  accuracy: number;
  inside: boolean | null;
}

export function AttendanceCard() {
  const qc = useQueryClient();
  const { data: sessions, isLoading } = useTodayAttendance();
  const list = sessions ?? [];
  const open = list.find((r) => r.status === "checked_in") ?? null;
  const row = open ?? list[list.length - 1] ?? null;
  const totalMin = list.reduce((m, r) => m + (r.check_out_time ? Math.max(0, (new Date(r.check_out_time).getTime() - new Date(r.check_in_time!).getTime()) / 60000) : 0), 0);
  const { data: offices } = useMyOffices();
  const [busy, setBusy] = useState<null | "in" | "out">(null);
  const [loc, setLoc] = useState<LocState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const { data: rules } = useQuery({
    queryKey: ["attendance-rules"],
    queryFn: async () => (await supabase.from("organization_settings").select("require_gps").maybeSingle()).data,
  });
  const gpsRequired = rules?.require_gps ?? true;
  const located = (offices ?? []).filter((o) => o.latitude != null && o.longitude != null);
  // While loading, don't block; the database makes the final decision.
  const configured = !gpsRequired || offices === undefined || located.length > 0;

  const act = async (kind: "in" | "out") => {
    setError(null);
    setBusy(kind);
    try {
      let c: { latitude: number | null; longitude: number | null; accuracy: number | null };
      try { c = await getCurrentPosition(); }
      catch (err) { if (gpsRequired) throw err; c = { latitude: null, longitude: null, accuracy: null }; }
      let distance: number | null = null;
      let inside: boolean | null = null;
      let officeName: string | null = null;
      if (c.latitude != null && c.longitude != null && located.length) {
        // Compare against every authorized location; use the closest one inside its radius, else the nearest.
        const scored = located.map((o) => ({
          d: distanceMeters(c.latitude!, c.longitude!, o.latitude!, o.longitude!),
          r: o.radius_meters,
          name: o.name,
        }));
        const hit = scored.filter((s) => s.d <= s.r).sort((a, b) => a.d - b.d)[0];
        const nearest = hit ?? scored.sort((a, b) => a.d - b.d)[0]!;
        distance = nearest.d;
        inside = !!hit;
        officeName = nearest.name;
      }
      if (c.accuracy != null) setLoc({ office: officeName, distance, accuracy: c.accuracy, inside });
      // The database performs the authoritative location, radius and accuracy checks.
      const { error: rpcError } = await supabase.rpc(kind === "in" ? "check_in" : "check_out", {
        _lat: c.latitude as number,
        _lon: c.longitude as number,
        _accuracy: c.accuracy as number,
      });
      if (rpcError) throw new Error(rpcError.message);
      // Accepted by the server: the position is inside an authorized office.
      if (c.accuracy != null) setLoc({ office: officeName, distance, accuracy: c.accuracy, inside: true });
      toast.success(kind === "in" ? "Checked in successfully" : "Checked out successfully");
      await qc.invalidateQueries({ queryKey: ["attendance-today"] });
      await qc.invalidateQueries({ queryKey: ["attendance"] });
    } catch (e) {
      const msg = friendlyError(e instanceof Error ? e.message : String(e));
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  const status = !row ? "Not checked in" : open ? "Working" : "Checked out — you can check in again";

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Today's attendance</h2>
        {row ? <StatusPill status={row.status} /> : <StatusPill status="Not checked in" />}
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-muted-foreground">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-2 text-center min-[400px]:grid-cols-3 sm:gap-3">
            <Info label="Check-in" value={formatTime(row?.check_in_time)} />
            <Info label="Check-out" value={formatTime(row?.check_out_time)} />
            <Info label="Duration" value={duration(row?.check_in_time ?? null, row?.check_out_time ?? null)} />
          </div>
          {list.length > 1 && (
            <div className="mt-3 rounded-md border border-border p-3 text-sm">
              <p className="mb-1 font-medium">Today's sessions ({list.length})</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {list.map((r, i) => (
                  <li key={r.id}>{i + 1}. {formatTime(r.check_in_time)} – {r.check_out_time ? formatTime(r.check_out_time) : "open"}{r.check_out_time && ` · ${duration(r.check_in_time, r.check_out_time)}`}</li>
                ))}
              </ul>
              <p className="mt-1">Completed total: <span className="font-medium text-foreground">{Math.floor(totalMin / 60)}h {Math.round(totalMin % 60)}m</span></p>
            </div>
          )}
          <p className="mt-3 text-sm text-muted-foreground">Status: <span className="font-medium text-foreground">{status}</span></p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button
              size="lg"
              className="h-14 text-base"
              disabled={!!busy || !!open || !configured}
              onClick={() => act("in")}
            >
              {busy === "in" ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />}
              {busy === "in" ? "Getting location…" : "Check In"}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="h-14 text-base"
              disabled={!!busy || !open || !configured}
              onClick={() => act("out")}
            >
              {busy === "out" ? <Loader2 className="size-5 animate-spin" /> : <LogOut className="size-5" />}
              {busy === "out" ? "Getting location…" : "Check Out"}
            </Button>
          </div>

          {!configured && (
            <p className="mt-3 flex items-start gap-2 rounded-md bg-warning/15 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              The office location has not been configured yet. Please ask your administrator to set it up.
            </p>
          )}

          {loc && (
            <p
              className={`mt-3 flex items-start gap-2 rounded-md p-3 text-sm ${
                loc.inside === false ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
              }`}
            >
              {loc.inside === false ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              )}
              <span>
                {loc.inside === false
                  ? "You appear to be outside your authorized office locations"
                  : `You are inside an authorized office location${loc.office ? `: ${loc.office}` : ""}`}
                {loc.distance != null && ` (about ${Math.round(loc.distance)} m from ${loc.inside === false ? "the nearest office" : "the office point"})`}. Location accuracy: ±
                {Math.round(loc.accuracy)} m.
              </span>
            </p>
          )}

          {error && <p className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

          <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            Your location is read only when you tap Check In or Check Out, to confirm you are at the WiFS office. Please
            allow location access when your browser asks.
          </p>
        </>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/60 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words font-display text-base font-semibold">{value}</p>
    </div>
  );
}
