CREATE TABLE public.employee_locations (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.office_locations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, location_id)
);
GRANT SELECT, INSERT, DELETE ON public.employee_locations TO authenticated;
GRANT ALL ON public.employee_locations TO service_role;
ALTER TABLE public.employee_locations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_locations(_actor uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select public.is_super_admin(_actor)
      or (_actor <> _target and public.has_role(_actor,'admin') and public.has_permission(_actor,'locations','edit'))
$$;

CREATE POLICY "View own or permitted employee locations" ON public.employee_locations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_view_employee(auth.uid(), user_id));
CREATE POLICY "Authorized admins add employee locations" ON public.employee_locations
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_locations(auth.uid(), user_id));
CREATE POLICY "Authorized admins remove employee locations" ON public.employee_locations
  FOR DELETE TO authenticated
  USING (public.can_manage_locations(auth.uid(), user_id));

-- Safe default: keep current staff able to check in at the location they use today.
INSERT INTO public.employee_locations (user_id, location_id)
SELECT p.id, coalesce(p.location_id, (select id from public.office_locations where active order by created_at limit 1))
FROM public.profiles p
WHERE coalesce(p.location_id, (select id from public.office_locations where active order by created_at limit 1)) IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.authorized_office_for(_uid uuid, _lat double precision, _lon double precision)
RETURNS TABLE(office_id uuid, dist double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
begin
  if not exists (select 1 from public.employee_locations el join public.office_locations o on o.id = el.location_id
                 where el.user_id = _uid and o.active) then
    raise exception 'NO_AUTHORIZED_LOCATION';
  end if;
  if not exists (select 1 from public.employee_locations el join public.office_locations o on o.id = el.location_id
                 where el.user_id = _uid and o.active and o.latitude is not null and o.longitude is not null) then
    raise exception 'OFFICE_NOT_CONFIGURED';
  end if;
  return query
    select o.id, public.distance_meters(_lat,_lon,o.latitude,o.longitude) d
    from public.employee_locations el join public.office_locations o on o.id = el.location_id
    where el.user_id = _uid and o.active and o.latitude is not null and o.longitude is not null
      and public.distance_meters(_lat,_lon,o.latitude,o.longitude) <= o.radius_meters
    order by d limit 1;
  if not found then raise exception 'OUTSIDE_OFFICE'; end if;
end; $$;
REVOKE EXECUTE ON FUNCTION public.authorized_office_for(uuid, double precision, double precision) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_in(_lat double precision, _lon double precision, _accuracy double precision)
 RETURNS attendance LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  _uid uuid := auth.uid();
  _office_id uuid;
  _dist double precision;
  _today date := (now() at time zone 'Asia/Kolkata')::date;
  _row public.attendance;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.profiles where id = _uid and status = 'active') then
    raise exception 'INACTIVE_EMPLOYEE';
  end if;
  if _lat is null or _lon is null then raise exception 'LOCATION_REQUIRED'; end if;
  if _accuracy is not null and _accuracy > 200 then raise exception 'POOR_ACCURACY'; end if;
  select office_id, dist into _office_id, _dist from public.authorized_office_for(_uid, _lat, _lon);
  if exists (select 1 from public.attendance where employee_id=_uid and attendance_date=_today) then
    raise exception 'ALREADY_CHECKED_IN';
  end if;
  insert into public.attendance (employee_id, attendance_date, check_in_time, check_in_latitude, check_in_longitude, check_in_accuracy, status, office_location_id)
  values (_uid,_today, now(), _lat,_lon,_accuracy,'checked_in',_office_id)
  returning * into _row;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (_uid,'ATTENDANCE_CHECK_IN','attendance',_row.id, jsonb_build_object('distance_m', round(_dist::numeric,1), 'location_id', _office_id));
  return _row;
end; $function$;

CREATE OR REPLACE FUNCTION public.check_out(_lat double precision, _lon double precision, _accuracy double precision)
 RETURNS attendance LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  _uid uuid := auth.uid();
  _office_id uuid;
  _dist double precision;
  _today date := (now() at time zone 'Asia/Kolkata')::date;
  _row public.attendance;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if _lat is null or _lon is null then raise exception 'LOCATION_REQUIRED'; end if;
  if _accuracy is not null and _accuracy > 200 then raise exception 'POOR_ACCURACY'; end if;
  select office_id, dist into _office_id, _dist from public.authorized_office_for(_uid, _lat, _lon);
  select * into _row from public.attendance where employee_id=_uid and attendance_date=_today;
  if _row.id is null then raise exception 'NOT_CHECKED_IN'; end if;
  if _row.status = 'checked_out' then raise exception 'ALREADY_CHECKED_OUT'; end if;
  update public.attendance set check_out_time = now(), check_out_latitude=_lat, check_out_longitude=_lon,
    check_out_accuracy=_accuracy, status='checked_out' where id=_row.id returning * into _row;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (_uid,'ATTENDANCE_CHECK_OUT','attendance',_row.id, jsonb_build_object('distance_m', round(_dist::numeric,1), 'location_id', _office_id));
  return _row;
end; $function$;