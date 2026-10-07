alter table public.profiles add column if not exists username text;
alter table public.profiles add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9._-]{3,30}$');
create unique index if not exists profiles_username_unique on public.profiles (lower(username));

-- Only HR/Admin may set or change usernames (keeps login identity controlled).
create or replace function public.guard_profile_username()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.username is distinct from old.username and auth.uid() is not null and not public.is_hr_or_admin(auth.uid()) then
    new.username := old.username;
  end if;
  if new.username is not null then new.username := lower(new.username); end if;
  return new;
end; $$;
drop trigger if exists profiles_username_guard on public.profiles;
create trigger profiles_username_guard before update on public.profiles for each row execute function public.guard_profile_username();