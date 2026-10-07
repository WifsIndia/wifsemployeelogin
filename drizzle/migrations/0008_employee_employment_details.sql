ALTER TABLE public.employee_compensation
  ADD COLUMN IF NOT EXISTS paid_leave_allowance numeric,
  ADD COLUMN IF NOT EXISTS bond text,
  ADD COLUMN IF NOT EXISTS employment_description text;