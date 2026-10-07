alter table public.role_permissions drop constraint role_permissions_module_check;
alter table public.role_permissions add constraint role_permissions_module_check check (module = any (array['dashboard','staff','attendance','leave','payroll','locations','reports','settings','roles','employees','tasks','work_logs','documents','announcements','notifications','companies','business_activity','audit_logs','useful_links']));

create table public.useful_links (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  url text not null check (url ~* '^https?://'),
  roles public.app_role[] not null default '{}',
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.useful_links to authenticated;
grant all on public.useful_links to service_role;
alter table public.useful_links enable row level security;
create trigger useful_links_updated_at before update on public.useful_links for each row execute function public.set_updated_at();

create policy "useful links view" on public.useful_links for select to authenticated using (
  public.has_permission(auth.uid(),'useful_links','edit')
  or (active and public.has_permission(auth.uid(),'useful_links','view')
      and (public.is_super_admin(auth.uid()) or roles && array(select role from public.user_roles where user_id = auth.uid()))));
create policy "useful links create" on public.useful_links for insert to authenticated
  with check (public.has_permission(auth.uid(),'useful_links','create'));
create policy "useful links edit" on public.useful_links for update to authenticated
  using (public.has_permission(auth.uid(),'useful_links','edit'))
  with check (public.has_permission(auth.uid(),'useful_links','edit'));
create policy "useful links delete" on public.useful_links for delete to authenticated
  using (public.has_permission(auth.uid(),'useful_links','delete'));

insert into public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete, can_approve)
select r.id, 'useful_links', true,
  r.base_role in ('super_admin','admin','hr','manager'), r.base_role in ('super_admin','admin','hr','manager'),
  r.base_role in ('super_admin','admin','hr','manager'), false
from public.roles r where r.base_role is not null
on conflict do nothing;