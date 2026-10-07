-- Managers: see their whole reporting line, but only within their company access.
CREATE OR REPLACE FUNCTION public.can_view_employee(_viewer uuid, _employee uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select _viewer = _employee
      or public.is_hr_or_admin(_viewer)
      or ((public.is_manager_of(_viewer, _employee) or public.is_in_hierarchy(_viewer, _employee))
          and (not public.has_role(_viewer,'manager') or public.in_company_scope(_viewer, _employee)));
$$;

-- Leave review: managers need the Leave "approve" permission and company scope; others unchanged.
DROP POLICY IF EXISTS "review leave" ON public.leave_requests;
CREATE POLICY "review leave" ON public.leave_requests FOR UPDATE TO authenticated
  USING (public.is_hr_or_admin(auth.uid()) or (
    (public.is_manager_of(auth.uid(), employee_id)
      and (not public.has_role(auth.uid(),'manager') or (public.has_permission(auth.uid(),'leave','approve') and public.in_company_scope(auth.uid(), employee_id))))
    or (public.has_role(auth.uid(),'manager') and public.has_permission(auth.uid(),'leave','approve')
      and public.is_in_hierarchy(auth.uid(), employee_id) and public.in_company_scope(auth.uid(), employee_id))));