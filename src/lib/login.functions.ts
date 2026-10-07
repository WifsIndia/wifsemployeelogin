import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const schema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/),
  password: z.string().min(1).max(72),
});

/**
 * Signs in with a username. The username → email lookup happens only here on the server,
 * so emails are never exposed to the browser; the normal password check still applies.
 */
export const signInWithUsername = createServerFn({ method: "POST" })
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data }) => {
    const fail = { ok: false as const, error: "Incorrect username or password." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin.from("profiles").select("email").eq("username", data.username).maybeSingle();
    if (!p?.email) return fail;
    const anon = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: s, error } = await anon.auth.signInWithPassword({ email: p.email, password: data.password });
    if (error || !s.session) return fail;
    return { ok: true as const, access_token: s.session.access_token, refresh_token: s.session.refresh_token };
  });
