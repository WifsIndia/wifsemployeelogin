ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS auto_mark_late boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_mark_early_departure boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_gps boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.compute_attendance_metrics()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare s public.organization_settings; _in timestamp; _out timestamp; _m int;
begin
  select * into s from public.organization_settings limit 1;
  if s.id is null then return new; end if;
  if new.check_in_time is not null then
    _in := new.check_in_time at time zone s.timezone;
    _m := floor(extract(epoch from (_in - (new.attendance_date + s.office_start))) / 60);
    new.late_minutes := case when s.auto_mark_late and _m > s.grace_minutes then _m else 0 end;
  end if;
  if new.check_in_time is not null and new.check_out_time is not null then
    _out := new.check_out_time at time zone s.timezone;
    _m := floor(extract(epoch from ((new.attendance_date + s.office_end) - _out)) / 60);
    new.early_departure_minutes := case when s.auto_mark_early_departure and _m > s.early_departure_grace_minutes then _m else 0 end;
    new.worked_minutes := floor(extract(epoch from (new.check_out_time - new.check_in_time)) / 60);
    _m := new.worked_minutes - (s.full_day_hours * 60)::int;
    new.overtime_minutes := case when s.overtime_enabled and _m >= s.overtime_after_minutes then _m else 0 end;
    new.day_status := case when new.worked_minutes >= s.full_day_hours * 60 then 'full_day'
      when new.worked_minutes >= s.half_day_hours * 60 then 'half_day' else 'short' end;
  end if;
  return new;
end; $function$;

-- GPS optional mode still requires an assigned active location; geofence is skipped only when GPS is not required AND no coordinates were sent.
CREATE OR REPLACE FUNCTION public.authorized_office_for(_uid uuid, _lat double precision, _lon double precision)
RETURNS TABLE(office_id uuid, dist double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare _gps boolean := coalesce((select require_gps from public.organization_settings limit 1), true);
begin
  if not exists (select 1 from public.employee_locations el join public.office_locations o on o.id = el.location_id
                 where el.user_id = _uid and o.active) then
    raise exception 'NO_AUTHORIZED_LOCATION';
  end if;
  if _lat is null or _lon is null then
    if _gps then raise exception 'LOCATION_REQUIRED'; end if;
    return query select el.location_id, null::double precision
      from public.employee_locations el join public.office_locations o on o.id = el.location_id
      where el.user_id = _uid and o.active order by o.created_at limit 1;
    return;
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
  if _lat is not null and _accuracy is not null and _accuracy > 200 then raise exception 'POOR_ACCURACY'; end if;
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
  if _lat is not null and _accuracy is not null and _accuracy > 200 then raise exception 'POOR_ACCURACY'; end if;
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