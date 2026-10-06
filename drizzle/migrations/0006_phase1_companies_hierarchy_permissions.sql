ALTER TABLE public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_module_check;
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_module_check CHECK (module IN (
  'dashboard','staff','attendance','leave','payroll','locations','reports','settings','roles',
  'employees','tasks','work_logs','documents','announcements','notifications','companies','business_activity','audit_logs'));

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies read" ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "companies super admin write" ON public.companies FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE public.user_companies (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_companies TO authenticated;
GRANT ALL ON public.user_companies TO service_role;
ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_in_hierarchy(_supervisor uuid, _employee uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  with recursive chain(id, depth) as (
    select manager_id, 1 from public.profiles where id = _employee
    union all
    select p.manager_id, c.depth + 1 from public.profiles p join chain c on p.id = c.id
    where c.depth < 10 and c.id is not null
  )
  select exists (select 1 from chain where id = _supervisor);
$$;

CREATE OR REPLACE FUNCTION public.shares_company(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.user_companies x join public.user_companies y on x.company_id = y.company_id
    where x.user_id = _a and y.user_id = _b);
$$;

CREATE OR REPLACE FUNCTION public.in_company(_user uuid, _company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.user_companies where user_id = _user and company_id = _company);
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user uuid, _module text, _action text DEFAULT 'view')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select public.is_super_admin(_user) or exists (
    select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id and r.active
    where rp.module = _module
      and (r.base_role in (select role from public.user_roles where user_id = _user)
           or r.id = (select custom_role_id from public.profiles where id = _user))
      and case _action when 'view' then rp.can_view when 'create' then rp.can_create when 'edit' then rp.can_edit
        when 'delete' then rp.can_delete when 'approve' then rp.can_approve else false end);
$$;

CREATE OR REPLACE FUNCTION public.can_view_employee(_viewer uuid, _employee uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select _viewer = _employee
      or public.is_hr_or_admin(_viewer)
      or public.is_manager_of(_viewer, _employee)
      or public.is_in_hierarchy(_viewer, _employee);
$$;

CREATE POLICY "user_companies read" ON public.user_companies FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_view_employee(auth.uid(), user_id));
CREATE POLICY "user_companies admin write" ON public.user_companies FOR ALL TO authenticated
  USING (public.is_hr_or_admin(auth.uid())) WITH CHECK (public.is_hr_or_admin(auth.uid()));

INSERT INTO public.roles (name, description, base_role, is_system, active) VALUES
  ('ADO', 'Area Development Officer — supervises assigned agents', 'ado', true, true),
  ('Agent', 'Field agent assigned to an ADO', 'agent', true, true)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete, can_approve)
SELECT r.id, m.module,
  CASE WHEN r.base_role IN ('super_admin','admin') THEN true
       WHEN r.base_role = 'hr' THEN m.module NOT IN ('companies','audit_logs')
       ELSE m.module IN ('tasks','work_logs','announcements','notifications','documents','business_activity') END,
  r.base_role IN ('super_admin','admin') OR (r.base_role IN ('hr','manager','ado') AND m.module IN ('tasks','announcements')) OR m.module = 'work_logs',
  r.base_role IN ('super_admin','admin') OR (r.base_role IN ('hr','manager','ado') AND m.module = 'tasks') OR m.module = 'work_logs',
  r.base_role IN ('super_admin','admin') AND m.module <> 'audit_logs',
  r.base_role IN ('super_admin','admin')
FROM public.roles r
CROSS JOIN (VALUES ('employees'),('tasks'),('work_logs'),('documents'),('announcements'),('notifications'),('companies'),('business_activity'),('audit_logs')) m(module)
WHERE r.base_role IS NOT NULL
ON CONFLICT (role_id, module) DO NOTHING;

INSERT INTO public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete, can_approve)
SELECT r.id, m.module, true, m.module IN ('attendance','leave'), false, false, false
FROM public.roles r CROSS JOIN (VALUES ('dashboard'),('attendance'),('leave')) m(module)
WHERE r.base_role IN ('ado','agent')
ON CONFLICT (role_id, module) DO NOTHING;