import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Panel } from "@/components/TeamOverview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loading } from "@/components/AppShell";
import { Field, NativeSelect } from "./shared";

type Org = Database["public"]["Tables"]["organization_settings"]["Row"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function useOrg() {
  return useQuery({
    queryKey: ["org-settings"],
    queryFn: async () => (await supabase.from("organization_settings").select("*").maybeSingle()).data as Org | null,
  });
}

function useOrgForm() {
  const q = useOrg();
  const qc = useQueryClient();
  const [f, setF] = useState<Org | null>(null);
  useEffect(() => setF(q.data ?? null), [q.data]);
  const save = async () => {
    if (!f) return;
    const { id: _id, updated_at: _u, ...rest } = f;
    const { error } = await supabase.from("organization_settings").update(rest).eq("id", true);
    if (error) return toast.error("Could not save settings.");
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["org-settings"] });
  };
  return { f, setF, save, loading: q.isLoading };
}

export function OrganizationSection() {
  const { f, setF, save, loading } = useOrgForm();
  if (loading || !f) return <Loading />;
  const t = (k: keyof Org, label: string) => (
    <Field label={label}>
      <Input value={(f[k] as string | null) ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value || null })} />
    </Field>
  );
  return (
    <div className="space-y-6">
      <Panel title="Company details">
        <div className="grid gap-3 sm:grid-cols-2">
          {t("name", "Organization name")}
          {t("logo_url", "Logo URL")}
          {t("address", "Address")}
          {t("city", "City")}
          {t("state", "State")}
          {t("country", "Country")}
          {t("pin_code", "PIN / ZIP")}
          {t("phone", "Contact number")}
          {t("email", "Email")}
          {t("website", "Website")}
          {t("timezone", "Time zone")}
          {t("currency", "Currency (e.g. INR)")}
        </div>
        {f.logo_url && <img src={f.logo_url} alt="Company logo" className="mt-3 h-12 object-contain" />}
      </Panel>
      <Panel title="Working days & hours">
        <WorkingDays f={f} setF={setF} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Office start">
            <Input type="time" value={f.office_start.slice(0, 5)} onChange={(e) => setF({ ...f, office_start: e.target.value })} />
          </Field>
          <Field label="Office end">
            <Input type="time" value={f.office_end.slice(0, 5)} onChange={(e) => setF({ ...f, office_end: e.target.value })} />
          </Field>
        </div>
      </Panel>
      <Button onClick={save}>Save organization settings</Button>
    </div>
  );
}

function WorkingDays({ f, setF }: { f: Org; setF: (o: Org) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">Working days (unselected days are weekly holidays)</p>
      <div className="flex flex-wrap gap-2">
        {DAYS.map((d, i) => {
          const on = f.working_days.includes(i);
          return (
            <button
              key={d}
              type="button"
              onClick={() =>
                setF({ ...f, working_days: on ? f.working_days.filter((x) => x !== i) : [...f.working_days, i].sort() })
              }
              className={
                "rounded-md border px-3 py-1.5 text-sm " +
                (on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground")
              }
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AttendanceSection() {
  const { f, setF, save, loading } = useOrgForm();
  if (loading || !f) return <Loading />;
  const n = (k: keyof Org, label: string, step = "1") => (
    <Field label={label}>
      <Input type="number" min={0} step={step} value={Number(f[k] ?? 0)} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} />
    </Field>
  );
  return (
    <div className="space-y-6">
      <Panel title="Office hours">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Office start">
            <Input type="time" value={f.office_start.slice(0, 5)} onChange={(e) => setF({ ...f, office_start: e.target.value })} />
          </Field>
          <Field label="Office end">
            <Input type="time" value={f.office_end.slice(0, 5)} onChange={(e) => setF({ ...f, office_end: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3"><WorkingDays f={f} setF={setF} /></div>
      </Panel>
      <Panel title="Late arrival, early departure & day rules">
        <div className="grid gap-3 sm:grid-cols-2">
          {n("grace_minutes", "Late arrival grace (minutes)")}
          {n("early_departure_grace_minutes", "Early departure grace (minutes)")}
          {n("full_day_hours", "Full day = at least (hours)", "0.5")}
          {n("half_day_hours", "Half day = at least (hours)", "0.5")}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Every check-in/out is measured against these rules automatically: late minutes, early departure, hours worked and full/half day.
        </p>
      </Panel>
      <Panel title="Overtime">
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={f.overtime_enabled} onCheckedChange={(v) => setF({ ...f, overtime_enabled: v })} /> Track overtime
        </label>
        <div className="mt-3 max-w-xs">{n("overtime_after_minutes", "Count overtime after extra (minutes)")}</div>
      </Panel>
      <Button onClick={save}>Save attendance settings</Button>
    </div>
  );
}

export function SystemSection() {
  const { f, setF, save, loading } = useOrgForm();
  if (loading || !f) return <Loading />;
  return (
    <div className="space-y-6">
      <Panel title="System settings">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date format">
            <NativeSelect value={f.date_format} onChange={(e) => setF({ ...f, date_format: e.target.value })}>
              {["dd MMM yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"].map((d) => <option key={d}>{d}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Keep audit logs for (days)">
            <Input type="number" min={30} value={f.audit_retention_days} onChange={(e) => setF({ ...f, audit_retention_days: Number(e.target.value) })} />
          </Field>
        </div>
      </Panel>
      <Button onClick={save}>Save system settings</Button>
    </div>
  );
}

export function PayrollRulesForm() {
  const { f, setF, save, loading } = useOrgForm();
  if (loading || !f) return <Loading />;
  return (
    <Panel title="Daily salary rule">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Divide monthly salary by">
          <NativeSelect value={f.salary_divisor_mode} onChange={(e) => setF({ ...f, salary_divisor_mode: e.target.value })}>
            <option value="fixed">A fixed number of days</option>
            <option value="calendar">Calendar days in the month</option>
            <option value="working_days">Actual working days in the month</option>
          </NativeSelect>
        </Field>
        {f.salary_divisor_mode === "fixed" && (
          <Field label="Fixed days">
            <Input type="number" min={1} max={31} value={f.salary_fixed_divisor} onChange={(e) => setF({ ...f, salary_fixed_divisor: Number(e.target.value) })} />
          </Field>
        )}
        <div className="flex items-end"><Button onClick={save}>Save rule</Button></div>
      </div>
    </Panel>
  );
}
