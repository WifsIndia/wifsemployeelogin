DROP POLICY IF EXISTS "review leave" ON public.leave_requests;
CREATE POLICY "review leave" ON public.leave_requests FOR UPDATE TO authenticated
  USING (public.is_hr_or_admin(auth.uid()) or (public.is_manager_of(auth.uid(), employee_id)
    and (not public.has_role(auth.uid(),'manager') or (public.has_permission(auth.uid(),'leave','approve') and public.in_company_scope(auth.uid(), employee_id)))));