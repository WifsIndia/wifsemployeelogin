-- ===== Enums =====
create type public.app_role as enum ('admin','hr','manager','employee');
create type public.employee_status as enum ('active','inactive');
create type public.attendance_status as enum ('checked_in','checked_out');
create type public.task_status as enum ('NOT_STARTED','IN_PROGRESS','ON_HOLD','COMPLETED');
create type public.task_priority as enum ('LOW','MEDIUM','HIGH','URGENT');
create type public.leave_status as enum ('PENDING','APPROVED','REJECTED','CANCELLED');
create type public.leave_type as enum ('CASUAL','SICK','EARNED','UNPAID','OTHER');

-- ===== Utility =====
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ===== Departments =====
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.departments to authenticated;
grant all on public.departments to service_role;
alter table public.departments enable row level security;

-- ===== Profiles =====
create table public.profiles (
  id uuid primary key,
  employee_code text unique,
  full_name text not null default '',
  email text not null default '',
  phone text,
  department_id uuid references public.departments(id) on delete set null,
  designation text,
  manager_id uuid references public.profiles(id) on delete set null,
  joining_date date,
  status public.employee_status not null default 'active',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ===== Roles =====
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id,'admin');
$$;

create or replace function public.is_hr_or_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id,'admin') or public.has_role(_user_id,'hr');
$$;

create or replace function public.is_manager_of(_manager uuid, _employee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = _employee and p.manager_id = _manager);
$$;

-- can current user view this employee's records?
create or replace function public.can_view_employee(_viewer uuid, _employee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _viewer = _employee
      or public.is_hr_or_admin(_viewer)
      or public.is_manager_of(_viewer, _employee);
$$;

-- ===== Profiles policies =====
create policy "view permitted profiles" on public.profiles for select to authenticated
  using (public.can_view_employee(auth.uid(), id));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "hr admin manage profiles" on public.profiles for all to authenticated
  using (public.is_hr_or_admin(auth.uid())) with check (public.is_hr_or_admin(auth.uid()));

-- prevent self-escalation of sensitive profile fields
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_hr_or_admin(auth.uid()) then
    new.status := old.status;
    new.manager_id := old.manager_id;
    new.department_id := old.department_id;
    new.designation := old.designation;
    new.employee_code := old.employee_code;
    new.joining_date := old.joining_date;
  end if;
  return new;
end; $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ===== Roles policies =====
create policy "read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_hr_or_admin(auth.uid()));
create policy "admin manage roles" on public.user_roles for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ===== Departments policies =====
create policy "read departments" on public.departments for select to authenticated using (true);
create policy "hr admin manage departments" on public.departments for all to authenticated
  using (public.is_hr_or_admin(auth.uid())) with check (public.is_hr_or_admin(auth.uid()));

-- ===== Office locations =====
create table public.office_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  latitude double precision,
  longitude double precision,
  radius_meters integer not null default 100 check (radius_meters between 20 and 5000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.office_locations to authenticated;
grant all on public.office_locations to service_role;
alter table public.office_locations enable row level security;
create trigger office_locations_updated_at before update on public.office_locations
  for each row execute function public.set_updated_at();
create policy "read office locations" on public.office_locations for select to authenticated using (true);
create policy "admin manage office locations" on public.office_locations for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

insert into public.office_locations (name, city, latitude, longitude, radius_meters, active)
values ('WIFS Office','Nashik', null, null, 100, true);

-- ===== Attendance =====
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  attendance_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  check_in_time timestamptz,
  check_in_latitude double precision,
  check_in_longitude double precision,
  check_in_accuracy double precision,
  check_out_time timestamptz,
  check_out_latitude double precision,
  check_out_longitude double precision,
  check_out_accuracy double precision,
  status public.attendance_status not null default 'checked_in',
  office_location_id uuid references public.office_locations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, attendance_date)
);
grant select, update on public.attendance to authenticated;
grant all on public.attendance to service_role;
alter table public.attendance enable row level security;
create trigger attendance_updated_at before update on public.attendance
  for each row execute function public.set_updated_at();
create policy "view permitted attendance" on public.attendance for select to authenticated
  using (public.can_view_employee(auth.uid(), employee_id));
create policy "admin correct attendance" on public.attendance for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- distance helper (haversine, meters)
create or replace function public.distance_meters(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2-lat1)/2),2) +
    cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lon2-lon1)/2),2)
  ));
$$;

