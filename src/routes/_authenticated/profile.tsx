import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { pageHead } from "@/lib/meta";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/AppShell";
import { Panel } from "@/components/TeamOverview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => pageHead("My Profile", "View and update your employee profile."),
  component: Page,
});

function Page() {
  const { profile, roles, refresh } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pw, setPw] = useState("");
  useEffect(() => {
    setName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
  }, [profile]);

  const dept = useQuery({
    queryKey: ["dept", profile?.department_id],
    enabled: !!profile?.department_id,
    queryFn: async () => (await supabase.from("departments").select("name").eq("id", profile!.department_id!).maybeSingle()).data,
  });

  const save = async () => {
    if (!name.trim()) return toast.error("Name is required.");
    const { error } = await supabase.from("profiles").update({ full_name: name.trim(), phone: phone.trim() || null }).eq("id", profile!.id);
    if (error) return toast.error("Could not save profile.");
    toast.success("Profile updated");
    refresh();
  };
  const changePw = async () => {
    if (pw.length < 8) return toast.error("Password must be at least 8 characters.");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return toast.error(error.message);
    setPw("");
    toast.success("Password changed");
  };

  const info: [string, string][] = [
    ["Email", profile?.email ?? "—"],
    ["Employee code", profile?.employee_code ?? "—"],
    ["Designation", profile?.designation ?? "—"],
    ["Department", dept.data?.name ?? "—"],
    ["Joining date", profile?.joining_date ? formatDate(profile.joining_date) : "—"],
    ["Role", roles.join(", ") || "employee"],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="My Profile" />
      <Panel title="Employee details">
        <dl className="grid gap-3 sm:grid-cols-2">
          {info.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
              <dd className="text-sm font-medium capitalize-first">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">Contact HR to change official details.</p>
      </Panel>
      <Panel title="Personal information">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Full name</Label><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Phone</Label><Input value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <Button className="mt-4" onClick={save}>Save</Button>
      </Panel>
      <Panel title="Change password">
        <div className="flex flex-wrap gap-3">
          <Input type="password" className="max-w-xs" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Button variant="outline" onClick={changePw}>Update password</Button>
        </div>
      </Panel>
    </div>
  );
}
