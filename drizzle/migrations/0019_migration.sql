alter table public.leave_policy_sets add column if not exists notify_user_ids uuid[] not null default '{}';

create or replace function public.leave_prevent_overlap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.leave_requests l where l.employee_id = new.employee_id
      and l.status in ('PENDING','APPROVED') and l.start_date <= new.end_date and l.end_date >= new.start_date) then
    raise exception 'LEAVE_OVERLAP';
  end if;
  return new;
end; $$;
drop trigger if exists leave_overlap on public.leave_requests;
create trigger leave_overlap before insert on public.leave_requests for each row execute function public.leave_prevent_overlap();

create or replace function public.notify_leave_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.profiles; _extra uuid[];
begin
  select * into p from public.profiles where id = new.employee_id;
  select notify_user_ids into _extra from public.leave_policy_sets where id = p.leave_policy_id and active;
  insert into public.notifications (user_id, title, body, link)
  select distinct r.id, 'Leave request: ' || p.full_name,
    new.start_date::text || case when new.end_date <> new.start_date then ' to ' || new.end_date::text else '' end
      || case when new.half_day then ' (half day)' else '' end || ' · ' || lower(new.status::text), '/leave'
  from public.profiles r
  where r.status = 'active' and r.id <> new.employee_id
    and (r.id = p.manager_id or r.id = any(coalesce(_extra, '{}')))
    and public.can_view_employee(r.id, new.employee_id);
  return new;
end; $$;
drop trigger if exists leave_notify_submitted on public.leave_requests;
create trigger leave_notify_submitted after insert on public.leave_requests for each row execute function public.notify_leave_submitted();