DROP POLICY IF EXISTS "companies read" ON public.companies;
CREATE POLICY "companies read" ON public.companies FOR SELECT TO authenticated
  USING (public.is_hr_or_admin(auth.uid()) OR public.in_company(auth.uid(), id));
DROP POLICY IF EXISTS "user_companies admin write" ON public.user_companies;
CREATE POLICY "user_companies admin write" ON public.user_companies FOR ALL TO authenticated
  USING (public.is_hr_or_admin(auth.uid()) AND user_id <> auth.uid() OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_hr_or_admin(auth.uid()) AND user_id <> auth.uid() OR public.is_super_admin(auth.uid()));