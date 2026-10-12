-- Run by itself after post-import.sql, ONLY if pre-import-auth-trigger.sql succeeded.
-- Required: without it, new employees would get no profile/role.
alter table auth.users enable trigger on_auth_user_created;

-- Check (should return 'O' = enabled):
select tgenabled from pg_trigger where tgname = 'on_auth_user_created';
