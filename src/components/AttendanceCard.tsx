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
        .maybeSingle();
      if (error) throw error;
      return data;
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
  distance: number | null;
  accuracy: number;
  inside: boolean | null;
}

export function AttendanceCard() {
  const qc = useQueryClient();
  const { data: row, isLoading } = useTodayAttendance();
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
      if (c.latitude != null && c.longitude != null && located.length) {
        // Compare against every authorized location; use the closest one inside its radius, else the nearest.
        const scored = located.map((o) => ({
          d: distanceMeters(c.latitude!, c.longitude!, o.latitude!, o.longitude!),
          r: o.radius_meters,
        }));
        const hit = scored.filter((s) => s.d <= s.r).sort((a, b) => a.d - b.d)[0];
        const nearest = hit ?? scored.sort((a, b) => a.d - b.d)[0]!;
        distance = nearest.d;
        inside = !!hit;
      }
      if (c.accuracy != null) setLoc({ distance, accuracy: c.accuracy, inside });
      // The database performs the authoritative location, radius and accuracy checks.
      const { error: rpcError } = await supabase.rpc(kind === "in" ? "check_in" : "check_out", {
        _lat: c.latitude as number,
        _lon: c.longitude as number,
        _accuracy: c.accuracy as number,
      });
      if (rpcError) throw new Error(rpcError.message);
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

  const status = !row ? "Not checked in" : row.status === "checked_in" ? "Working" : "Checked out";

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
          <p className="mt-3 text-sm text-muted-foreground">Status: <span className="font-medium text-foreground">{status}</span></p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button
              size="lg"
              className="h-14 text-base"
              disabled={!!busy || !!row || !configured}
              onClick={() => act("in")}
            >
              {busy === "in" ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />}
              {busy === "in" ? "Getting location…" : "Check In"}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="h-14 text-base"
              disabled={!!busy || !row || row.status === "checked_out" || !configured}
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
                {loc.inside === false ? "You appear to be outside the office area" : "You are inside the office area"}
                {loc.distance != null && ` (about ${Math.round(loc.distance)} m from office)`}. Location accuracy: ±
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
