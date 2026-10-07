CREATE OR REPLACE FUNCTION public.compute_payroll(_emp uuid, _month date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare
  s public.organization_settings; c public.employee_compensation; p public.profiles;
  _wd int[]; _ms date := date_trunc('month', _month)::date; _me date; _ps date; _today date := (now() at time zone 'Asia/Kolkata')::date;
  _month_working int := 0; _applicable int := 0; _worked numeric := 0; _paid numeric := 0; _unpaid numeric := 0;
  _absent numeric := 0; _hol int := 0; _future int := 0; _excess numeric := 0; _prior_paid numeric := 0; _allow numeric;
  _divisor numeric; _gross numeric; _daily numeric; _base numeric; _ded_unpaid numeric; _other numeric; _net numeric;
  d date; _is_hol boolean; _lv record; _att record; _units numeric;
begin
  _me := (_ms + interval '1 month' - interval '1 day')::date;
  select * into s from public.organization_settings limit 1;
  select * into p from public.profiles where id = _emp;
  if p.id is null then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
  select * into c from public.employee_compensation where employee_id = _emp;
  select array(select unnest(working_days)::int) into _wd from public.leave_policy_sets where id = p.leave_policy_id;
  if _wd is null then _wd := array(select case when x = 0 then 7 else x end from unnest(s.working_days) x); end if;
  _ps := greatest(_ms, coalesce(p.joining_date, _ms));
  _gross := coalesce(c.basic_salary,0) + coalesce(c.allowances,0);
  _allow := c.paid_leave_allowance;

  for d in select g::date from generate_series(_ms, _me, interval '1 day') g loop
    _is_hol := exists (select 1 from public.holidays h where h.active and h.mandatory and h.holiday_date = d
                 and (h.location_id is null or h.location_id = p.location_id));
    if not (extract(isodow from d)::int = any(_wd)) then continue; end if;
    if _is_hol then _hol := _hol + 1; continue; end if;
    _month_working := _month_working + 1;
    if d < _ps then continue; end if;
    _applicable := _applicable + 1;

    select l.id, l.half_day, coalesce(t.is_paid, lp.is_paid, true) is_paid into _lv
      from public.leave_requests l
      left join public.leave_policy_types t on t.policy_id = p.leave_policy_id and t.base_type = l.leave_type
      left join public.leave_policies lp on lp.leave_type = l.leave_type
      where l.employee_id = _emp and l.status = 'APPROVED' and d between l.start_date and l.end_date limit 1;
    select a.id, a.day_status into _att from public.attendance a where a.employee_id = _emp and a.attendance_date = d;

    if _lv.id is not null then
      _units := case when _lv.half_day then 0.5 else 1 end;
      if _lv.is_paid then _paid := _paid + _units; else _unpaid := _unpaid + _units; end if;
      if _units = 0.5 then
        if _att.id is not null then _worked := _worked + 0.5; elsif d < _today then _absent := _absent + 0.5; end if;
      end if;
    elsif _att.id is not null then
      if _att.day_status = 'half_day' then _worked := _worked + 0.5; _absent := _absent + 0.5;
      else _worked := _worked + 1; end if;
    elsif d < _today then _absent := _absent + 1;
    else _future := _future + 1;
    end if;
  end loop;

  if _allow is not null and _paid > 0 then
    select coalesce(sum(case when l.half_day then 0.5 else
      (select count(*) from generate_series(greatest(l.start_date, date_trunc('year',_ms)::date), least(l.end_date, _ms - 1), interval '1 day') g
        where extract(isodow from g)::int = any(_wd)) end),0) into _prior_paid
    from public.leave_requests l
    left join public.leave_policy_types t on t.policy_id = p.leave_policy_id and t.base_type = l.leave_type
    left join public.leave_policies lp on lp.leave_type = l.leave_type
    where l.employee_id = _emp and l.status = 'APPROVED' and coalesce(t.is_paid, lp.is_paid, true)
      and l.start_date < _ms and l.end_date >= date_trunc('year',_ms)::date;
    _excess := greatest(0, _paid - greatest(0, _allow - _prior_paid));
    _paid := _paid - _excess; _unpaid := _unpaid + _excess;
  end if;

  _divisor := case s.salary_divisor_mode when 'fixed' then s.salary_fixed_divisor
    when 'calendar' then extract(day from _me) else greatest(_month_working,1) end;
  _daily := round(_gross / nullif(_divisor,0), 2);
  if _ps > _me then _base := 0;
  elsif _ps = _ms then _base := _gross;
  else _base := least(_gross, round(_daily * case when s.salary_divisor_mode = 'calendar' then (_me - _ps + 1) else _applicable end, 2));
  end if;
  _ded_unpaid := round(coalesce(_daily,0) * (_unpaid + _absent), 2);
  _other := case when _base = 0 then 0 else coalesce(c.deductions,0) end;
  _net := greatest(0, round(_base - _ded_unpaid - _other, 2));

  return jsonb_build_object(
    'employee_id', _emp, 'full_name', p.full_name, 'month', _ms, 'period_start', _ps, 'period_end', _me,
    'joining_date', p.joining_date, 'leave_policy_id', p.leave_policy_id, 'working_weekdays', _wd,
    'basic_salary', coalesce(c.basic_salary,0), 'allowances', coalesce(c.allowances,0), 'gross_salary', _gross,
    'month_working_days', _month_working, 'applicable_working_days', _applicable, 'holidays', _hol,
    'days_worked', _worked, 'paid_leave_days', _paid, 'unpaid_leave_days', _unpaid, 'paid_leave_over_allowance', _excess,
    'absent_days', _absent, 'upcoming_days', _future, 'paid_leave_allowance', _allow, 'paid_leave_used_before', _prior_paid,
    'divisor_mode', s.salary_divisor_mode, 'divisor', _divisor, 'daily_salary', coalesce(_daily,0),
    'prorated_base', _base, 'unpaid_deduction', _ded_unpaid, 'other_deductions', _other,
    'total_deductions', _ded_unpaid + _other, 'net_salary', _net, 'currency', s.currency,
    'has_salary', c.employee_id is not null);
end; $$;
REVOKE EXECUTE ON FUNCTION public.compute_payroll(uuid, date) FROM PUBLIC, anon, authenticated;