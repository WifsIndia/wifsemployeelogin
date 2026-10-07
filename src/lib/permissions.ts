import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface ModulePerm {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
}

const NONE: ModulePerm = { view: false, create: false, edit: false, delete: false, approve: false };
const ALL: ModulePerm = { view: true, create: true, edit: true, delete: true, approve: true };

/** All of the signed-in user's permission rows (UI hint only; the database enforces). Refreshes on focus. */
export function usePermissions() {
  const { user, roles } = useAuth();
  const q = useQuery({
    queryKey: ["my-permissions", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => (await supabase.rpc("my_permissions")).data ?? [],
  });
  const isSuper = roles.includes("super_admin");
  const get = (module: string): ModulePerm => {
    if (isSuper) return ALL;
    const row = q.data?.find((p) => p.module === module);
    if (!row) return NONE;
    return { view: row.can_view, create: row.can_create, edit: row.can_edit, delete: row.can_delete, approve: row.can_approve };
  };
  return { get, isLoading: q.isLoading && !isSuper, ready: isSuper || q.data !== undefined };
}

export function usePermission(module: string): ModulePerm {
  return usePermissions().get(module);
}
