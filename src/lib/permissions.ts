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

/** Reads the signed-in user's permission row for a module (UI hint only; the database enforces). */
export function usePermission(module: string): ModulePerm {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["my-permissions", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => (await supabase.rpc("my_permissions")).data ?? [],
  });
  const row = data?.find((p) => p.module === module);
  if (!row) return NONE;
  return { view: row.can_view, create: row.can_create, edit: row.can_edit, delete: row.can_delete, approve: row.can_approve };
}
