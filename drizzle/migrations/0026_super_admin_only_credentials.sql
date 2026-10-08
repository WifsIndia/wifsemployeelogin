create or replace function public.guard_profile_username()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Login identity (username, email) may only be changed by Super Admin; server-side jobs (no auth.uid) are trusted.
  if auth.uid() is not null and not public.is_super_admin(auth.uid()) then
    new.username := old.username;
    new.email := old.email;
  end if;
  if new.username is not null then new.username := lower(new.username); end if;
  return new;
end; $$;