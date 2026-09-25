create or replace function public.can_view_employee(_viewer uuid, _employee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _viewer = _employee
      or public.is_hr_or_admin(_viewer)
      or public.is_manager_of(_viewer, _employee);
$$;