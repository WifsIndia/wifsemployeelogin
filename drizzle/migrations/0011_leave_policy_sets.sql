CREATE TABLE public.leave_policy_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  working_days smallint[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.leave_policy_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.leave_policy_sets(id) ON DELETE CASCADE,
  name text NOT NULL,
  base_type leave_type,
  days_per_year numeric NOT NULL DEFAULT 0,
  is_paid boolean NOT NULL DEFAULT true,
  allow_half_day boolean NOT NULL DEFAULT true,
  min_notice_days integer NOT NULL DEFAULT 0,
  carry_forward boolean NOT NULL DEFAULT false,
  max_carry_forward numeric NOT NULL DEFAULT 0,
  requires_approval boolean NOT NULL DEFAULT true,
  approver text NOT NULL DEFAULT 'manager',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_policy_sets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_policy_types TO authenticated;
GRANT ALL ON public.leave_policy_sets TO service_role;
GRANT ALL ON public.leave_policy_types TO service_role;
ALTER TABLE public.leave_policy_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_policy_types ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_leave_policies(_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select public.is_super_admin(_actor) or (public.has_role(_actor,'admin') and public.has_permission(_actor,'leave','edit'))
$$;
CREATE OR REPLACE FUNCTION public.can_assign_leave_policy(_actor uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select public.is_super_admin(_actor) or (
    _actor <> _target and public.has_role(_actor,'admin') and public.has_permission(_actor,'leave','edit')
    and (public.shares_company(_actor,_target) or not exists (select 1 from public.user_companies where user_id = _target))
  )
$$;

CREATE POLICY "read leave policy sets" ON public.leave_policy_sets FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage leave policy sets" ON public.leave_policy_sets FOR ALL TO authenticated
  USING (public.can_manage_leave_policies(auth.uid())) WITH CHECK (public.can_manage_leave_policies(auth.uid()));
CREATE POLICY "read leave policy types" ON public.leave_policy_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage leave policy types" ON public.leave_policy_types FOR ALL TO authenticated
  USING (public.can_manage_leave_policies(auth.uid())) WITH CHECK (public.can_manage_leave_policies(auth.uid()));
CREATE TRIGGER leave_policy_sets_updated BEFORE UPDATE ON public.leave_policy_sets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS leave_policy_id uuid REFERENCES public.leave_policy_sets(id) ON DELETE SET NULL;

-- Backfill: existing global policy becomes "Default Policy", assigned to everyone.
INSERT INTO public.leave_policy_sets (name, description, working_days)
SELECT 'Default Policy', 'Migrated from the original leave settings',
  coalesce((select array(select unnest(working_days)::smallint) from public.organization_settings limit 1), '{1,2,3,4,5,6}');
INSERT INTO public.leave_policy_types (policy_id, name, base_type, days_per_year, is_paid, allow_half_day, min_notice_days, carry_forward, max_carry_forward, requires_approval, approver, active)
SELECT s.id, lp.label, lp.leave_type, lp.days_per_year, lp.is_paid, lp.allow_half_day, lp.min_notice_days, lp.carry_forward, lp.max_carry_forward, lp.requires_approval, lp.approver, lp.active
FROM public.leave_policies lp CROSS JOIN public.leave_policy_sets s WHERE s.name = 'Default Policy';
UPDATE public.profiles SET leave_policy_id = (select id from public.leave_policy_sets where name = 'Default Policy') WHERE leave_policy_id IS NULL;
COMMENT ON TABLE public.leave_policies IS 'LEGACY: still read by current leave request validation; per-employee rules now live in leave_policy_sets/leave_policy_types.';

CREATE OR REPLACE FUNCTION public.guard_profile_update()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.is_hr_or_admin(auth.uid()) then
    new.status := old.status; new.manager_id := old.manager_id; new.department_id := old.department_id;
    new.designation := old.designation; new.employee_code := old.employee_code; new.joining_date := old.joining_date;
    new.location_id := old.location_id; new.employment_type := old.employment_type; new.custom_role_id := old.custom_role_id;
  elsif not public.is_super_admin(auth.uid()) then
    new.custom_role_id := old.custom_role_id;
  end if;
  if new.leave_policy_id is distinct from old.leave_policy_id and auth.uid() is not null
     and not public.can_assign_leave_policy(auth.uid(), new.id) then
    raise exception 'NOT_ALLOWED_LEAVE_POLICY';
  end if;
  return new;
end; $function$;