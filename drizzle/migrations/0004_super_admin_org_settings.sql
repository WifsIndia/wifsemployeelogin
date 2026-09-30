create or replace function public.is_super_admin(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id,'super_admin');
$$;
create or replace function public.is_admin(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id,'admin') or public.has_role(_user_id,'super_admin');
$$;
create or replace function public.is_hr_or_admin(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id,'admin') or public.has_role(_user_id,'hr') or public.has_role(_user_id,'super_admin');
$$;

create table public.organization_settings (
  id boolean primary key default true check (id),
  name text not null default 'WIFS India',
  logo_url text, address text, city text default 'Nashik', state text default 'Maharashtra',
  country text default 'India', pin_code text, phone text, email text, website text default 'https://www.wifsindia.com',
  timezone text not null default 'Asia/Kolkata', currency text not null default 'INR',
  working_days int[] not null default '{1,2,3,4,5,6}',
  office_start time not null default '09:30', office_end time not null default '18:30',
  grace_minutes int not null default 10,
  early_departure_grace_minutes int not null default 10,
  full_day_hours numeric not null default 8,
  half_day_hours numeric not null default 4,
  overtime_enabled boolean not null default true,
  overtime_after_minutes int not null default 30,
  salary_divisor_mode text not null default 'fixed' check (salary_divisor_mode in ('fixed','calendar','working_days')),
  salary_fixed_divisor int not null default 26 check (salary_fixed_divisor > 0),
  date_format text not null default 'dd MMM yyyy',
  audit_retention_days int not null default 365,
  updated_at timestamptz not null default now()
);
grant select, update on public.organization_settings to authenticated;
grant all on public.organization_settings to service_role;
alter table public.organization_settings enable row level security;
create policy "read org settings" on public.organization_settings for select to authenticated using (true);
create policy "super admin update org settings" on public.organization_settings for update to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));
insert into public.organization_settings default values;
create trigger org_settings_updated_at before update on public.organization_settings for each row execute function public.set_updated_at();

alter table public.office_locations add column if not exists address text, add column if not exists state text,
  add column if not exists pin_code text, add column if not exists phone text, add column if not exists email text;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  base_role public.app_role unique,
  is_system boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.roles to authenticated;
grant all on public.roles to service_role;
alter table public.roles enable row level security;
create policy "read roles" on public.roles for select to authenticated using (true);
create policy "super admin manage roles" on public.roles for all to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  module text not null check (module in ('dashboard','staff','attendance','leave','payroll','locations','reports','settings','roles')),
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_approve boolean not null default false,
  primary key (role_id, module)
);
grant select, insert, update, delete on public.role_permissions to authenticated;
grant all on public.role_permissions to service_role;
alter table public.role_permissions enable row level security;
create policy "read role permissions" on public.role_permissions for select to authenticated using (true);
create policy "super admin manage role permissions" on public.role_permissions for all to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

insert into public.roles (name, description, base_role, is_system) values
  ('Super Admin','Full access to everything','super_admin',true),
  ('Admin','Organization administrator','admin',true),
  ('HR','Human resources','hr',true),
  ('Manager','Team manager','manager',true),
  ('Employee','Standard staff member','employee',true);

insert into public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete, can_approve)
select r.id, m.module,
  case r.base_role when 'super_admin' then true
    when 'admin' then m.module not in ('payroll','roles','settings')
    when 'hr' then m.module in ('dashboard','staff','attendance','leave','reports')
    when 'manager' then m.module in ('dashboard','staff','attendance','leave','reports')
    else m.module in ('dashboard','attendance','leave') end,
  case r.base_role when 'super_admin' then true
    when 'admin' then m.module in ('staff','locations','leave')
    when 'hr' then m.module in ('staff','leave')
    else m.module = 'leave' end,
  case r.base_role when 'super_admin' then true
    when 'admin' then m.module in ('staff','locations','attendance')
    when 'hr' then m.module = 'staff' else false end,
  r.base_role = 'super_admin',
  case r.base_role when 'employee' then false when 'super_admin' then true else m.module = 'leave' end
from public.roles r
cross join (values ('dashboard'),('staff'),('attendance'),('leave'),('payroll'),('locations'),('reports'),('settings'),('roles')) as m(module);

alter table public.profiles add column if not exists location_id uuid references public.office_locations(id) on delete set null,
  add column if not exists employment_type text not null default 'full_time',
  add column if not exists custom_role_id uuid references public.roles(id) on delete set null;

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_hr_or_admin(auth.uid()) then
    new.status := old.status; new.manager_id := old.manager_id; new.department_id := old.department_id;
    new.designation := old.designation; new.employee_code := old.employee_code; new.joining_date := old.joining_date;
    new.location_id := old.location_id; new.employment_type := old.employment_type; new.custom_role_id := old.custom_role_id;
  elsif not public.is_super_admin(auth.uid()) then
    new.custom_role_id := old.custom_role_id;
  end if;
  return new;
