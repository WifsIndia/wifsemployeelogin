-- STEP A. Run ONLY in the NEW Supabase project's SQL Editor, AFTER migrations 0000–0026 and BEFORE the import.
-- Never run this on the current Lovable database. Safe to re-run.
-- Contains no auth-schema statements, so it cannot fail on auth permissions.
-- The optional auth trigger pause is in pre-import-auth-trigger.sql (run separately).
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_roles','attendance','leave_requests','payroll_records','tasks','task_history',
    'task_comments','daily_work_logs','documents','document_folders','announcements','notifications',
    'useful_links','audit_logs','roles','role_permissions','employee_locations','user_companies',
    'employee_compensation','leave_policy_sets','leave_policy_types','holidays','office_locations',
    'organization_settings','projects','companies','departments','leave_policies']
  loop
    execute format('alter table public.%I disable trigger user', t);
  end loop;
end $$;

-- Marker the import script checks before writing anything. RLS on, no policies: only the service role can read it.
create table if not exists public.migration_import_state (
  id boolean primary key default true check (id),
  triggers_paused boolean not null default true,
  prepared_at timestamptz not null default now()
);
alter table public.migration_import_state enable row level security;
grant select on public.migration_import_state to service_role;
insert into public.migration_import_state (id) values (true) on conflict (id) do update set triggers_paused = true;