create or replace function public.check_in(_lat double precision, _lon double precision, _accuracy double precision)
returns public.attendance language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _office public.office_locations;
  _dist double precision;
  _today date := (now() at time zone 'Asia/Kolkata')::date;
  _row public.attendance;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.profiles where id = _uid and status = 'active') then
    raise exception 'INACTIVE_EMPLOYEE';
  end if;
  select * into _office from public.office_locations where active order by created_at limit 1;
  if _office.id is null or _office.latitude is null or _office.longitude is null then
    raise exception 'OFFICE_NOT_CONFIGURED';
  end if;
  if _lat is null or _lon is null then raise exception 'LOCATION_REQUIRED'; end if;
  if _accuracy is not null and _accuracy > 200 then raise exception 'POOR_ACCURACY'; end if;
  _dist := public.distance_meters(_lat,_lon,_office.latitude,_office.longitude);
  if _dist > _office.radius_meters then raise exception 'OUTSIDE_OFFICE'; end if;
  if exists (select 1 from public.attendance where employee_id=_uid and attendance_date=_today) then
    raise exception 'ALREADY_CHECKED_IN';
  end if;
  insert into public.attendance (employee_id, attendance_date, check_in_time, check_in_latitude, check_in_longitude, check_in_accuracy, status, office_location_id)
  values (_uid,_today, now(), _lat,_lon,_accuracy,'checked_in',_office.id)
  returning * into _row;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (_uid,'ATTENDANCE_CHECK_IN','attendance',_row.id, jsonb_build_object('distance_m', round(_dist::numeric,1)));
  return _row;
end; $$;

create or replace function public.check_out(_lat double precision, _lon double precision, _accuracy double precision)
returns public.attendance language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _office public.office_locations;
  _dist double precision;
  _today date := (now() at time zone 'Asia/Kolkata')::date;
  _row public.attendance;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into _office from public.office_locations where active order by created_at limit 1;
  if _office.id is null or _office.latitude is null or _office.longitude is null then
    raise exception 'OFFICE_NOT_CONFIGURED';
  end if;
  if _lat is null or _lon is null then raise exception 'LOCATION_REQUIRED'; end if;
  if _accuracy is not null and _accuracy > 200 then raise exception 'POOR_ACCURACY'; end if;
  _dist := public.distance_meters(_lat,_lon,_office.latitude,_office.longitude);
  if _dist > _office.radius_meters then raise exception 'OUTSIDE_OFFICE'; end if;
  select * into _row from public.attendance where employee_id=_uid and attendance_date=_today;
  if _row.id is null then raise exception 'NOT_CHECKED_IN'; end if;
  if _row.status = 'checked_out' then raise exception 'ALREADY_CHECKED_OUT'; end if;
  update public.attendance set check_out_time = now(), check_out_latitude=_lat, check_out_longitude=_lon,
    check_out_accuracy=_accuracy, status='checked_out' where id=_row.id returning * into _row;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (_uid,'ATTENDANCE_CHECK_OUT','attendance',_row.id, jsonb_build_object('distance_m', round(_dist::numeric,1)));
  return _row;
end; $$;

-- ===== Projects & tasks =====
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;
create policy "read projects" on public.projects for select to authenticated using (true);
create policy "manage projects" on public.projects for all to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'manager'))
  with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'manager'));

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  project_id uuid references public.projects(id) on delete set null,
  assignee_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  priority public.task_priority not null default 'MEDIUM',
  status public.task_status not null default 'NOT_STARTED',
  progress integer not null default 0 check (progress between 0 and 100),
  start_date date,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create policy "view permitted tasks" on public.tasks for select to authenticated
  using (public.can_view_employee(auth.uid(), assignee_id) or created_by = auth.uid());
create policy "assignee updates own task" on public.tasks for update to authenticated
  using (assignee_id = auth.uid()) with check (assignee_id = auth.uid());
create policy "managers create tasks" on public.tasks for insert to authenticated
  with check (
    public.is_admin(auth.uid())
    or (public.has_role(auth.uid(),'manager') and public.is_manager_of(auth.uid(), assignee_id))
  );
create policy "managers manage tasks" on public.tasks for update to authenticated
  using (public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), assignee_id))
  with check (public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), assignee_id));
create policy "managers delete tasks" on public.tasks for delete to authenticated
  using (public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), assignee_id));

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  comment text not null,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.task_comments to authenticated;
grant all on public.task_comments to service_role;
alter table public.task_comments enable row level security;
create policy "read task comments" on public.task_comments for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id
    and (public.can_view_employee(auth.uid(), t.assignee_id) or t.created_by = auth.uid())));
