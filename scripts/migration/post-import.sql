-- Run in the NEW project's SQL Editor after the import finishes.
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
    execute format('alter table public.%I enable trigger user', t);
  end loop;
end $$;

alter table auth.users enable trigger on_auth_user_created;

-- Scheduled jobs (requires pg_cron extension enabled)
select cron.schedule('attendance_auto_close', '1 18 * * *', $$select public.auto_close_open_attendance()$$);
select cron.schedule('overdue_task_reminders', '30 4 * * *', $$select public.send_overdue_task_reminders()$$);

-- Sanity checks
select (select count(*) from public.profiles) profiles,
       (select count(*) from public.user_roles where role = 'super_admin') super_admins,
       (select count(*) from cron.job) cron_jobs;
