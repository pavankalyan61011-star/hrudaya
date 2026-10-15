begin;
create temp table r (n serial, c text, o text) on commit drop;
grant all on r to authenticated, anon; grant usage on sequence r_n_seq to authenticated, anon;
insert into auth.users (id, aud, role, email) values ('00000000-0000-4000-8000-0000000000cc','authenticated','authenticated','probe3@example.test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000cc","role":"authenticated"}', true);
do $$
declare
  ok_proc uuid; nodis_proc uuid; draft_proc uuid; op uuid; s uuid; who uuid; at_ timestamptz; n int; ev jsonb;
begin
  select id into ok_proc from public.procedures where case_code='PCI-2026-001';
  select id into nodis_proc from public.procedures where case_code='CAG-2026-020';
  select id into op from public.operators limit 1;
  insert into public.procedures (patient_id, case_code) select patient_id, 'PROBE-0008' from public.procedures where id=ok_proc returning id into draft_proc;

  insert into public.discharge_summaries (procedure_id, language, version, model, prompt_version, input_hash, draft_text, generated_by, generated_at)
    values (ok_proc, 'te', 1, 'm', 'v1', 'h', 'draft one', '00000000-0000-4000-8000-000000000bad', '2000-01-01') returning id, generated_by, generated_at into s, who, at_;
  insert into r (c,o) values ('insert for reviewed + discharged procedure', 'PASS');
  insert into r (c,o) values ('generated_by forced to the signed-in user', case when who='00000000-0000-4000-8000-0000000000cc' then 'PASS' else 'FAIL' end);
  insert into r (c,o) values ('generated_at is the clock, not the client value', case when at_ > now() - interval '1 minute' then 'PASS' else 'FAIL' end);
  select payload into ev from public.procedure_events where procedure_id=ok_proc and event='summary_generated' order by at desc limit 1;
  insert into r (c,o) values ('summary_generated event with language and version', case when ev = '{"language":"te","version":1}'::jsonb then 'PASS' else 'FAIL '||coalesce(ev::text,'none') end);
  insert into r (c,o) values ('positive control: user reads the row', case when (select count(*) from public.discharge_summaries where id=s)=1 then 'PASS' else 'FAIL' end);

  begin insert into public.discharge_summaries (procedure_id, language, version, model, prompt_version, input_hash, draft_text) values (nodis_proc,'en',1,'m','v1','h','x');
    insert into r (c,o) values ('refused: no discharge (CAG-2026-020)','FAIL');
  exception when raise_exception then insert into r (c,o) values ('refused: no discharge (CAG-2026-020)','PASS'); end;
  begin insert into public.discharge_summaries (procedure_id, language, version, model, prompt_version, input_hash, draft_text) values (draft_proc,'en',1,'m','v1','h','x');
    insert into r (c,o) values ('refused: procedure not reviewed','FAIL');
  exception when raise_exception then insert into r (c,o) values ('refused: procedure not reviewed','PASS'); end;
  begin insert into public.discharge_summaries (procedure_id, language, version, status, model, prompt_version, input_hash, draft_text, approved_text, approving_clinician_id, approved_at) values (ok_proc,'en',1,'approved','m','v1','h','x','x',op,now());
    insert into r (c,o) values ('refused: inserting an approved row','FAIL');
  exception when raise_exception then insert into r (c,o) values ('refused: inserting an approved row','PASS'); end;
  begin insert into public.discharge_summaries (procedure_id, language, version, model, prompt_version, input_hash, draft_text) values (ok_proc,'te',1,'m','v1','h','dup');
    insert into r (c,o) values ('refused: duplicate (procedure, language, version)','FAIL');
  exception when unique_violation then insert into r (c,o) values ('refused: duplicate (procedure, language, version)','PASS'); end;
  begin update public.discharge_summaries set draft_text='edited' where id=s;
    insert into r (c,o) values ('refused: editing draft_text','FAIL');
  exception when raise_exception then insert into r (c,o) values ('refused: editing draft_text','PASS'); end;

  update public.discharge_summaries set approved_text='edited by clinician' where id=s;
  get diagnostics n = row_count;
  insert into r (c,o) values ('draft: approved_text can be saved', case when n=1 then 'PASS' else 'FAIL' end);
  begin update public.discharge_summaries set status='approved' where id=s;
    insert into r (c,o) values ('refused: approve without clinician','FAIL');
  exception when check_violation then insert into r (c,o) values ('refused: approve without clinician','PASS'); end;
  update public.discharge_summaries set status='approved', approving_clinician_id=op, approved_at='2000-01-01' where id=s;
  select approved_by, approved_at into who, at_ from public.discharge_summaries where id=s;
  insert into r (c,o) values ('approve stamps the signed-in user', case when who='00000000-0000-4000-8000-0000000000cc' then 'PASS' else 'FAIL' end);
  insert into r (c,o) values ('approved_at is the clock', case when at_ > now() - interval '1 minute' then 'PASS' else 'FAIL' end);
  select payload into ev from public.procedure_events where procedure_id=ok_proc and event='summary_approved' order by at desc limit 1;
  insert into r (c,o) values ('summary_approved event with language and version', case when ev = '{"language":"te","version":1}'::jsonb then 'PASS' else 'FAIL '||coalesce(ev::text,'none') end);

  update public.discharge_summaries set approved_text='changed after approval' where id=s;
  get diagnostics n = row_count;
  insert into r (c,o) values ('approved row: user update touches 0 rows (RLS)', case when n=0 then 'PASS' else 'FAIL' end);
  delete from public.discharge_summaries where id=s;
  get diagnostics n = row_count;
  insert into r (c,o) values ('no delete (0 rows)', case when n=0 then 'PASS' else 'FAIL' end);
  insert into public.discharge_summaries (procedure_id, language, version, model, prompt_version, input_hash, draft_text) values (ok_proc,'te',2,'m','v1','h','draft two');
  insert into r (c,o) values ('new version 2 alongside approved v1', case when (select count(*) from public.discharge_summaries where procedure_id=ok_proc and language='te')=2 then 'PASS' else 'FAIL' end);
end $$;
-- Service role bypasses RLS: the trigger must still refuse changes to an approved row.
reset role;
do $$
begin
  begin update public.discharge_summaries set approved_text='service role edit' where status='approved';
    insert into r (c,o) values ('approved row immutable even for service role (trigger)','FAIL');
  exception when raise_exception then insert into r (c,o) values ('approved row immutable even for service role (trigger)','PASS'); end;
end $$;
set local role anon;
do $$ declare n int; begin
  begin select count(*) into n from public.discharge_summaries; insert into r (c,o) values ('anon reads nothing', case when n=0 then 'PASS' else 'FAIL' end);
  exception when insufficient_privilege then insert into r (c,o) values ('anon reads nothing (permission denied)','PASS'); end;
end $$;
reset role;
do $$ declare s text; begin select string_agg(o||'  '||c, E'\n' order by n) into s from r; raise exception E'PROBE (rolled back)\n%', s; end $$;