create policy "write task comments" on public.task_comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id
    and (public.can_view_employee(auth.uid(), t.assignee_id) or t.created_by = auth.uid())));

-- ===== Daily work logs =====
create table public.daily_work_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  summary text not null,
  work_completed text,
  hours_worked numeric(4,1) check (hours_worked >= 0 and hours_worked <= 24),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, log_date)
);
grant select, insert, update, delete on public.daily_work_logs to authenticated;
grant all on public.daily_work_logs to service_role;
alter table public.daily_work_logs enable row level security;
create trigger work_logs_updated_at before update on public.daily_work_logs
  for each row execute function public.set_updated_at();
create policy "view permitted work logs" on public.daily_work_logs for select to authenticated
  using (public.can_view_employee(auth.uid(), employee_id));
create policy "own work logs write" on public.daily_work_logs for insert to authenticated
  with check (employee_id = auth.uid());
create policy "own work logs update" on public.daily_work_logs for update to authenticated
  using (employee_id = auth.uid()) with check (employee_id = auth.uid());
create policy "own work logs delete" on public.daily_work_logs for delete to authenticated
  using (employee_id = auth.uid());

-- ===== Leave =====
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  leave_type public.leave_type not null default 'CASUAL',
  start_date date not null,
  end_date date not null,
  reason text,
  status public.leave_status not null default 'PENDING',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
grant select, insert, update on public.leave_requests to authenticated;
grant all on public.leave_requests to service_role;
alter table public.leave_requests enable row level security;
create trigger leave_updated_at before update on public.leave_requests
  for each row execute function public.set_updated_at();
create policy "view permitted leave" on public.leave_requests for select to authenticated
  using (public.can_view_employee(auth.uid(), employee_id));
create policy "apply for leave" on public.leave_requests for insert to authenticated
  with check (employee_id = auth.uid());
create policy "cancel own leave" on public.leave_requests for update to authenticated
  using (employee_id = auth.uid() and status = 'PENDING') with check (employee_id = auth.uid());
create policy "review leave" on public.leave_requests for update to authenticated
  using (public.is_hr_or_admin(auth.uid()) or public.is_manager_of(auth.uid(), employee_id))
  with check (public.is_hr_or_admin(auth.uid()) or public.is_manager_of(auth.uid(), employee_id));

-- ===== Announcements =====
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.announcements to authenticated;
grant all on public.announcements to service_role;
alter table public.announcements enable row level security;
create policy "read announcements" on public.announcements for select to authenticated using (true);
create policy "hr admin manage announcements" on public.announcements for all to authenticated
  using (public.is_hr_or_admin(auth.uid())) with check (public.is_hr_or_admin(auth.uid()));

-- ===== Notifications =====
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "read own notifications" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "update own notifications" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "create notifications" on public.notifications for insert to authenticated
  with check (public.is_hr_or_admin(auth.uid()) or public.has_role(auth.uid(),'manager'));

-- ===== Audit logs =====
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "admin read audit logs" on public.audit_logs for select to authenticated
  using (public.is_admin(auth.uid()));
create policy "insert own audit logs" on public.audit_logs for insert to authenticated
  with check (actor_id = auth.uid());

-- ===== New user handling =====
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare _is_first boolean;
begin
  select not exists (select 1 from public.profiles) into _is_first;
  insert into public.profiles (id, full_name, email, phone)
  values (new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    coalesce(new.email,''),
    new.raw_user_meta_data->>'phone');
  insert into public.user_roles (user_id, role)
  values (new.id, case when _is_first then 'admin'::public.app_role else 'employee'::public.app_role end);
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- notification on task assignment
create or replace function public.notify_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, title, body, link)
  values (new.assignee_id, 'New task assigned', new.title, '/tasks');
  return new;
end; $$;
create trigger tasks_notify after insert on public.tasks
  for each row execute function public.notify_task_assigned();

create or replace function public.notify_leave_reviewed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('APPROVED','REJECTED') then
    insert into public.notifications (user_id, title, body, link)
    values (new.employee_id, 'Leave ' || lower(new.status::text), coalesce(new.review_note, new.start_date::text || ' to ' || new.end_date::text), '/leave');
  end if;
  return new;
end; $$;
create trigger leave_notify after update on public.leave_requests
  for each row execute function public.notify_leave_reviewed();

insert into public.departments (name) values ('Operations'),('Finance'),('Human Resources'),('Field Services');
