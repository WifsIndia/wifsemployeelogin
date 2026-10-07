import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { pageHead } from "@/lib/meta";
import { AccessDenied, Empty, Loading, PageHeader, StatusPill } from "@/components/AppShell";
import { Panel } from "@/components/TeamOverview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, money, tableCls, tdCls, thCls } from "@/components/settings/shared";

export const Route = createFileRoute("/_authenticated/payroll")({
  head: () => pageHead("Payroll", "Monthly salary calculation with a clear breakdown for each employee."),
  component: Page,
});

type B = Record<string, number | string | null | boolean | number[]>;

const ERR: Record<string, string> = {
  NOT_ALLOWED: "You don't have permission to manage payroll for this employee.",
  PAYROLL_FINALIZED: "This month is finalized. Reopen it before recalculating.",
};
const errMsg = (m: string) => Object.entries(ERR).find(([k]) => m.includes(k))?.[1] ?? "Could not complete the payroll action.";

function Page() {
  const { user, roles } = useAuth();
  const isSuper = roles.includes("super_admin");
  const qc = useQueryClient();
  const [emp, setEmp] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);

  const perms = useQuery({
    queryKey: ["payroll-perms", user?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc("my_permissions");
      const p = (data ?? []).find((x) => x.module === "payroll");
      return { view: isSuper || !!p?.can_view, edit: isSuper || !!p?.can_edit };
    },
  });
  const people = useQuery({
    queryKey: ["payroll-people"],
    enabled: !!perms.data?.view,
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, employee_code").order("full_name")).data ?? [],
  });
  useEffect(() => { if (!emp && user) setEmp(user.id); }, [user, emp]);

  const history = useQuery({
    queryKey: ["payroll-history", emp],
    enabled: !!emp && !!perms.data?.view,
    queryFn: async () => (await supabase.from("payroll_records").select("*").eq("employee_id", emp).order("month", { ascending: false })).data ?? [],
  });
  const monthISO = `${month}-01`;
  const rec = history.data?.find((r) => r.month === monthISO);
  const refresh = () => qc.invalidateQueries({ queryKey: ["payroll-history"] });

  const generate = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("generate_payroll", { _emp: emp, _month: monthISO });
    setBusy(false);
    if (error) return toast.error(errMsg(error.message));
    toast.success("Payroll calculated");
    refresh();
  };
  const setStatus = async (status: "draft" | "finalized") => {
    if (!rec) return;
    const { error } = await supabase.rpc("set_payroll_status", { _id: rec.id, _status: status });
    if (error) return toast.error(errMsg(error.message));
    toast.success(status === "finalized" ? "Payroll finalized" : "Payroll reopened");
    refresh();
  };

  if (perms.isLoading) return <Loading />;
  if (!perms.data?.view) return <AccessDenied />;
  const canEdit = perms.data.edit && (isSuper || emp !== user?.id);
  const b = (rec?.breakdown ?? null) as B | null;
  const cur = (b?.["currency"] as string) || "INR";
  const m = (k: string) => money(b?.[k] as number, cur);

  return (
    <div className="space-y-4">
      <PageHeader title="Payroll" description="Monthly salary calculation based on salary, joining date, leave policy, attendance and holidays." />
      <Panel title={(people.data?.length ?? 0) > 1 ? "Select" : "My payroll"}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(people.data?.length ?? 0) > 1 && <Field label="Employee">
            <NativeSelect value={emp} onChange={(e) => setEmp(e.target.value)}>
              {(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.employee_code ? ` (${p.employee_code})` : ""}</option>)}
            </NativeSelect>
          </Field>}
          <Field label="Month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
          {canEdit && (
            <div className="flex min-w-0 flex-wrap items-end gap-2 md:col-span-2 xl:col-span-1">
              <Button onClick={generate} disabled={busy || !emp || rec?.status === "finalized"}>{rec ? "Recalculate" : "Calculate"}</Button>
              {rec?.status === "draft" && <Button variant="secondary" onClick={() => (window.confirm("Finalize this payroll? It can't be recalculated unless a Super Admin reopens it.") ? setStatus("finalized") : undefined)}>Finalize</Button>}
              {rec?.status === "finalized" && isSuper && <Button variant="outline" onClick={() => setStatus("draft")}>Reopen</Button>}
            </div>
          )}
        </div>
      </Panel>

      {history.isLoading ? <Loading /> : !rec || !b ? (
        <Empty>No payroll saved for this month yet.{canEdit ? " Click Calculate." : ""}</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Salary breakdown" action={<StatusPill status={rec.status} />}>
            {!b["has_salary"] && <p className="mb-2 rounded-md bg-warning/15 p-2 text-sm">No salary is set for this employee.</p>}
            <Rows rows={[
              ["Basic salary", m("basic_salary")], ["Allowances", m("allowances")], ["Gross monthly salary", m("gross_salary")],
              [`Daily rate (gross ÷ ${b["divisor"]}, ${b["divisor_mode"]} rule)`, m("daily_salary")],
              [`Salary for period (${b["period_start"]} to ${b["period_end"]})`, m("prorated_base")],
              [`Unpaid deduction (${Number(b["unpaid_leave_days"]) + Number(b["absent_days"])} days × daily rate)`, `− ${m("unpaid_deduction")}`],
              ["Other deductions", `− ${m("other_deductions")}`],
              ["Total deductions", `− ${m("total_deductions")}`],
            ]} />
            <div className="mt-3 grid min-w-0 gap-1 sm:grid-cols-[minmax(0,1fr)_auto] rounded-lg bg-muted p-3 font-display text-lg font-semibold">
              <span>Final payable</span><span>{m("net_salary")}</span>
            </div>
          </Panel>
          <Panel title="Days">
            <Rows rows={[
              ["Working days in month", String(b["month_working_days"])], ["Holidays (not counted)", String(b["holidays"])],
              ["Applicable working days", String(b["applicable_working_days"])], ["Days worked", String(b["days_worked"])],
              ["Paid leave days", String(b["paid_leave_days"])], ["Unpaid leave days", String(b["unpaid_leave_days"])],
              ["Paid leave over yearly allowance (made unpaid)", String(b["paid_leave_over_allowance"])],
              ["Absent days (no attendance, no leave)", String(b["absent_days"])], ["Upcoming days (not yet counted)", String(b["upcoming_days"])],
            ]} />
            <p className="mt-2 text-xs text-muted-foreground">Calculated {new Date(rec.generated_at).toLocaleString()}. Joining date: {String(b["joining_date"] ?? "—")}.</p>
          </Panel>
        </div>
      )}

      <Panel title="Payroll history">
        {!history.data?.length ? <Empty>No payroll history.</Empty> : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr><th className={thCls}>Month</th><th className={thCls}>Salary</th><th className={thCls}>Deductions</th><th className={thCls}>Payable</th><th className={thCls}>Status</th></tr></thead>
              <tbody>{history.data.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setMonth(r.month.slice(0, 7))}>
                  <td className={tdCls}>{r.month.slice(0, 7)}</td><td className={tdCls}>{money(r.gross_salary, cur)}</td>
                  <td className={tdCls}>{money(r.total_deductions, cur)}</td><td className={tdCls}>{money(r.net_salary, cur)}</td>
                  <td className={tdCls}><StatusPill status={r.status} /></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-border text-sm">
      {rows.map(([k, v]) => <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2"><dt className="min-w-0 break-words text-muted-foreground">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>)}
    </dl>
  );
}
