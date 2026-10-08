CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS auto_checked_out boolean NOT NULL DEFAULT false;
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_employee_id_attendance_date_key;
CREATE INDEX IF NOT EXISTS attendance_emp_date_idx ON public.attendance(employee_id, attendance_date);

CREATE OR REPLACE FUNCTION public.compute_attendance_metrics()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare s public.organization_settings; _in timestamp; _out timestamp; _m int; _day int; _ot_other int;
begin
  select * into s from public.organization_settings limit 1;
  if s.id is null then return new; end if;
  if new.check_in_time is not null then
    if exists (select 1 from public.attendance a where a.employee_id=new.employee_id and a.attendance_date=new.attendance_date
               and a.id<>new.id and a.check_in_time < new.check_in_time) then
      new.late_minutes := 0;
    else
      _in := new.check_in_time at time zone s.timezone;
      _m := floor(extract(epoch from (_in - (new.attendance_date + s.office_start))) / 60);
      new.late_minutes := case when s.auto_mark_late and _m > s.grace_minutes then _m else 0 end;
    end if;
  end if;
  if new.check_in_time is not null and new.check_out_time is not null then
    _out := new.check_out_time at time zone s.timezone;
    _m := floor(extract(epoch from ((new.attendance_date + s.office_end) - _out)) / 60);
    new.early_departure_minutes := case when not new.auto_checked_out and s.auto_mark_early_departure and _m > s.early_departure_grace_minutes then _m else 0 end;
    new.worked_minutes := greatest(0, floor(extract(epoch from (new.check_out_time - new.check_in_time)) / 60));
    select coalesce(sum(worked_minutes),0), coalesce(sum(overtime_minutes),0) into _day, _ot_other
      from public.attendance a where a.employee_id=new.employee_id and a.attendance_date=new.attendance_date
      and a.id<>new.id and a.check_out_time is not null;
    _day := _day + new.worked_minutes;
    _m := _day - (s.full_day_hours * 60)::int;
    new.overtime_minutes := case when not new.auto_checked_out and s.overtime_enabled and _m >= s.overtime_after_minutes
      then greatest(0, _m - _ot_other) else 0 end;
    new.day_status := case when _day >= s.full_day_hours * 60 then 'full_day'
      when _day >= s.half_day_hours * 60 then 'half_day' else 'short' end;
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.sync_attendance_day()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  if pg_trigger_depth() > 1 or new.check_out_time is null then return null; end if;
  update public.attendance set day_status = new.day_status
    where employee_id=new.employee_id and attendance_date=new.attendance_date and id<>new.id
      and check_out_time is not null and day_status is distinct from new.day_status;
  return null;
end $$;
DROP TRIGGER IF EXISTS attendance_sync_day ON public.attendance;
CREATE TRIGGER attendance_sync_day AFTER INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_day();

