-- Behaviour probe for 0001_init.sql. Everything runs in one transaction and is rolled back.
-- Kept in step with later schema changes (fields only, same checks): 0002 made a discharge optional for
-- completion; 0005 replaced length_of_stay_hours with discharged_at; 0006 replaced procedure_duration_min
-- with started_at / ended_at and requires facility and urgency.
--   docker exec -i supabase_db_hrudaya psql -U postgres -d postgres < supabase/tests/0001_behaviour.sql
begin;

create temp table results (n serial, check_name text, outcome text) on commit drop;
grant all on results to authenticated, anon;
grant usage on sequence results_n_seq to authenticated, anon;

-- A throwaway auth user, rolled back with everything else.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000aa', 'authenticated', 'authenticated', 'probe@example.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);

do $$
declare
  pat uuid; op uuid; proc uuid; vf uuid; iv uuid; dis uuid; cb uuid; n int; fac uuid;
begin
  insert into public.patients (mrn, full_name, sex, date_of_birth, created_by)
    values ('PROBE-1', 'Probe Patient', 'male', '1968-01-01', '00000000-0000-4000-8000-000000000bad')
    returning id, created_by into pat, cb;
  insert into results (check_name, outcome) values
    ('created_by forced to auth.uid() (client tried to spoof)', case when cb = '00000000-0000-4000-8000-0000000000aa' then 'PASS' else 'FAIL' end);

  select count(*) into n from public.patients where id = pat;
  insert into results (check_name, outcome) values ('positive control: user reads own patient', case when n = 1 then 'PASS' else 'FAIL' end);

  insert into public.operators (full_name, role) values ('Probe Operator', 'interventional_cardiologist') returning id into op;
  select id into fac from public.facilities order by created_at limit 1;
  insert into public.procedures (patient_id, case_code) values (pat, 'PROBE-001') returning id into proc;

  select count(*) into n from public.procedure_events where procedure_id = proc and event = 'created';
  insert into results (check_name, outcome) values ('event logged on create', case when n = 1 then 'PASS' else 'FAIL' end);

  begin
    insert into public.procedure_events (procedure_id, event) values (proc, 'forged');
    insert into results (check_name, outcome) values ('user cannot write procedure_events', 'FAIL');
  exception when others then
    insert into results (check_name, outcome) values ('user cannot write procedure_events', 'PASS');
  end;

  -- Completing an empty draft must fail on the CHECK.
  begin
    update public.procedures set status = 'completed' where id = proc;
    insert into results (check_name, outcome) values ('incomplete draft cannot complete', 'FAIL');
  exception when others then
    insert into results (check_name, outcome) values ('incomplete draft cannot complete', 'PASS');
  end;

  update public.procedures set procedure_date = '2026-10-01', procedure_type = 'angiography_and_pci',
    indication = 'nstemi', presentation_notes = 'probe', access_site = 'right_radial', sheath_size_fr = 6,
    contrast_volume_ml = 100, started_at = '2026-10-01 10:00+05:30', ended_at = '2026-10-01 10:50+05:30',
    fluoroscopy_time_min = 10.0, primary_operator_id = op, haemostasis_method = 'radial_compression_band',
    outcome_summary = 'probe', facility_id = fac, urgency = 'urgent'
    where id = proc;

  begin
    update public.procedures set status = 'completed' where id = proc;
    insert into results (check_name, outcome) values ('PCI without vessels/intervention cannot complete', 'FAIL');
  exception when others then
    insert into results (check_name, outcome) values ('PCI without vessels/intervention cannot complete', 'PASS');
  end;

  insert into public.vessel_findings (procedure_id, vessel, segment, stenosis_pct, timi_flow, is_culprit)
    values (proc, 'lad', 'proximal', 90, 2, true) returning id into vf;

  begin
    insert into public.vessel_findings (procedure_id, vessel, stenosis_pct, timi_flow) values (proc, 'rca', 101, 3);
    insert into results (check_name, outcome) values ('stenosis > 100 rejected', 'FAIL');
  exception when check_violation then
    insert into results (check_name, outcome) values ('stenosis > 100 rejected', 'PASS');
  end;

  insert into public.interventions (procedure_id, vessel_finding_id, intervention_type, guidewire,
    residual_stenosis_pct, timi_flow_post, success)
    values (proc, vf, 'pci_des', 'probe wire', 0, 3, true) returning id into iv;

  begin
    insert into public.devices_used (intervention_id, phase, category, product_name, diameter_mm, length_mm)
      values (iv, 'deployment', 'stent', 'Probe DES', 3.5, 28);
    insert into results (check_name, outcome) values ('stent without lot number rejected', 'FAIL');
  exception when check_violation then
    insert into results (check_name, outcome) values ('stent without lot number rejected', 'PASS');
  end;

  insert into public.devices_used (intervention_id, phase, category, product_name, diameter_mm, length_mm, lot_number)
    values (iv, 'deployment', 'stent', 'Probe DES', 3.5, 28, 'SYN-PROBE');
  insert into public.devices_used (intervention_id, phase, category, product_name, diameter_mm, length_mm)
    values (iv, 'pre_dilation', 'balloon_sc', 'Probe balloon', 2.5, 15);
  insert into results (check_name, outcome) values ('stent with lot and balloon without lot accepted', 'PASS');

  -- 0002: a patient may remain admitted, so a missing discharge does not block completion. Tried in a
  -- sub-block that is then rolled back, so the record stays a draft for the checks below.
  begin
    update public.procedures set status = 'completed' where id = proc;
    raise exception 'probe-rollback';
  exception when others then
    insert into results (check_name, outcome) values ('completion is not blocked by a missing discharge (0002)',
      case when sqlerrm = 'probe-rollback' then 'PASS' else 'FAIL ' || sqlerrm end);
  end;

  insert into public.discharges (procedure_id, discharge_date, discharged_at, clinical_status,
    follow_up_date, follow_up_clinic) values (proc, '2026-10-03', '2026-10-03 12:00+05:30', 'stable', '2026-10-17', 'OPD')
    returning id into dis;
  insert into public.discharge_medications (discharge_id, drug_name, dose, dose_unit, frequency, is_dapt)
    values (dis, 'Aspirin', 75, 'mg', 'od', true);

  -- Delete while draft is allowed.
  delete from public.discharge_medications where discharge_id = dis;
  get diagnostics n = row_count;
  insert into results (check_name, outcome) values ('draft child row can be deleted', case when n = 1 then 'PASS' else 'FAIL' end);

  update public.procedures set status = 'completed' where id = proc;
  select count(*) into n from public.procedure_events where procedure_id = proc and event = 'completed';
  insert into results (check_name, outcome) values ('whole record completes and logs event', case when n = 1 then 'PASS' else 'FAIL' end);

  -- After completion, child deletes are refused (silently: 0 rows).
  delete from public.vessel_findings where procedure_id = proc;
  get diagnostics n = row_count;
  insert into results (check_name, outcome) values ('completed child row cannot be deleted', case when n = 0 then 'PASS' else 'FAIL' end);

  delete from public.procedures where id = proc;
  get diagnostics n = row_count;
  insert into results (check_name, outcome) values ('procedure cannot be deleted', case when n = 0 then 'PASS' else 'FAIL' end);

  delete from public.patients where id = pat;
  get diagnostics n = row_count;
  insert into results (check_name, outcome) values ('patient cannot be deleted', case when n = 0 then 'PASS' else 'FAIL' end);

  begin
    insert into public.patients (mrn, full_name, sex, date_of_birth, is_synthetic)
      values ('PROBE-2', 'Real?', 'female', '1970-01-01', false);
    insert into results (check_name, outcome) values ('is_synthetic=false rejected', 'FAIL');
  exception when check_violation then
    insert into results (check_name, outcome) values ('is_synthetic=false rejected', 'PASS');
  end;
end;
$$;

-- anon sees nothing even though rows exist.
reset role;
set local role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.patients;
    insert into results (check_name, outcome) values ('anon reads no patients', case when n = 0 then 'PASS' else 'FAIL' end);
  exception when insufficient_privilege then
    insert into results (check_name, outcome) values ('anon reads no patients (permission denied)', 'PASS');
  end;
end;
$$;

reset role;
-- Report by raising, so nothing can ever commit.
do $$
declare r text;
begin
  select string_agg(outcome || '  ' || check_name, E'\n' order by n) into r from results;
  raise exception E'PROBE RESULTS (rolled back)\n%', r;
end;
$$;
