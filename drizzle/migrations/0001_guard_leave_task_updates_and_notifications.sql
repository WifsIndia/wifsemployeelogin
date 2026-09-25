create or replace function public.guard_leave_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_hr_or_admin(auth.uid()) or public.is_manager_of(auth.uid(), old.employee_id) then
    if new.status is distinct from old.status and new.status in ('APPROVED','REJECTED') then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    new.employee_id := old.employee_id;
    return new;
  end if;
  -- employee on own request: may only cancel
  if new.status is distinct from old.status and new.status <> 'CANCELLED' then
    raise exception 'NOT_ALLOWED';
  end if;
  new.employee_id := old.employee_id;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.review_note := old.review_note;
  return new;
end; $$;
drop trigger if exists leave_guard on public.leave_requests;
create trigger leave_guard before update on public.leave_requests for each row execute function public.guard_leave_update();

create or replace function public.guard_task_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), old.assignee_id) then
    return new;
  end if;
  -- assignee: only status and progress
  new.title := old.title; new.description := old.description; new.project_id := old.project_id;
  new.assignee_id := old.assignee_id; new.created_by := old.created_by; new.priority := old.priority;
  new.start_date := old.start_date; new.due_date := old.due_date;
  if new.progress < 0 then new.progress := 0; end if;
  if new.progress > 100 then new.progress := 100; end if;
  return new;
end; $$;
drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before update on public.tasks for each row execute function public.guard_task_update();

create or replace function public.notify_task_updated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.status is distinct from old.status or new.progress is distinct from old.progress) then
    if new.created_by is not null and new.created_by <> auth.uid() then
      insert into public.notifications (user_id, title, body, link)
      values (new.created_by, 'Task updated', new.title || ' — ' || replace(new.status::text,'_',' ') || ' (' || new.progress || '%)', '/tasks');
    end if;
    if new.assignee_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
      insert into public.notifications (user_id, title, body, link)
      values (new.assignee_id, 'Task updated', new.title, '/tasks');
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists tasks_notify_update on public.tasks;
create trigger tasks_notify_update after update on public.tasks for each row execute function public.notify_task_updated();

create or replace function public.notify_announcement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active and (tg_op = 'INSERT' or not old.active) then
    insert into public.notifications (user_id, title, body, link)
    select p.id, 'New announcement', new.title, '/announcements' from public.profiles p where p.status = 'active';
  end if;
  return new;
end; $$;
drop trigger if exists announcements_notify on public.announcements;
create trigger announcements_notify after insert or update on public.announcements for each row execute function public.notify_announcement();

-- let managers see their team members' roles-free profile of manager chain: allow anyone to read the name of their own manager
create or replace function public.can_view_employee(_viewer uuid, _employee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _viewer = _employee
      or public.is_hr_or_admin(_viewer)
      or public.is_manager_of(_viewer, _employee)
      or exists (select 1 from public.profiles p where p.id = _viewer and p.manager_id = _employee);
$$;