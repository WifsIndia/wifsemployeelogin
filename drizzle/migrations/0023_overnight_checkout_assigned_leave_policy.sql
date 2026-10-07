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
  -- Today's open session, otherwise an open session left over from the previous local day (overnight shift).
  select * into _row from public.attendance
    where employee_id=_uid and status='checked_in' and attendance_date in (_today, _today - 1)
    order by attendance_date desc limit 1;
  if _row.id is null then
    if exists (select 1 from public.attendance where employee_id=_uid and attendance_date=_today) then
      raise exception 'ALREADY_CHECKED_OUT';
    end if;
    raise exception 'NOT_CHECKED_IN';
  end if;
  update public.attendance set check_out_time = now(), check_out_latitude=_lat, check_out_longitude=_lon,
    check_out_accuracy=_accuracy, status='checked_out' where id=_row.id returning * into _row;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (_uid,'ATTENDANCE_CHECK_OUT','attendance',_row.id, jsonb_build_object('distance_m', round(_dist::numeric,1), 'location_id', _office_id, 'accuracy_m', _accuracy, 'attendance_date', _row.attendance_date));
  return _row;
end; $function$;

CREATE OR REPLACE FUNCTION public.can_assign_leave_policy(_actor uuid, _target uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select public.is_super_admin(_actor) or (
    _actor <> _target and (public.has_role(_actor,'admin') or public.has_role(_actor,'hr'))
    and public.has_permission(_actor,'leave','edit')
    and (public.shares_company(_actor,_target) or not exists (select 1 from public.user_companies where user_id = _target))
  )
$function$;

-- Working days for one employee, from their assigned leave policy (ISO weekdays 1=Mon..7=Sun),
-- falling back to the organization working week when no policy is assigned.
CREATE OR REPLACE FUNCTION public.employee_working_day_count(_start date, _end date, _employee uuid)
 RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare _wd int[]; _loc uuid; _pol uuid;
begin
  select location_id, leave_policy_id into _loc, _pol from public.profiles where id = _employee;
  if _pol is not null then
    select array(select unnest(working_days)::int) into _wd from public.leave_policy_sets where id = _pol;
  end if;
  if _wd is null then
    select array(select case when x = 0 then 7 else x end from unnest(working_days) x) into _wd from public.organization_settings limit 1;
  end if;
  _wd := coalesce(_wd, '{1,2,3,4,5,6}'::int[]);
  return (select count(*)::numeric from generate_series(_start, _end, interval '1 day') g(d)
    where extract(isodow from g.d)::int = any(_wd)
      and not exists (select 1 from public.holidays h where h.active and h.mandatory and h.holiday_date = g.d::date
        and (h.location_id is null or h.location_id = _loc)));
end; $function$;
GRANT EXECUTE ON FUNCTION public.employee_working_day_count(date, date, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_balances(_employee uuid)
 RETURNS TABLE(leave_type leave_type, label text, entitled numeric, carried numeric, used numeric, pending numeric, available numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare _y int := extract(year from (now() at time zone 'Asia/Kolkata'))::int; _pol uuid;
begin
  if auth.uid() is not null and not public.can_view_employee(auth.uid(), _employee) then return; end if;
  select leave_policy_id into _pol from public.profiles where id = _employee;
  return query
  with src as (
    (select distinct on (t.base_type) t.base_type as lt, t.name as lbl, t.days_per_year as dpy, t.carry_forward as cf, t.max_carry_forward as mcf
       from public.leave_policy_types t
       where _pol is not null and t.policy_id = _pol and t.active and t.base_type is not null
       order by t.base_type, t.created_at)
    union all
    select p.leave_type, p.label, p.days_per_year, p.carry_forward, p.max_carry_forward
      from public.leave_policies p where _pol is null and p.active
  )
  select x.lt, x.lbl, x.entitled, x.carried, x.used, x.pending, x.entitled + x.carried - x.used - x.pending
  from (
    select s.lt, s.lbl, s.dpy as entitled,
      case when s.cf then least(s.mcf, greatest(0, s.dpy - coalesce((
        select sum(coalesce(l.days,0)) from public.leave_requests l where l.employee_id=_employee and l.leave_type=s.lt
          and l.status='APPROVED' and extract(year from l.start_date)=_y-1),0))) else 0 end as carried,
      coalesce((select sum(coalesce(l.days,0)) from public.leave_requests l where l.employee_id=_employee and l.leave_type=s.lt
          and l.status='APPROVED' and extract(year from l.start_date)=_y),0) as used,
      coalesce((select sum(coalesce(l.days,0)) from public.leave_requests l where l.employee_id=_employee and l.leave_type=s.lt
          and l.status='PENDING' and extract(year from l.start_date)=_y),0) as pending
    from src s
  ) x;
end; $function$;

CREATE OR REPLACE FUNCTION public.leave_validate_insert()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare _pol uuid; _found boolean := false; _paid boolean; _dpy numeric; _half boolean; _notice int; _appr boolean;
  _tz text; _today date; _avail numeric;
begin
  select leave_policy_id into _pol from public.profiles where id = new.employee_id;
  if _pol is not null then
    select true, t.is_paid, t.days_per_year, t.allow_half_day, t.min_notice_days, t.requires_approval
      into _found, _paid, _dpy, _half, _notice, _appr
      from public.leave_policy_types t
      where t.policy_id = _pol and t.base_type = new.leave_type and t.active
      order by t.created_at limit 1;
  else
    select true, p.is_paid, p.days_per_year, p.allow_half_day, p.min_notice_days, p.requires_approval
      into _found, _paid, _dpy, _half, _notice, _appr
      from public.leave_policies p where p.leave_type = new.leave_type and p.active;
  end if;
  if not coalesce(_found,false) then raise exception 'LEAVE_TYPE_DISABLED'; end if;
  if new.end_date < new.start_date then raise exception 'INVALID_DATES'; end if;
  if new.half_day and (not _half or new.start_date <> new.end_date) then raise exception 'HALF_DAY_NOT_ALLOWED'; end if;
  select timezone into _tz from public.organization_settings limit 1;
  _today := (now() at time zone coalesce(_tz,'Asia/Kolkata'))::date;
  if new.start_date - _today < _notice then raise exception 'NOTICE_REQUIRED:%', _notice; end if;
  new.days := case when new.half_day then 0.5 else public.employee_working_day_count(new.start_date, new.end_date, new.employee_id) end;
  if new.days <= 0 then raise exception 'NO_WORKING_DAYS'; end if;
  if _paid and _dpy > 0 then
    select b.available into _avail from public.leave_balances(new.employee_id) b where b.leave_type = new.leave_type;
    if coalesce(_avail,0) < new.days then raise exception 'INSUFFICIENT_BALANCE'; end if;
  end if;
  new.status := case when _appr then 'PENDING'::public.leave_status else 'APPROVED'::public.leave_status end;
  new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
  return new;
end; $function$;