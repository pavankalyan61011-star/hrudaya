-- Owner-approved synthetic data addition (2026-10-18): the Week 7 values the seed gives three
-- existing reviewed cases, added on production. Additive only: every statement fills a Week 7
-- field that is still unset (NULL, its 0011 default false/{}), or inserts a Week 7 row where none
-- exists; no field entered before Week 7 is changed. CAG-2026-019's outcome_summary differs from the
-- seed's wording and is deliberately left as it is. PCI-2026-001 (amended) is not touched.
--
--   CAG-2026-019  FFR 0.86 (defer) on the mid RCA; in-hospital outcomes (all no; home)
--   PCI-2026-005  outcomes (bleeding yes, BARC 2, haematoma, linked to the haematoma event);
--                 the haematoma event's resolution; techniques
--   PCI-2026-015  IVUS before and after on the mid RCA; in-stent restenosis (focal); previous PCI;
--                 techniques; the drug-coated balloon's inflation; outcomes (all no; home)
--
-- One transaction. The reviewed-record guards are off only for these statements and back on before
-- commit. Every statement's row count is checked; a re-run inserts nothing and is refused. It also
-- refuses if any of the three cases has an approved discharge summary (none do: an approved
-- summary's input must not change). Rehearsed locally first (docs/backlog.md → Data corrections).
begin;
alter table public.procedures disable trigger guard_procedure_review;
alter table public.vessel_findings disable trigger guard_reviewed_child;
alter table public.interventions disable trigger guard_reviewed_child;
alter table public.complications disable trigger guard_reviewed_child;
alter table public.lesion_physiology disable trigger guard_reviewed_child;
alter table public.intravascular_imaging disable trigger guard_reviewed_child;
alter table public.device_inflations disable trigger guard_reviewed_child;
alter table public.in_hospital_outcomes disable trigger guard_reviewed_child;

do $$
declare
  n int;
  p019 uuid; p005 uuid; p015 uuid;
  v019 uuid; v015 uuid; haem uuid; dcb uuid;
begin
  select id into strict p019 from public.procedures where case_code = 'CAG-2026-019' and created_by is null and status = 'reviewed';
  select id into strict p005 from public.procedures where case_code = 'PCI-2026-005' and created_by is null and status = 'reviewed';
  select id into strict p015 from public.procedures where case_code = 'PCI-2026-015' and created_by is null and status = 'reviewed';

  select count(*) into n from public.discharge_summaries where procedure_id in (p019, p005, p015) and status = 'approved';
  if n <> 0 then raise exception 'refused: % approved summaries on these cases', n; end if;

  select id into strict v019 from public.vessel_findings where procedure_id = p019 and vessel = 'rca' and segment = 'mid';
  select id into strict v015 from public.vessel_findings where procedure_id = p015 and vessel = 'rca' and segment = 'mid';
  select id into strict haem from public.complications where procedure_id = p005 and complication = 'access_site_haematoma';
  select d.id into strict dcb from public.devices_used d join public.interventions i on i.id = d.intervention_id
    where i.procedure_id = p015 and d.category = 'balloon_dcb' and d.product_name = 'Paclitaxel-coated balloon';

  -- CAG-2026-019
  insert into public.lesion_physiology (vessel_finding_id, phase, index, value, hyperaemic_agent, agent_dose, decision, method, source)
    select v019, 'pre', 'ffr', 0.86, 'adenosine_iv', '140 µg/kg/min', 'defer', 'pressure_wire', 'typed'
    where not exists (select 1 from public.lesion_physiology where vessel_finding_id = v019);
  get diagnostics n = row_count; if n <> 1 then raise exception '019 physiology: % rows', n; end if;

  insert into public.in_hospital_outcomes (procedure_id, mi, stroke, death, bleeding, transfusion, vascular_status, vascular_complications, aki, new_dialysis, emergency_cabg, cardiac_tamponade, unplanned_repeat_pci, disposition, event_links, source)
    select p019, 'no', 'no', 'no', 'no', 'no', 'no', '{}', 'no', 'no', 'no', 'no', 'no', 'home', '{}', 'typed'
    where not exists (select 1 from public.in_hospital_outcomes where procedure_id = p019);
  get diagnostics n = row_count; if n <> 1 then raise exception '019 outcomes: % rows', n; end if;

  -- PCI-2026-005
  update public.complications set resolution = 'resolved' where id = haem and resolution is null;
  get diagnostics n = row_count; if n <> 1 then raise exception '005 resolution: % rows', n; end if;

  update public.interventions set techniques = '{predilation,post_dilation}' where procedure_id = p005 and cardinality(techniques) = 0;
  get diagnostics n = row_count; if n <> 1 then raise exception '005 techniques: % rows', n; end if;

  insert into public.in_hospital_outcomes (procedure_id, mi, stroke, death, bleeding, bleeding_barc, transfusion, vascular_status, vascular_complications, aki, new_dialysis, emergency_cabg, cardiac_tamponade, unplanned_repeat_pci, disposition, event_links, source)
    select p005, 'no', 'no', 'no', 'yes', 2, 'no', 'yes', '{haematoma}', 'no', 'no', 'no', 'no', 'no', 'home', array[haem], 'typed'
    where not exists (select 1 from public.in_hospital_outcomes where procedure_id = p005);
  get diagnostics n = row_count; if n <> 1 then raise exception '005 outcomes: % rows', n; end if;

  -- PCI-2026-015
  update public.vessel_findings set in_stent_restenosis = true, isr_pattern = 'focal' where id = v015 and in_stent_restenosis = false and isr_pattern is null;
  get diagnostics n = row_count; if n <> 1 then raise exception '015 ISR: % rows', n; end if;

  insert into public.intravascular_imaging (vessel_finding_id, modality, phase, mla_mm2, eem_area_mm2, msa_mm2, stent_expansion_pct, malapposition, edge_dissection, method, source)
    select v015, 'ivus', x.phase::public.measurement_phase, x.mla, x.eem, x.msa, x.exp, x.mal, x.edge, 'manual', 'typed'
    from (values ('pre', 2.60, 11.80, null::numeric, null::numeric, null::boolean, null::boolean),
                 ('post', 5.10, null, 6.90, 88, false, false)) as x(phase, mla, eem, msa, exp, mal, edge)
    where not exists (select 1 from public.intravascular_imaging where vessel_finding_id = v015);
  get diagnostics n = row_count; if n <> 2 then raise exception '015 imaging: % rows', n; end if;

  update public.procedures set prior_pci = true where id = p015 and prior_pci is null;
  get diagnostics n = row_count; if n <> 1 then raise exception '015 prior PCI: % rows', n; end if;

  update public.interventions set techniques = '{drug_coated_balloon,scoring_balloon}' where procedure_id = p015 and cardinality(techniques) = 0;
  get diagnostics n = row_count; if n <> 1 then raise exception '015 techniques: % rows', n; end if;

  insert into public.device_inflations (device_id, sequence, pressure_atm, duration_s, source)
    select dcb, 1, 8, 60, 'typed' where not exists (select 1 from public.device_inflations where device_id = dcb);
  get diagnostics n = row_count; if n <> 1 then raise exception '015 inflation: % rows', n; end if;

  insert into public.in_hospital_outcomes (procedure_id, mi, stroke, death, bleeding, transfusion, vascular_status, vascular_complications, aki, new_dialysis, emergency_cabg, cardiac_tamponade, unplanned_repeat_pci, disposition, event_links, source)
    select p015, 'no', 'no', 'no', 'no', 'no', 'no', '{}', 'no', 'no', 'no', 'no', 'no', 'home', '{}', 'typed'
    where not exists (select 1 from public.in_hospital_outcomes where procedure_id = p015);
  get diagnostics n = row_count; if n <> 1 then raise exception '015 outcomes: % rows', n; end if;

  -- Audit trail: one event per case.
  insert into public.procedure_events (procedure_id, event, actor, payload)
  values
    (p019, 'data_corrected', null, jsonb_build_object('fields', jsonb_build_array('lesion_physiology', 'in_hospital_outcomes'),
      'change', 'Week 7 values added: FFR 0.86 (defer) on the mid RCA; in-hospital outcomes', 'note', 'owner-approved synthetic Week 7 values 2026-10-18')),
    (p005, 'data_corrected', null, jsonb_build_object('fields', jsonb_build_array('in_hospital_outcomes', 'complications.resolution', 'interventions.techniques'),
      'change', 'Week 7 values added: in-hospital outcomes (bleeding, BARC 2, haematoma, linked to the event); event resolution; techniques', 'note', 'owner-approved synthetic Week 7 values 2026-10-18')),
    (p015, 'data_corrected', null, jsonb_build_object('fields', jsonb_build_array('intravascular_imaging', 'vessel_findings.in_stent_restenosis', 'vessel_findings.isr_pattern', 'procedures.prior_pci', 'interventions.techniques', 'device_inflations', 'in_hospital_outcomes'),
      'change', 'Week 7 values added: IVUS before and after; in-stent restenosis (focal); previous PCI; techniques; balloon inflation; in-hospital outcomes', 'note', 'owner-approved synthetic Week 7 values 2026-10-18'));
end $$;

-- Run the deferred outcome-rule checks now (they would otherwise wait for commit, and a table with
-- pending trigger events cannot have its triggers re-enabled).
set constraints all immediate;

alter table public.procedures enable trigger guard_procedure_review;
alter table public.vessel_findings enable trigger guard_reviewed_child;
alter table public.interventions enable trigger guard_reviewed_child;
alter table public.complications enable trigger guard_reviewed_child;
alter table public.lesion_physiology enable trigger guard_reviewed_child;
alter table public.intravascular_imaging enable trigger guard_reviewed_child;
alter table public.device_inflations enable trigger guard_reviewed_child;
alter table public.in_hospital_outcomes enable trigger guard_reviewed_child;

do $$
declare n int;
begin
  select count(*) into n from public.procedure_events where event = 'data_corrected' and payload->>'note' = 'owner-approved synthetic Week 7 values 2026-10-18';
  if n <> 3 then raise exception 'events: expected 3, got %', n; end if;
  select count(*) into n from pg_trigger where not tgisinternal and tgenabled = 'D'
    and tgrelid in ('public.procedures'::regclass, 'public.vessel_findings'::regclass, 'public.interventions'::regclass, 'public.complications'::regclass,
                    'public.lesion_physiology'::regclass, 'public.intravascular_imaging'::regclass, 'public.device_inflations'::regclass, 'public.in_hospital_outcomes'::regclass);
  if n <> 0 then raise exception 'triggers still disabled: %', n; end if;
end $$;
commit;
