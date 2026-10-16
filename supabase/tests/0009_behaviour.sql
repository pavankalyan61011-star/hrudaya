-- Behaviour of migrations 0009 + 0010 (amendments), Week 6 spec §6 items 1–4.
-- Runs in one transaction that ALWAYS rolls back (the last statement raises with the results).
--   docker exec -i supabase_db_hrudaya psql -U postgres -d postgres < supabase/tests/0009_behaviour.sql
-- Uses the seeded cases PCI-2026-005 (reviewed, discharged, one complication), CAG-2026-018 and
-- CAG-2026-019 (reviewed), plus a draft and a completed probe procedure created here. Amendment
-- numbers and summary versions are counted from what PCI-2026-005 already has, so the test also
-- runs on a local database where amendments were made by hand.
begin;
create temp table r (n serial, c text, o text) on commit drop;
grant all on r to authenticated, anon; grant usage on sequence r_n_seq to authenticated, anon;
insert into auth.users (id, aud, role, email) values ('00000000-0000-4000-8000-0000000000dd','authenticated','authenticated','probe9@example.test');

-- Probe procedures (as postgres): a draft and a completed copy of PCI-2026-005.
insert into public.procedures
  select (pg_catalog.jsonb_populate_record(null::public.procedures, pg_catalog.to_jsonb(p) || jsonb_build_object(
    'id', '00000000-0000-4000-8000-0000000009d1', 'case_code', 'PROBE-0009-D', 'status', 'draft',
    'reviewed_by', null, 'reviewed_at', null, 'reviewing_clinician_id', null))).*
  from public.procedures p where p.case_code = 'PCI-2026-005';
insert into public.procedures
  select (pg_catalog.jsonb_populate_record(null::public.procedures, pg_catalog.to_jsonb(p) || jsonb_build_object(
    'id', '00000000-0000-4000-8000-0000000009c1', 'case_code', 'PROBE-0009-C', 'status', 'completed',
    'reviewed_by', null, 'reviewed_at', null, 'reviewing_clinician_id', null))).*
  from public.procedures p where p.case_code = 'PCI-2026-005';

-- An approved discharge summary on PCI-2026-005, before any amendment (as postgres).
insert into public.discharge_summaries (procedure_id, language, version, model, prompt_version, input_hash, draft_text)
  select p.id, 'en', coalesce((select max(s.version) from public.discharge_summaries s where s.procedure_id = p.id and s.language = 'en'), 0) + 1,
         'm', 'v6', 'h-before', 'approved before the amendment'
  from public.procedures p where p.case_code = 'PCI-2026-005';
update public.discharge_summaries s set approved_text = draft_text, status = 'approved',
       approving_clinician_id = (select primary_operator_id from public.procedures where case_code = 'PCI-2026-005')
  where s.input_hash = 'h-before';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000dd","role":"authenticated"}', true);

do $$
declare
  me uuid := '00000000-0000-4000-8000-0000000000dd';
  p5 uuid; p18 uuid; p19 uuid; draft_p uuid := '00000000-0000-4000-8000-0000000009d1'; completed_p uuid := '00000000-0000-4000-8000-0000000009c1';
  op_a uuid; op_b uuid; prev_at timestamptz; prev_clin uuid; snap_before jsonb;
  a uuid; a2 uuid; row_ public.procedure_amendments; pr public.procedures; ev jsonb; n int; med uuid; pmed uuid; pat uuid;
  generic_before int; base int;
