ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
COMMENT ON COLUMN public.profiles.deleted_at IS 'Soft delete: employee removed from the directory; records kept for attendance, payroll and audit history.';

CREATE OR REPLACE FUNCTION public.delete_employee(_emp uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF _emp = _actor THEN RAISE EXCEPTION 'You cannot delete your own account.'; END IF;
  IF public.is_super_admin(_emp) THEN RAISE EXCEPTION 'The Super Admin account cannot be deleted.'; END IF;
  IF NOT (public.is_super_admin(_actor) OR (
      public.has_permission(_actor,'employees','delete')
      AND public.can_view_employee(_actor,_emp)
      AND public.in_company_scope(_actor,_emp))) THEN
    RAISE EXCEPTION 'You do not have permission to delete this employee.';
  END IF;
  UPDATE public.profiles SET status = 'inactive', deleted_at = now() WHERE id = _emp AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found or already deleted.'; END IF;
  INSERT INTO public.audit_logs(actor_id, action, entity, entity_id) VALUES (_actor,'employee_deleted','profiles',_emp);
END $$;
REVOKE ALL ON FUNCTION public.delete_employee(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_employee(uuid) TO authenticated;