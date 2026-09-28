import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "hr", "manager", "employee"]),
});

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isHr } = await context.supabase.rpc("is_hr_or_admin", { _user_id: context.userId });
    if (!isHr) throw new Error("Only HR or Admin can create employees.");
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (data.role === "admin" && !isAdmin) throw new Error("Only Admin can create another admin.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create user.");
    const uid = created.user.id;
    await supabaseAdmin.from("profiles").update({ full_name: data.full_name, email: data.email }).eq("id", uid);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "employee_created",
      entity: "profiles",
      entity_id: uid,
      details: { email: data.email, role: data.role },
    });
    return { id: uid };
  });