CREATE OR REPLACE FUNCTION public.auto_close_open_attendance(_uid uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare s public.organization_settings; _n int;
begin
  select * into s from public.organization_settings limit 1;
  update public.attendance a set
    check_out_time = greatest(a.check_in_time, (a.attendance_date + coalesce(s.office_end, time '18:00')) at time zone coalesce(s.timezone,'Asia/Kolkata')),
    status = 'checked_out', auto_checked_out = true
  where a.status = 'checked_in'
    and a.attendance_date < (now() at time zone coalesce(s.timezone,'Asia/Kolkata'))::date
    and (_uid is null or a.employee_id = _uid);
  get diagnostics _n = row_count;
  return _n;
end $$;
REVOKE ALL ON FUNCTION public.auto_close_open_attendance(uuid) FROM public, anon, authenticated;

UPDATE public.attendance a SET status = 'checked_out', auto_checked_out = true,
  check_out_time = greatest(a.check_in_time, (a.attendance_date + coalesce((select office_end from public.organization_settings limit 1), time '18:00')) at time zone coalesce((select timezone from public.organization_settings limit 1),'Asia/Kolkata'))
WHERE a.status = 'checked_in' AND a.attendance_date < (now() at time zone coalesce((select timezone from public.organization_settings limit 1),'Asia/Kolkata'))::date;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_one_open_session ON public.attendance(employee_id) WHERE status = 'checked_in';

CREATE OR REPLACE FUNCTION public.check_in(_lat double precision, _lon double precision, _accuracy double precision)
RETURNS attendance LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  _uid uuid := auth.uid(); _office_id uuid; _dist double precision;
  _tz text := coalesce((select timezone from public.organization_settings limit 1), 'Asia/Kolkata');
  _today date := (now() at time zone _tz)::date;
  _row public.attendance;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.profiles where id = _uid and status = 'active') then raise exception 'INACTIVE_EMPLOYEE'; end if;
  begin
    select office_id, dist into _office_id, _dist from public.authorized_office_for(_uid, _lat, _lon);
  exception when others then
    if sqlerrm = 'OUTSIDE_OFFICE' and _accuracy is not null and _accuracy > 200 then raise exception 'POOR_ACCURACY'; end if;
    raise;
  end;
  perform public.auto_close_open_attendance(_uid);
  if exists (select 1 from public.attendance where employee_id=_uid and status='checked_in') then
    raise exception 'ALREADY_CHECKED_IN';
  end if;
  insert into public.attendance (employee_id, attendance_date, check_in_time, check_in_latitude, check_in_longitude, check_in_accuracy, status, office_location_id)
  values (_uid,_today, now(), _lat,_lon,_accuracy,'checked_in',_office_id) returning * into _row;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (_uid,'ATTENDANCE_CHECK_IN','attendance',_row.id, jsonb_build_object('distance_m', round(_dist::numeric,1), 'location_id', _office_id, 'accuracy_m', _accuracy));
  return _row;
end; $function$;

CREATE OR REPLACE FUNCTION public.check_out(_lat double precision, _lon double precision, _accuracy double precision)
RETURNS attendance LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  _uid uuid := auth.uid(); _office_id uuid; _dist double precision;
  _row public.attendance;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  begin
    select office_id, dist into _office_id, _dist from public.authorized_office_for(_uid, _lat, _lon);
  exception when others then
    if sqlerrm = 'OUTSIDE_OFFICE' and _accuracy is not null and _accuracy > 200 then raise exception 'POOR_ACCURACY'; end if;
    raise;
  end;
  perform public.auto_close_open_attendance(_uid);
  select * into _row from public.attendance where employee_id=_uid and status='checked_in' order by check_in_time desc limit 1;
  if _row.id is null then raise exception 'NOT_CHECKED_IN'; end if;
  update public.attendance set check_out_time = now(), check_out_latitude=_lat, check_out_longitude=_lon,
    check_out_accuracy=_accuracy, status='checked_out' where id=_row.id returning * into _row;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (_uid,'ATTENDANCE_CHECK_OUT','attendance',_row.id, jsonb_build_object('distance_m', round(_dist::numeric,1), 'location_id', _office_id, 'accuracy_m', _accuracy, 'attendance_date', _row.attendance_date));
  return _row;
end; $function$;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS reminder_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_reminder_key_idx ON public.notifications(reminder_key) WHERE reminder_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.send_overdue_task_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare s public.organization_settings; _today date; _n int;
begin
  select * into s from public.organization_settings limit 1;
  _today := (now() at time zone coalesce(s.timezone,'Asia/Kolkata'))::date;
  if s.id is not null and not (extract(dow from _today)::int = any(s.working_days)) then return 0; end if;
  if exists (select 1 from public.holidays h where h.holiday_date=_today and h.active and h.mandatory and h.location_id is null) then return 0; end if;
  insert into public.notifications (user_id, title, body, link, expires_at, reminder_key)
  select t.assignee_id, 'Task overdue: ' || t.title,
         'This task was due on ' || to_char(t.due_date, 'DD Mon YYYY') || ' and is still open.',
         '/tasks', now() + interval '24 hours', 'task_overdue:' || t.id || ':' || t.due_date
  from public.tasks t
  where t.due_date < _today and t.status not in ('COMPLETED','CANCELLED')
  on conflict (reminder_key) where reminder_key is not null do nothing;
  get diagnostics _n = row_count;
  return _n;
end $$;
REVOKE ALL ON FUNCTION public.send_overdue_task_reminders() FROM public, anon, authenticated;