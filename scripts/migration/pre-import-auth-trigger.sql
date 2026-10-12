-- OPTIONAL. Run by itself in the NEW project's SQL Editor after pre-import.sql.
-- If Supabase refuses it ("must be owner of table users"), ignore the error: the import script
-- reconciles the profile/role rows this trigger creates for imported accounts.
alter table auth.users disable trigger on_auth_user_created;
