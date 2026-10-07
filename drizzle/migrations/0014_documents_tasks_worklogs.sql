ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE OR REPLACE FUNCTION public.can_access_company(_actor uuid, _company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select _company is null or public.is_hr_or_admin(_actor) or public.in_company(_actor, _company)
$$;

DROP POLICY IF EXISTS "view permitted tasks" ON public.tasks;
DROP POLICY IF EXISTS "managers create tasks" ON public.tasks;
DROP POLICY IF EXISTS "managers manage tasks" ON public.tasks;
DROP POLICY IF EXISTS "managers delete tasks" ON public.tasks;
CREATE POLICY "view permitted tasks" ON public.tasks FOR SELECT TO authenticated USING (
  public.is_super_admin(auth.uid()) or assignee_id = auth.uid() or created_by = auth.uid()
  or (public.has_permission(auth.uid(),'tasks','view') and public.can_view_employee(auth.uid(), assignee_id)
      and public.in_company_scope(auth.uid(), assignee_id)));
CREATE POLICY "managers create tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin(auth.uid()) or (
    public.has_permission(auth.uid(),'tasks','create') and public.in_company_scope(auth.uid(), assignee_id)
    and (public.is_admin(auth.uid()) or (public.has_role(auth.uid(),'manager') and public.is_manager_of(auth.uid(), assignee_id)))));
CREATE POLICY "managers manage tasks" ON public.tasks FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) or (public.has_permission(auth.uid(),'tasks','edit')
    and public.in_company_scope(auth.uid(), assignee_id)
    and (public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), assignee_id))))
  WITH CHECK (public.is_super_admin(auth.uid()) or (public.has_permission(auth.uid(),'tasks','edit')
    and public.in_company_scope(auth.uid(), assignee_id)
    and (public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), assignee_id))));
CREATE POLICY "managers delete tasks" ON public.tasks FOR DELETE TO authenticated USING (
  public.is_super_admin(auth.uid()) or (public.has_permission(auth.uid(),'tasks','delete')
    and public.in_company_scope(auth.uid(), assignee_id)
    and (public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), assignee_id))));

DROP POLICY IF EXISTS "read task comments" ON public.task_comments;
DROP POLICY IF EXISTS "write task comments" ON public.task_comments;
CREATE POLICY "read task comments" ON public.task_comments FOR SELECT TO authenticated
  USING (exists (select 1 from public.tasks t where t.id = task_id));
CREATE POLICY "write task comments" ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id));

CREATE TABLE public.task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  change text not null,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.task_history TO authenticated;
GRANT ALL ON public.task_history TO service_role;
ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read task history" ON public.task_history FOR SELECT TO authenticated
  USING (exists (select 1 from public.tasks t where t.id = task_id));
CREATE INDEX task_history_task_idx ON public.task_history(task_id, created_at);

CREATE OR REPLACE FUNCTION public.log_task_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _a uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.task_history(task_id, actor_id, change) values (new.id, _a, 'Task created');
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.task_history(task_id, actor_id, change) values (new.id, _a, 'Status: ' || replace(old.status::text,'_',' ') || ' → ' || replace(new.status::text,'_',' ')); end if;
  if new.progress is distinct from old.progress then
    insert into public.task_history(task_id, actor_id, change) values (new.id, _a, 'Progress: ' || old.progress || '% → ' || new.progress || '%'); end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into public.task_history(task_id, actor_id, change) values (new.id, _a, 'Reassigned to ' || coalesce((select full_name from public.profiles where id = new.assignee_id),'—')); end if;
  if new.priority is distinct from old.priority then
    insert into public.task_history(task_id, actor_id, change) values (new.id, _a, 'Priority: ' || old.priority || ' → ' || new.priority); end if;
  if new.due_date is distinct from old.due_date then
    insert into public.task_history(task_id, actor_id, change) values (new.id, _a, 'Due date: ' || coalesce(old.due_date::text,'none') || ' → ' || coalesce(new.due_date::text,'none')); end if;
  if new.title is distinct from old.title or new.description is distinct from old.description then
    insert into public.task_history(task_id, actor_id, change) values (new.id, _a, 'Details edited'); end if;
  return new;