end; $$;

create table public.employee_compensation (
  employee_id uuid primary key references public.profiles(id) on delete cascade,
  basic_salary numeric not null default 0 check (basic_salary >= 0),
  allowances numeric not null default 0 check (allowances >= 0),
  deductions numeric not null default 0 check (deductions >= 0),
  payment_mode text not null default 'bank',
  bank_name text, account_holder text, account_number text, ifsc text, upi_id text,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.employee_compensation to authenticated;
grant all on public.employee_compensation to service_role;
alter table public.employee_compensation enable row level security;
create policy "super admin manage compensation" on public.employee_compensation for all to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));
create trigger compensation_updated_at before update on public.employee_compensation for each row execute function public.set_updated_at();

create table public.leave_policies (
  leave_type public.leave_type primary key,
  label text not null,
  days_per_year numeric not null default 0 check (days_per_year >= 0),
  is_paid boolean not null default true,
  carry_forward boolean not null default false,
  max_carry_forward numeric not null default 0 check (max_carry_forward >= 0),
  requires_approval boolean not null default true,
  approver text not null default 'manager' check (approver in ('manager','hr','admin','super_admin')),
  min_notice_days int not null default 0 check (min_notice_days >= 0),
  allow_half_day boolean not null default true,
  active boolean not null default true
);
grant select, insert, update, delete on public.leave_policies to authenticated;
grant all on public.leave_policies to service_role;
alter table public.leave_policies enable row level security;
create policy "read leave policies" on public.leave_policies for select to authenticated using (true);
create policy "super admin manage leave policies" on public.leave_policies for all to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));
insert into public.leave_policies (leave_type,label,days_per_year,is_paid,carry_forward,max_carry_forward,min_notice_days) values
  ('CASUAL','Casual leave',12,true,false,0,1),
  ('SICK','Sick leave',8,true,false,0,0),
  ('EARNED','Annual / earned leave',15,true,true,30,7),
  ('UNPAID','Unpaid leave',0,false,false,0,1),
  ('OTHER','Other leave',0,true,false,0,1),
  ('EMERGENCY','Emergency leave',3,true,false,0,0);

alter table public.leave_requests add column if not exists half_day boolean not null default false,
  add column if not exists days numeric;

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null,
  holiday_type text not null default 'public' check (holiday_type in ('public','national','festival','company','optional')),
  mandatory boolean not null default true,
  location_id uuid references public.office_locations(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.holidays to authenticated;
grant all on public.holidays to service_role;
alter table public.holidays enable row level security;
create policy "read holidays" on public.holidays for select to authenticated using (true);
create policy "super admin manage holidays" on public.holidays for all to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));
insert into public.holidays (holiday_date,name,holiday_type) values
  ('2026-01-26','Republic Day','national'),('2026-08-15','Independence Day','national'),('2026-10-02','Gandhi Jayanti','national');

create or replace function public.working_day_count(_start date, _end date, _location uuid default null) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare _wd int[];
begin
  select working_days into _wd from public.organization_settings limit 1;
  _wd := coalesce(_wd, '{1,2,3,4,5,6}'::int[]);
  return (select count(*)::numeric from generate_series(_start, _end, interval '1 day') g(d)
    where extract(dow from g.d)::int = any(_wd)
      and not exists (select 1 from public.holidays h where h.active and h.mandatory and h.holiday_date = g.d::date
        and (h.location_id is null or h.location_id = _location)));
end; $$;

create or replace function public.leave_balances(_employee uuid)
returns table(leave_type public.leave_type, label text, entitled numeric, carried numeric, used numeric, pending numeric, available numeric)
language plpgsql stable security definer set search_path = public as $$
declare _y int := extract(year from (now() at time zone 'Asia/Kolkata'))::int;
begin
  if auth.uid() is not null and not public.can_view_employee(auth.uid(), _employee) then return; end if;
  return query
  select x.leave_type, x.label, x.entitled, x.carried, x.used, x.pending, x.entitled + x.carried - x.used - x.pending
  from (
    select p.leave_type, p.label, p.days_per_year as entitled,
      case when p.carry_forward then least(p.max_carry_forward, greatest(0, p.days_per_year - coalesce((
        select sum(coalesce(l.days,0)) from public.leave_requests l where l.employee_id=_employee and l.leave_type=p.leave_type
          and l.status='APPROVED' and extract(year from l.start_date)=_y-1),0))) else 0 end as carried,
      coalesce((select sum(coalesce(l.days,0)) from public.leave_requests l where l.employee_id=_employee and l.leave_type=p.leave_type
          and l.status='APPROVED' and extract(year from l.start_date)=_y),0) as used,
      coalesce((select sum(coalesce(l.days,0)) from public.leave_requests l where l.employee_id=_employee and l.leave_type=p.leave_type
          and l.status='PENDING' and extract(year from l.start_date)=_y),0) as pending
    from public.leave_policies p where p.active
  ) x;
