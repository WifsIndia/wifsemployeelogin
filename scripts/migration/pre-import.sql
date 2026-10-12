-- Run ONLY in the NEW Supabase project's SQL Editor, AFTER migrations 0000–0026 and BEFORE the import.
-- Never run this on the current Lovable database.
-- Pauses app triggers so imported history is not altered (no duplicate notifications/task history,
-- no leave notice/overlap rejections, attendance metrics kept as exported).
do $$
declare t text;
begin
  if exists (select 1 from public.profiles) then
    raise exception 'Target already has profiles — this must be a fresh project';
  end if;
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

-- Optional (the import script also cleans up rows this trigger creates if this fails due to permissions):
alter table auth.users disable trigger on_auth_user_created;