end; $$;
CREATE TRIGGER tasks_history AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.log_task_history();

ALTER TABLE public.daily_work_logs ADD COLUMN task_id uuid references public.tasks(id) on delete set null;
ALTER TABLE public.daily_work_logs ADD COLUMN status text check (status in ('IN_PROGRESS','COMPLETED','BLOCKED'));
DROP POLICY IF EXISTS "view permitted work logs" ON public.daily_work_logs;
DROP POLICY IF EXISTS "own work logs write" ON public.daily_work_logs;
DROP POLICY IF EXISTS "own work logs update" ON public.daily_work_logs;
DROP POLICY IF EXISTS "own work logs delete" ON public.daily_work_logs;
CREATE POLICY "view permitted work logs" ON public.daily_work_logs FOR SELECT TO authenticated USING (
  employee_id = auth.uid() or public.is_super_admin(auth.uid())
  or (public.has_permission(auth.uid(),'work_logs','view') and public.can_view_employee(auth.uid(), employee_id)
      and public.in_company_scope(auth.uid(), employee_id)));
CREATE POLICY "own work logs write" ON public.daily_work_logs FOR INSERT TO authenticated WITH CHECK (
  employee_id = auth.uid() and public.has_permission(auth.uid(),'work_logs','create')
  and log_date <= (now() at time zone 'Asia/Kolkata')::date
  and (task_id is null or exists (select 1 from public.tasks t where t.id = task_id)));
CREATE POLICY "own work logs update" ON public.daily_work_logs FOR UPDATE TO authenticated
  USING (employee_id = auth.uid() and public.has_permission(auth.uid(),'work_logs','edit'))
  WITH CHECK (employee_id = auth.uid() and log_date <= (now() at time zone 'Asia/Kolkata')::date
    and (task_id is null or exists (select 1 from public.tasks t where t.id = task_id)));
CREATE POLICY "own work logs delete" ON public.daily_work_logs FOR DELETE TO authenticated
  USING (employee_id = auth.uid() and public.has_permission(auth.uid(),'work_logs','delete'));

CREATE TABLE public.document_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  parent_id uuid references public.document_folders(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE public.documents (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.document_folders(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 255),
  file_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_folders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.document_folders TO service_role;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER document_folders_updated_at BEFORE UPDATE ON public.document_folders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX documents_folder_idx ON public.documents(folder_id);

CREATE POLICY "folders view" ON public.document_folders FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'documents','view') and public.can_access_company(auth.uid(), company_id));
CREATE POLICY "folders create" ON public.document_folders FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() and public.has_permission(auth.uid(),'documents','create') and public.can_access_company(auth.uid(), company_id));
CREATE POLICY "folders edit" ON public.document_folders FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(),'documents','edit') and public.can_access_company(auth.uid(), company_id))
  WITH CHECK (public.has_permission(auth.uid(),'documents','edit') and public.can_access_company(auth.uid(), company_id));
CREATE POLICY "folders delete" ON public.document_folders FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(),'documents','delete') and public.can_access_company(auth.uid(), company_id));

CREATE POLICY "documents view" ON public.documents FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'documents','view') and public.can_access_company(auth.uid(), company_id));
CREATE POLICY "documents create" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() and public.has_permission(auth.uid(),'documents','create') and public.can_access_company(auth.uid(), company_id));
CREATE POLICY "documents edit" ON public.documents FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(),'documents','edit') and public.can_access_company(auth.uid(), company_id))
  WITH CHECK (public.has_permission(auth.uid(),'documents','edit') and public.can_access_company(auth.uid(), company_id));
CREATE POLICY "documents delete" ON public.documents FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(),'documents','delete') and public.can_access_company(auth.uid(), company_id));

CREATE POLICY "documents files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' and exists (select 1 from public.documents d where d.file_path = name));
CREATE POLICY "documents files upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' and public.has_permission(auth.uid(),'documents','create'));
CREATE POLICY "documents files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' and public.has_permission(auth.uid(),'documents','delete'));