alter table public.documents add column if not exists employee_id uuid references public.profiles(id) on delete cascade;
create index if not exists documents_employee_idx on public.documents(employee_id);

create or replace function public.can_manage_employee_docs(_actor uuid, _emp uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin(_actor) or (public.is_hr_or_admin(_actor)
    and public.can_view_employee(_actor,_emp) and public.in_company_scope(_actor,_emp))
$$;

drop policy if exists "documents view" on public.documents;
create policy "documents view" on public.documents for select to authenticated using (
  case when employee_id is null
    then public.has_permission(auth.uid(),'documents','view') and public.can_access_company(auth.uid(), company_id)
    else employee_id = auth.uid() or (public.has_permission(auth.uid(),'documents','view')
      and public.can_view_employee(auth.uid(), employee_id) and public.in_company_scope(auth.uid(), employee_id))
  end);

drop policy if exists "documents create" on public.documents;
create policy "documents create" on public.documents for insert to authenticated with check (
  uploaded_by = auth.uid() and public.has_permission(auth.uid(),'documents','create')
  and public.can_access_company(auth.uid(), company_id)
  and (employee_id is null or public.can_manage_employee_docs(auth.uid(), employee_id)));

drop policy if exists "documents edit" on public.documents;
create policy "documents edit" on public.documents for update to authenticated
using (public.has_permission(auth.uid(),'documents','edit') and public.can_access_company(auth.uid(), company_id)
  and (employee_id is null or public.can_manage_employee_docs(auth.uid(), employee_id)))
with check (public.has_permission(auth.uid(),'documents','edit') and public.can_access_company(auth.uid(), company_id)
  and (employee_id is null or public.can_manage_employee_docs(auth.uid(), employee_id)));

drop policy if exists "documents delete" on public.documents;
create policy "documents delete" on public.documents for delete to authenticated using (
  public.has_permission(auth.uid(),'documents','delete') and public.can_access_company(auth.uid(), company_id)
  and (employee_id is null or public.can_manage_employee_docs(auth.uid(), employee_id)));