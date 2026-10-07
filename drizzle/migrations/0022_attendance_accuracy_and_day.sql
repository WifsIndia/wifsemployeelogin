CREATE OR REPLACE FUNCTION public.check_in(_lat double precision, _lon double precision, _accuracy double precision)
 RETURNS attendance LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  _uid uuid := auth.uid();
  _office_id uuid;
  _dist double precision;
  _tz text := coalesce((select timezone from public.organization_settings limit 1), 'Asia/Kolkata');
  _today date := (now() at time zone _tz)::date;
  _row public.attendance;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.profiles where id = _uid and status = 'active') then
    raise exception 'INACTIVE_EMPLOYEE';
  end if;
  begin
    select office_id, dist into _office_id, _dist from public.authorized_office_for(_uid, _lat, _lon);
  exception when others then
    -- Accuracy only matters when the reported point is not inside an authorized office.
    if sqlerrm = 'OUTSIDE_OFFICE' and _accuracy is not null and _accuracy > 200 then raise exception 'POOR_ACCURACY'; end if;
    raise;
  end;
  if exists (select 1 from public.attendance where employee_id=_uid and attendance_date=_today) then
    raise exception 'ALREADY_CHECKED_IN';
  end if;
  insert into public.attendance (employee_id, attendance_date, check_in_time, check_in_latitude, check_in_longitude, check_in_accuracy, status, office_location_id)
  values (_uid,_today, now(), _lat,_lon,_accuracy,'checked_in',_office_id)
  returning * into _row;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (_uid,'ATTENDANCE_CHECK_IN','attendance',_row.id, jsonb_build_object('distance_m', round(_dist::numeric,1), 'location_id', _office_id, 'accuracy_m', _accuracy));
  return _row;
end; $function$;

CREATE OR REPLACE FUNCTION public.check_out(_lat double precision, _lon double precision, _accuracy double precision)
 RETURNS attendance LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  _uid uuid := auth.uid();
  _office_id uuid;
  _dist double precision;
  _tz text := coalesce((select timezone from public.organization_settings limit 1), 'Asia/Kolkata');
  _today date := (now() at time zone _tz)::date;
  _row public.attendance;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  begin
    select office_id, dist into _office_id, _dist from public.authorized_office_for(_uid, _lat, _lon);
  exception when others then
    if sqlerrm = 'OUTSIDE_OFFICE' and _accuracy is not null and _accuracy > 200 then raise exception 'POOR_ACCURACY'; end if;
    raise;
  end;
  select * into _row from public.attendance where employee_id=_uid and attendance_date=_today;
  if _row.id is null then raise exception 'NOT_CHECKED_IN'; end if;
  if _row.status = 'checked_out' then raise exception 'ALREADY_CHECKED_OUT'; end if;
  update public.attendance set check_out_time = now(), check_out_latitude=_lat, check_out_longitude=_lon,
    check_out_accuracy=_accuracy, status='checked_out' where id=_row.id returning * into _row;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (_uid,'ATTENDANCE_CHECK_OUT','attendance',_row.id, jsonb_build_object('distance_m', round(_dist::numeric,1), 'location_id', _office_id, 'accuracy_m', _accuracy));
  return _row;
end; $function$;