end; $$;

create or replace function public.leave_validate_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare _p public.leave_policies; _tz text; _today date; _loc uuid; _avail numeric;
begin
  select * into _p from public.leave_policies where leave_type = new.leave_type;
  if _p.leave_type is null or not _p.active then raise exception 'LEAVE_TYPE_DISABLED'; end if;
  if new.end_date < new.start_date then raise exception 'INVALID_DATES'; end if;
  if new.half_day and (not _p.allow_half_day or new.start_date <> new.end_date) then raise exception 'HALF_DAY_NOT_ALLOWED'; end if;
  select timezone into _tz from public.organization_settings limit 1;
  _today := (now() at time zone coalesce(_tz,'Asia/Kolkata'))::date;
  if new.start_date - _today < _p.min_notice_days then raise exception 'NOTICE_REQUIRED:%', _p.min_notice_days; end if;
  select location_id into _loc from public.profiles where id = new.employee_id;
  new.days := case when new.half_day then 0.5 else public.working_day_count(new.start_date, new.end_date, _loc) end;
  if new.days <= 0 then raise exception 'NO_WORKING_DAYS'; end if;
  if _p.is_paid and _p.days_per_year > 0 then
    select b.available into _avail from public.leave_balances(new.employee_id) b where b.leave_type = new.leave_type;
    if coalesce(_avail,0) < new.days then raise exception 'INSUFFICIENT_BALANCE'; end if;
  end if;
  new.status := case when _p.requires_approval then 'PENDING'::public.leave_status else 'APPROVED'::public.leave_status end;
  new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
  return new;
end; $$;
create trigger leave_validate before insert on public.leave_requests for each row execute function public.leave_validate_insert();

create or replace function public.guard_leave_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare _approver text; _ok boolean;
begin
  if public.is_hr_or_admin(auth.uid()) or public.is_manager_of(auth.uid(), old.employee_id) then
    if new.status is distinct from old.status and new.status in ('APPROVED','REJECTED') then
      select approver into _approver from public.leave_policies where leave_type = old.leave_type;
      _ok := case coalesce(_approver,'manager')
        when 'manager' then true
        when 'hr' then public.is_hr_or_admin(auth.uid())
        when 'admin' then public.is_admin(auth.uid())
        else public.is_super_admin(auth.uid()) end;
      if not _ok then raise exception 'NOT_ALLOWED_APPROVER'; end if;
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
    end if;
    new.employee_id := old.employee_id;
    return new;
  end if;
  if new.status is distinct from old.status and new.status <> 'CANCELLED' then raise exception 'NOT_ALLOWED'; end if;
  new.employee_id := old.employee_id; new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at; new.review_note := old.review_note;
  return new;
end; $$;

alter table public.attendance add column if not exists late_minutes int, add column if not exists early_departure_minutes int,
  add column if not exists overtime_minutes int, add column if not exists worked_minutes int, add column if not exists day_status text;

create or replace function public.compute_attendance_metrics() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.organization_settings; _in timestamp; _out timestamp; _m int;
begin
  select * into s from public.organization_settings limit 1;
  if s.id is null then return new; end if;
  if new.check_in_time is not null then
    _in := new.check_in_time at time zone s.timezone;
    _m := floor(extract(epoch from (_in - (new.attendance_date + s.office_start))) / 60);
    new.late_minutes := case when _m > s.grace_minutes then _m else 0 end;
  end if;
  if new.check_in_time is not null and new.check_out_time is not null then
    _out := new.check_out_time at time zone s.timezone;
    _m := floor(extract(epoch from ((new.attendance_date + s.office_end) - _out)) / 60);
    new.early_departure_minutes := case when _m > s.early_departure_grace_minutes then _m else 0 end;
    new.worked_minutes := floor(extract(epoch from (new.check_out_time - new.check_in_time)) / 60);
    _m := new.worked_minutes - (s.full_day_hours * 60)::int;
    new.overtime_minutes := case when s.overtime_enabled and _m >= s.overtime_after_minutes then _m else 0 end;
    new.day_status := case when new.worked_minutes >= s.full_day_hours * 60 then 'full_day'
      when new.worked_minutes >= s.half_day_hours * 60 then 'half_day' else 'short' end;
  end if;
  return new;
end; $$;
create trigger attendance_metrics before insert or update on public.attendance for each row execute function public.compute_attendance_metrics();