begin
  select id, reviewed_at, reviewing_clinician_id, patient_id into p5, prev_at, prev_clin, pat from public.procedures where case_code = 'PCI-2026-005';
  select id into p18 from public.procedures where case_code = 'CAG-2026-018';
  select id into p19 from public.procedures where case_code = 'CAG-2026-019';
  select id into op_a from public.operators order by full_name limit 1;
  select id into op_b from public.operators order by full_name desc limit 1;
  snap_before := public.procedure_snapshot(p5);
  select coalesce(max(amendment_no), 0) into base from public.procedure_amendments where procedure_id = p5;
  select count(*) into generic_before from public.procedure_events where procedure_id = p5 and event in ('reviewed', 'reopened', 'completed');

  -- ─── §6 item 2: open_amendment ──────────────────────────────────────────────
  begin perform public.open_amendment(p5, 'too short');
    insert into r (c,o) values ('open: refused with a reason under 10 characters', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('open: refused with a reason under 10 characters', 'PASS'); end;
  begin perform public.open_amendment(draft_p, 'Correcting a draft is not an amendment');
    insert into r (c,o) values ('open: refused on a draft', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('open: refused on a draft', 'PASS'); end;
  begin perform public.open_amendment(completed_p, 'Completed but not reviewed yet');
    insert into r (c,o) values ('open: refused on a completed (unreviewed) procedure', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('open: refused on a completed (unreviewed) procedure', 'PASS'); end;
  begin perform public.open_amendment('00000000-0000-4000-8000-00000000dead', 'No such procedure exists here');
    insert into r (c,o) values ('open: unknown procedure → not found (P0002)', 'FAIL');
  exception when no_data_found then insert into r (c,o) values ('open: unknown procedure → not found (P0002)', 'PASS'); end;
  perform set_config('request.jwt.claims', '', true);
  begin perform public.open_amendment(p5, 'Nobody is signed in here');
    insert into r (c,o) values ('open: refused with no signed-in user', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('open: refused with no signed-in user', 'PASS'); end;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000dd","role":"authenticated"}', true);

  a := public.open_amendment(p5, '  Discharge ticagrelor dose recorded wrongly  ');
  select * into pr from public.procedures where id = p5;
  select * into row_ from public.procedure_amendments where id = a;
  insert into r (c,o) values ('open: status is amending', case when pr.status::text = 'amending' then 'PASS' else 'FAIL '||pr.status end);
  insert into r (c,o) values ('open: reviewed_by / reviewed_at / reviewing clinician cleared',
    case when pr.reviewed_by is null and pr.reviewed_at is null and pr.reviewing_clinician_id is null then 'PASS' else 'FAIL' end);
  insert into r (c,o) values ('open: next amendment number, open, opened by the signed-in user, reason trimmed',
    case when row_.amendment_no = base + 1 and row_.status = 'open' and row_.opened_by = me and row_.reason = 'Discharge ticagrelor dose recorded wrongly' then 'PASS' else 'FAIL' end);
  insert into r (c,o) values ('open: previous review copied (reviewed_at, clinician)',
    case when row_.previous_reviewed_at = prev_at and row_.previous_reviewing_clinician_id is not distinct from prev_clin then 'PASS' else 'FAIL' end);
  insert into r (c,o) values ('open: snapshot stored = the record at unlock', case when row_.snapshot = snap_before then 'PASS' else 'FAIL' end);
  select payload into ev from public.procedure_events where procedure_id = p5 and event = 'amendment_opened' order by at desc limit 1;
  insert into r (c,o) values ('open: amendment_opened event with amendment_no and reason',
    case when ev = jsonb_build_object('amendment_no', base + 1, 'reason', 'Discharge ticagrelor dose recorded wrongly') then 'PASS' else 'FAIL '||coalesce(ev::text,'none') end);
  insert into r (c,o) values ('positive control: the user reads the amendment row', case when (select count(*) from public.procedure_amendments where id = a) = 1 then 'PASS' else 'FAIL' end);
  begin perform public.open_amendment(p5, 'A second one while the first is open');
    insert into r (c,o) values ('open: refused while an amendment is already open', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('open: refused while an amendment is already open', 'PASS'); end;

  -- ─── §6 item 3: while amending ──────────────────────────────────────────────
  select m.id into med from public.discharge_medications m join public.discharges d on d.id = m.discharge_id
    where d.procedure_id = p5 and m.drug_name = 'Ticagrelor';
  update public.discharge_medications set dose = 60 where id = med;
  get diagnostics n = row_count;
  insert into r (c,o) values ('amending: discharge medication dose editable', case when n = 1 then 'PASS' else 'FAIL' end);
  update public.devices_used set lot_number = 'SYN-LOT-AMEND' where intervention_id in (select id from public.interventions where procedure_id = p5) and category = 'stent';
  get diagnostics n = row_count;
  insert into r (c,o) values ('amending: device lot number editable', case when n >= 1 then 'PASS' else 'FAIL' end);
  update public.complications set outcome = 'Resolved with compression; no intervention needed' where procedure_id = p5;
  get diagnostics n = row_count;
  insert into r (c,o) values ('amending: complication outcome editable', case when n = 1 then 'PASS' else 'FAIL' end);
  update public.procedures set outcome_summary = outcome_summary || ' (amended)' where id = p5;
  get diagnostics n = row_count;
  insert into r (c,o) values ('amending: procedure fields editable', case when n = 1 then 'PASS' else 'FAIL' end);
  insert into public.procedure_medications (procedure_id, drug_name, route, timing) values (p5, 'Probe drug', 'oral', 'post_procedure') returning id into pmed;
  insert into r (c,o) values ('amending: child row insertable', 'PASS');
  delete from public.procedure_medications where id = pmed;
  get diagnostics n = row_count;
  insert into r (c,o) values ('amending: child row deletable (procedure_is_editable)', case when n = 1 then 'PASS' else 'FAIL' end);
  delete from public.procedure_medications where procedure_id = p18;
  get diagnostics n = row_count;
  insert into r (c,o) values ('control: deleting from a REVIEWED procedure still touches 0 rows', case when n = 0 then 'PASS' else 'FAIL' end);

  begin update public.procedures set case_code = 'PCI-2026-999' where id = p5;
    insert into r (c,o) values ('amending: case code refused', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('amending: case code refused', 'PASS'); end;
  begin update public.procedures set procedure_date = procedure_date + 1 where id = p5;
    insert into r (c,o) values ('amending: procedure date refused', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('amending: procedure date refused', 'PASS'); end;
  begin update public.procedures set patient_id = (select patient_id from public.procedures where id = p18) where id = p5;
    insert into r (c,o) values ('amending: patient refused', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('amending: patient refused', 'PASS'); end;
  begin update public.patients set full_name = full_name || ' X' where id = pat;
    insert into r (c,o) values ('amending: patient name refused (patient row locked)', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('amending: patient name refused (patient row locked)', 'PASS'); end;
  begin update public.patients set date_of_birth = date_of_birth - 1 where id = pat;
    insert into r (c,o) values ('amending: patient date of birth refused', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('amending: patient date of birth refused', 'PASS'); end;
  begin update public.patients set mrn = mrn || '-X' where id = pat;
    insert into r (c,o) values ('amending: patient MRN refused', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('amending: patient MRN refused', 'PASS'); end;
  begin insert into public.patient_risk_factors (patient_id, factor) values (pat, 'smoking');
    insert into r (c,o) values ('amending: patient risk factors refused', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('amending: patient risk factors refused', 'PASS'); end;
  begin update public.procedures set status = 'reviewed', reviewing_clinician_id = op_a where id = p5;
    insert into r (c,o) values ('direct status amending → reviewed refused (no function)', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('direct status amending → reviewed refused (no function)', 'PASS'); end;
  begin update public.procedures set status = 'draft' where id = p5;
    insert into r (c,o) values ('direct status amending → draft refused', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('direct status amending → draft refused', 'PASS'); end;
  begin update public.procedures set status = 'amending' where id = p18;
    insert into r (c,o) values ('direct status reviewed → amending refused (no function)', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('direct status reviewed → amending refused (no function)', 'PASS'); end;
  begin update public.procedures set status = 'amending' where id = draft_p;
    insert into r (c,o) values ('direct status draft → amending refused', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('direct status draft → amending refused', 'PASS'); end;
  begin insert into public.procedure_amendments (procedure_id, amendment_no, reason, snapshot, previous_reviewed_at) values (p18, 1, 'Written directly, not via the function', '{}', now());
    insert into r (c,o) values ('direct insert into procedure_amendments refused', 'FAIL');
  exception when insufficient_privilege then insert into r (c,o) values ('direct insert into procedure_amendments refused', 'PASS'); end;
  begin update public.procedure_amendments set reason = 'Rewritten reason, not allowed' where id = a;
    insert into r (c,o) values ('direct update of an amendment refused', 'FAIL');
  exception when insufficient_privilege then insert into r (c,o) values ('direct update of an amendment refused', 'PASS'); end;
  begin insert into public.discharge_summaries (procedure_id, language, version, model, prompt_version, input_hash, draft_text) values (p5, 'te', 9, 'm', 'v6', 'h', 'x');
    insert into r (c,o) values ('no discharge summary can be generated while amending', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('no discharge summary can be generated while amending', 'PASS'); end;

  -- ─── §6 item 4: close_amendment ─────────────────────────────────────────────
  begin perform public.close_amendment(p5, op_b, '[]'::jsonb);
    insert into r (c,o) values ('close: refused — empty diff but the record changed', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('close: refused — empty diff but the record changed', 'PASS'); end;
  begin perform public.close_amendment(p5, null, '[{"path":"x"}]'::jsonb);
    insert into r (c,o) values ('close: refused without a re-reviewing clinician', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('close: refused without a re-reviewing clinician', 'PASS'); end;
  begin perform public.close_amendment(p5, op_b, '{"not":"an array"}'::jsonb);
    insert into r (c,o) values ('close: refused — changes not an array', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('close: refused — changes not an array', 'PASS'); end;
  begin
    delete from public.interventions where procedure_id = p5;   -- a PCI with no intervention is incomplete
    perform public.close_amendment(p5, op_b, '[{"path":"interventions"}]'::jsonb);
    insert into r (c,o) values ('close: refused — incomplete record (PCI with no intervention)', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('close: refused — incomplete record (PCI with no intervention)', 'PASS'); end;
  insert into r (c,o) values ('control: the refused close left the procedure amending, interventions back',
    case when (select status::text from public.procedures where id = p5) = 'amending' and (select count(*) from public.interventions where procedure_id = p5) > 0 then 'PASS' else 'FAIL' end);

  begin
    perform public.close_amendment(p5, op_b, '[{"path":"discharge.medications[Ticagrelor].dose","label":"Discharge medication · Ticagrelor · dose","before":90,"after":60,"kind":"changed"}]'::jsonb);
  exception when others then insert into r (c,o) values ('close: the real close succeeds', 'FAIL '||sqlerrm); end;
  select * into pr from public.procedures where id = p5;
  select * into row_ from public.procedure_amendments where id = a;
  insert into r (c,o) values ('close: status reviewed again', case when pr.status::text = 'reviewed' then 'PASS' else 'FAIL '||pr.status end);
  insert into r (c,o) values ('close: second signature — reviewed_by = signed-in user, reviewed_at now, new clinician',
    case when pr.reviewed_by = me and pr.reviewed_at > now() - interval '1 minute' and pr.reviewing_clinician_id = op_b then 'PASS' else 'FAIL' end);
  insert into r (c,o) values ('close: amendment closed with closed_by, closed_at, clinician, changes',
    case when row_.status = 'closed' and row_.closed_by = me and row_.closed_at is not null and row_.reviewing_clinician_id = op_b
              and jsonb_array_length(row_.changes) = 1 then 'PASS' else 'FAIL' end);
  select payload into ev from public.procedure_events where procedure_id = p5 and event = 'amendment_closed' order by at desc limit 1;
  insert into r (c,o) values ('close: amendment_closed event with amendment_no, change_count, clinician',
    case when ev = jsonb_build_object('amendment_no', base + 1, 'change_count', 1, 'reviewing_clinician_id', op_b) then 'PASS' else 'FAIL '||coalesce(ev::text,'none') end);
  insert into r (c,o) values ('no generic reviewed/reopened event for the amendment moves',
    case when (select count(*) from public.procedure_events where procedure_id = p5 and event in ('reviewed', 'reopened', 'completed')) = generic_before then 'PASS' else 'FAIL' end);
  begin update public.procedures set outcome_summary = 'edit after re-review' where id = p5;
    insert into r (c,o) values ('after close: the record is read-only again', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('after close: the record is read-only again', 'PASS'); end;
  begin perform public.close_amendment(p5, op_b, '[]'::jsonb);
    insert into r (c,o) values ('close: refused when no amendment is open', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('close: refused when no amendment is open', 'PASS'); end;

  -- No-change amendment on CAG-2026-018: a non-empty diff is a lie; an empty one closes.
  begin a2 := public.open_amendment(p18, 'Checking the record against the notes');
  exception when others then insert into r (c,o) values ('open: CAG-2026-018 opens', 'FAIL '||sqlerrm); end;
  begin perform public.close_amendment(p18, op_a, '[{"path":"procedure.outcome_summary"}]'::jsonb);
    insert into r (c,o) values ('close: refused — non-empty diff but the record is unchanged', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('close: refused — non-empty diff but the record is unchanged', 'PASS'); end;
  begin perform public.close_amendment(p18, op_a, '[]'::jsonb);
  exception when others then insert into r (c,o) values ('close: CAG-2026-018 closes with []', 'FAIL '||sqlerrm); end;
  insert into r (c,o) values ('close: an unchanged record closes with an empty diff',
    case when (select status::text from public.procedures where id = p18) = 'reviewed'
              and (select changes from public.procedure_amendments where id = a2) = '[]'::jsonb then 'PASS' else 'FAIL' end);

  -- The next amendment on PCI-2026-005 takes the next number.
  begin a2 := public.open_amendment(p5, 'Second look at the same record');
  exception when others then insert into r (c,o) values ('open: second amendment opens', 'FAIL '||sqlerrm); end;
  insert into r (c,o) values ('the next amendment is numbered one higher', case when (select amendment_no from public.procedure_amendments where id = a2) = base + 2 then 'PASS' else 'FAIL' end);
  begin perform public.close_amendment(p5, op_a, '[]'::jsonb);
  exception when others then insert into r (c,o) values ('close: second amendment closes with []', 'FAIL '||sqlerrm); end;

  -- Summaries: an approved row stays immutable through all of this.
  update public.discharge_summaries set approved_text = 'changed after the amendment' where input_hash = 'h-before';
  get diagnostics n = row_count;
  insert into r (c,o) values ('approved summary: user update still touches 0 rows', case when n = 0 then 'PASS' else 'FAIL' end);
  insert into r (c,o) values ('approved summary text unchanged',
    case when (select approved_text from public.discharge_summaries where input_hash = 'h-before') = 'approved before the amendment' then 'PASS' else 'FAIL' end);
end $$;

-- Service role bypasses RLS and grants: the triggers must still hold.
reset role;
do $$
begin
  begin update public.procedure_amendments set reason = 'service role rewrite of history' where status = 'closed';
    insert into r (c,o) values ('closed amendment immutable even for service role (trigger)', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('closed amendment immutable even for service role (trigger)', 'PASS'); end;
  begin update public.procedures set status = 'amending' where case_code = 'CAG-2026-019';
    insert into r (c,o) values ('service role: reviewed → amending still refused without the function', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('service role: reviewed → amending still refused without the function', 'PASS'); end;
  begin update public.discharge_summaries set approved_text = 'service role edit' where input_hash = 'h-before';
    insert into r (c,o) values ('approved summary immutable even for service role (trigger)', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('approved summary immutable even for service role (trigger)', 'PASS'); end;
end $$;
set local role anon;
do $$ begin
  begin perform public.open_amendment((select id from public.procedures limit 1), 'anonymous attempt here');
    insert into r (c,o) values ('anon cannot call open_amendment', 'FAIL');
  exception when insufficient_privilege then insert into r (c,o) values ('anon cannot call open_amendment', 'PASS'); end;
end $$;
reset role;
do $$ declare s text; begin select string_agg(o||'  '||c, E'\n' order by n) into s from r; raise exception E'PROBE (rolled back)\n%', s; end $$;
