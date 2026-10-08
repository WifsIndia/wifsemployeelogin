import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(1).max(120),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, "Username must be 3–30 letters, numbers, dots, dashes or underscores."),
  role: z.enum(["admin", "hr", "manager", "employee", "ado", "agent"]),
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
    const { data: taken } = await supabaseAdmin.from("profiles").select("id").eq("username", data.username).maybeSingle();
    if (taken) throw new Error("That username is already taken.");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create user.");
    const uid = created.user.id;
    await supabaseAdmin.from("profiles").update({ full_name: data.full_name, email: data.email, username: data.username }).eq("id", uid);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "employee_created",
      entity: "profiles",
      entity_id: uid,
      details: { email: data.email, username: data.username, role: data.role },
    });
    return { id: uid };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Permission, self and Super Admin checks are enforced by the database function.
    const { error } = await context.supabase.rpc("delete_employee", { _emp: data.id });
    if (error) throw new Error(error.message);
    // Block future sign-in; the account and history records are kept.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.auth.admin.updateUserById(data.id, { ban_duration: "876000h" });
    return { ok: true };
  });

/** Super Admin only: change another user's sign-in email, username and/or password. */
export const updateCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      email: z.string().trim().toLowerCase().email().max(255).optional(),
      username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, "Username must be 3–30 letters, numbers, dots, dashes or underscores.").optional(),
      password: z.string().min(8, "Password must be at least 8 characters.").max(72).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin", { _user_id: context.userId });
    if (!isSuper) throw new Error("Only Super Admin can change sign-in details.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.username) {
      const { data: taken } = await supabaseAdmin.from("profiles").select("id").eq("username", data.username).neq("id", data.id).maybeSingle();
      if (taken) throw new Error("That username is already taken.");
    }
    if (data.email) {
      const { data: taken } = await supabaseAdmin.from("profiles").select("id").ilike("email", data.email).neq("id", data.id).maybeSingle();
      if (taken) throw new Error("That email is already used by another account.");
    }
    if (data.email || data.password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
        ...(data.email ? { email: data.email, email_confirm: true } : {}),
        ...(data.password ? { password: data.password } : {}),
      });
      if (error) throw new Error(error.message);
    }
    const upd: { email?: string; username?: string } = {};
    if (data.email) upd.email = data.email;
    if (data.username) upd.username = data.username;
    if (Object.keys(upd).length) {
      const { error } = await supabaseAdmin.from("profiles").update(upd).eq("id", data.id);
      if (error) throw new Error("Could not save sign-in details.");
    }
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId, action: "credentials_changed", entity: "profiles", entity_id: data.id,
      details: { email: !!data.email, username: !!data.username, password: !!data.password },
    });
    return { ok: true };
  });