create or replace function public.calculate_salary(_employee uuid, _month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.organization_settings; c public.employee_compensation; _loc uuid; _name text;
  _ms date := date_trunc('month', _month)::date; _me date; _working numeric; _divisor numeric;
  _unpaid numeric := 0; _paid numeric := 0; _hol int; _gross numeric; _daily numeric; _ded numeric; r record; _d numeric;
begin
  if not public.is_super_admin(auth.uid()) then raise exception 'NOT_ALLOWED'; end if;
  _me := (_ms + interval '1 month' - interval '1 day')::date;
  select * into s from public.organization_settings limit 1;
  select * into c from public.employee_compensation where employee_id = _employee;
  select location_id, full_name into _loc, _name from public.profiles where id = _employee;
  _working := public.working_day_count(_ms, _me, _loc);
  select count(*) into _hol from public.holidays h where h.active and h.mandatory and h.holiday_date between _ms and _me
    and (h.location_id is null or h.location_id = _loc)
    and extract(dow from h.holiday_date)::int = any(s.working_days);
  _divisor := case s.salary_divisor_mode when 'fixed' then s.salary_fixed_divisor
    when 'calendar' then extract(day from _me) else greatest(_working,1) end;
  for r in select l.start_date, l.end_date, l.half_day, p.is_paid from public.leave_requests l join public.leave_policies p on p.leave_type = l.leave_type
    where l.employee_id = _employee and l.status = 'APPROVED' and l.start_date <= _me and l.end_date >= _ms loop
    _d := case when r.half_day then 0.5 else public.working_day_count(greatest(r.start_date,_ms), least(r.end_date,_me), _loc) end;
    if r.is_paid then _paid := _paid + _d; else _unpaid := _unpaid + _d; end if;
  end loop;
  _gross := coalesce(c.basic_salary,0) + coalesce(c.allowances,0);
  _daily := round(_gross / _divisor, 2);
  _ded := round(_daily * _unpaid, 2);
  return jsonb_build_object('employee_id', _employee, 'full_name', _name, 'month', _ms,
    'basic_salary', coalesce(c.basic_salary,0), 'allowances', coalesce(c.allowances,0), 'gross_salary', _gross,
    'working_days', _working, 'holidays', _hol, 'divisor_mode', s.salary_divisor_mode, 'divisor', _divisor,
    'daily_salary', _daily, 'paid_leave_days', _paid, 'unpaid_leave_days', _unpaid,
    'unpaid_deduction', _ded, 'other_deductions', coalesce(c.deductions,0),
    'net_salary', round(_gross - _ded - coalesce(c.deductions,0), 2), 'currency', s.currency);
end; $$;

create or replace function public.calculate_payroll(_month date) returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
declare p record;
begin
  if not public.is_super_admin(auth.uid()) then raise exception 'NOT_ALLOWED'; end if;
  for p in select id from public.profiles where status = 'active' order by full_name loop
    return next public.calculate_salary(p.id, _month);
  end loop;
end; $$;

create or replace function public.my_permissions()
returns table(module text, can_view boolean, can_create boolean, can_edit boolean, can_delete boolean, can_approve boolean)
language sql stable security definer set search_path = public as $$
  select rp.module, bool_or(rp.can_view), bool_or(rp.can_create), bool_or(rp.can_edit), bool_or(rp.can_delete), bool_or(rp.can_approve)
  from public.role_permissions rp join public.roles r on r.id = rp.role_id and r.active
  where r.base_role in (select role from public.user_roles where user_id = auth.uid())
     or r.id = (select custom_role_id from public.profiles where id = auth.uid())
  group by rp.module;
$$;

create or replace function public.guard_super_admin_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if ((tg_op <> 'DELETE' and new.role = 'super_admin') or (tg_op <> 'INSERT' and old.role = 'super_admin'))
     and auth.uid() is not null and not public.is_super_admin(auth.uid()) then
    raise exception 'ONLY_SUPER_ADMIN';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
create trigger user_roles_super_admin_guard before insert or update or delete on public.user_roles
  for each row execute function public.guard_super_admin_role();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare _is_first boolean;
begin
  select not exists (select 1 from public.profiles) into _is_first;
  insert into public.profiles (id, full_name, email, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), coalesce(new.email,''), new.raw_user_meta_data->>'phone');
  if _is_first then
    insert into public.user_roles (user_id, role) values (new.id,'super_admin'), (new.id,'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id,'employee');
  end if;
  return new;
end; $$;

insert into public.user_roles (user_id, role)
select ur.user_id, 'super_admin' from public.user_roles ur join public.profiles p on p.id = ur.user_id
where ur.role = 'admin' and not exists (select 1 from public.user_roles where role = 'super_admin')
order by p.created_at limit 1;