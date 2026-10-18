-- Behaviour of migration 0011 (Week 7 structured reporting), spec §2 and §6.
-- Runs in one transaction that ALWAYS rolls back (the last statement raises with the results).
--   docker exec -i supabase_db_hrudaya psql -U postgres -d postgres < supabase/tests/0011_behaviour.sql
-- Uses two draft probe procedures copied from PCI-2026-005, the reviewed seeded cases PCI-2026-005 and
-- CAG-2026-018, and a probe user. Deferred rules are made immediate (SET CONSTRAINTS) so each check
-- fails at its own statement; one check runs them deferred to show the order doesn't matter.
begin;
set constraints all immediate;
create temp table r (n serial, c text, o text) on commit drop;
grant all on r to authenticated, anon; grant usage on sequence r_n_seq to authenticated, anon;
insert into auth.users (id, aud, role, email) values ('00000000-0000-4000-8000-0000000011dd','authenticated','authenticated','probe11@example.test');

-- Probe procedures (as postgres): two drafts, copies of PCI-2026-005 without children.
insert into public.procedures
  select (pg_catalog.jsonb_populate_record(null::public.procedures, pg_catalog.to_jsonb(p) || jsonb_build_object(
    'id', '00000000-0000-4000-8000-0000000011a1', 'case_code', 'PROBE-0011-A', 'status', 'draft',
    'reviewed_by', null, 'reviewed_at', null, 'reviewing_clinician_id', null))).*
  from public.procedures p where p.case_code = 'PCI-2026-005';
insert into public.procedures
  select (pg_catalog.jsonb_populate_record(null::public.procedures, pg_catalog.to_jsonb(p) || jsonb_build_object(
    'id', '00000000-0000-4000-8000-0000000011b1', 'case_code', 'PROBE-0011-B', 'status', 'draft',
    'reviewed_by', null, 'reviewed_at', null, 'reviewing_clinician_id', null))).*
  from public.procedures p where p.case_code = 'PCI-2026-005';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000011dd","role":"authenticated"}', true);

do $$
declare
  me uuid := '00000000-0000-4000-8000-0000000011dd';
  pa uuid := '00000000-0000-4000-8000-0000000011a1';
  pb uuid := '00000000-0000-4000-8000-0000000011b1';
  vf uuid; vfg uuid; g uuid; gb uuid; iv uuid; dev uuid; ev uuid; evb uuid; ph uuid; oc uuid;
  t0 timestamptz; t1 timestamptz; n int; rc record; snap1 jsonb; snap2 jsonb;
begin
  -- ─── §2.2 vessel_findings ───────────────────────────────────────────────────
  insert into public.vessel_findings (procedure_id, vessel, segment, stenosis_pct, timi_flow) values (pa, 'lad', 'proximal', 60, 3) returning id into vf;

  begin update public.vessel_findings set bifurcation = true, bifurcation_medina = '1,2,0' where id = vf;
    insert into r (c,o) values ('lesion: Medina must be three 0/1 digits', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('lesion: Medina must be three 0/1 digits', 'PASS'); end;
  begin update public.vessel_findings set bifurcation = false, bifurcation_medina = '1,1,0' where id = vf;
    insert into r (c,o) values ('lesion: Medina only when bifurcation', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('lesion: Medina only when bifurcation', 'PASS'); end;
  update public.vessel_findings set bifurcation = true, bifurcation_medina = '1,1,0' where id = vf;
  insert into r (c,o) values ('lesion: bifurcation with Medina 1,1,0 saved',
    case when (select bifurcation_medina from public.vessel_findings where id = vf) = '1,1,0' then 'PASS' else 'FAIL' end);
  begin update public.vessel_findings set cto_duration_months = 4 where id = vf;
    insert into r (c,o) values ('lesion: CTO duration only when CTO', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('lesion: CTO duration only when CTO', 'PASS'); end;
  begin update public.vessel_findings set isr_pattern = 'diffuse' where id = vf;
    insert into r (c,o) values ('lesion: ISR pattern only when in-stent restenosis', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('lesion: ISR pattern only when in-stent restenosis', 'PASS'); end;
  begin update public.vessel_findings set collaterals_rentrop = 4 where id = vf;
    insert into r (c,o) values ('lesion: Rentrop 0–3', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('lesion: Rentrop 0–3', 'PASS'); end;
  insert into r (c,o) values ('lesion: new booleans default false (ostial, CTO, ISR); stenosis source typed',
    case when (select not ostial and not cto and not in_stent_restenosis and stenosis_source = 'typed' from public.vessel_findings where id = vf)
         then 'PASS' else 'FAIL' end);

  -- ─── §2.7 grafts and graft lesions ──────────────────────────────────────────
  insert into public.grafts (procedure_id, graft_type, target_vessel, patency, stenosis_pct, lesion_location, cabg_year)
    values (pa, 'svg', 'om1', 'stenosed', 80, 'body', 2015) returning id into g;
  insert into public.grafts (procedure_id, graft_type, target_vessel, patency) values (pb, 'lima', 'lad', 'patent') returning id into gb;
  begin insert into public.grafts (procedure_id, graft_type, target_vessel, patency, stenosis_pct) values (pa, 'lima', 'lad', 'patent', 30);
    insert into r (c,o) values ('graft: stenosis % only when stenosed', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('graft: stenosis % only when stenosed', 'PASS'); end;
  begin insert into public.vessel_findings (procedure_id, vessel, stenosis_pct, timi_flow) values (pa, 'graft', 80, 3);
    insert into r (c,o) values ('graft lesion: vessel = graft needs graft_id', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('graft lesion: vessel = graft needs graft_id', 'PASS'); end;
  begin insert into public.vessel_findings (procedure_id, vessel, stenosis_pct, timi_flow, graft_id) values (pa, 'rca', 50, 3, g);
    insert into r (c,o) values ('graft lesion: graft_id only on a graft vessel', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('graft lesion: graft_id only on a graft vessel', 'PASS'); end;
  begin insert into public.vessel_findings (procedure_id, vessel, stenosis_pct, timi_flow, graft_id) values (pa, 'graft', 80, 3, gb);
    insert into r (c,o) values ('graft lesion: graft from another procedure refused (FK)', 'FAIL');
  exception when foreign_key_violation then insert into r (c,o) values ('graft lesion: graft from another procedure refused (FK)', 'PASS'); end;
  insert into public.vessel_findings (procedure_id, vessel, stenosis_pct, timi_flow, graft_id) values (pa, 'graft', 80, 3, g) returning id into vfg;
  insert into r (c,o) values ('graft lesion with its own graft saved', case when vfg is not null then 'PASS' else 'FAIL' end);

  -- ─── §2.3 / §2.4 physiology and imaging ─────────────────────────────────────
  begin insert into public.lesion_physiology (vessel_finding_id, phase, index, value) values (vf, 'pre', 'ffr', 1.20);
    insert into r (c,o) values ('physiology: value 0.00–1.00', 'FAIL');
  exception when check_violation or numeric_value_out_of_range then insert into r (c,o) values ('physiology: value 0.00–1.00', 'PASS'); end;
  begin insert into public.lesion_physiology (vessel_finding_id, phase, index, value, hyperaemic_agent) values (vf, 'pre', 'ifr', 0.85, 'adenosine_iv');
    insert into r (c,o) values ('physiology: resting index (iFR) has no hyperaemic agent', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('physiology: resting index (iFR) has no hyperaemic agent', 'PASS'); end;
  begin insert into public.lesion_physiology (vessel_finding_id, phase, index, value, hyperaemic_agent, agent_dose) values (vf, 'pre', 'ffr', 0.86, 'none', '140');
    insert into r (c,o) values ('physiology: agent dose only with an agent', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('physiology: agent dose only with an agent', 'PASS'); end;
  insert into public.lesion_physiology (vessel_finding_id, phase, index, value, hyperaemic_agent, agent_dose, decision, method)
    values (vf, 'pre', 'ffr', 0.86, 'adenosine_iv', '140 µg/kg/min', 'defer', 'pressure_wire') returning id into ph;
  insert into r (c,o) values ('physiology: FFR 0.86, adenosine IV, defer saved; recorded_by = signed-in user',
    case when (select recorded_by = me and source = 'typed' from public.lesion_physiology where id = ph) then 'PASS' else 'FAIL' end);
  select recorded_at into t0 from public.lesion_physiology where id = ph;
  update public.lesion_physiology set notes = 'reviewed later', recorded_at = now() + interval '1 day', recorded_by = null where id = ph;
  insert into r (c,o) values ('recorded_at / recorded_by frozen after insert',
    case when (select recorded_at = t0 and recorded_by = me from public.lesion_physiology where id = ph) then 'PASS' else 'FAIL' end);
  begin insert into public.intravascular_imaging (vessel_finding_id, modality, phase, lipid_arc_deg) values (vf, 'ivus', 'pre', 90);
    insert into r (c,o) values ('imaging: lipid arc is OCT only', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('imaging: lipid arc is OCT only', 'PASS'); end;
  begin insert into public.intravascular_imaging (vessel_finding_id, modality, phase, max_lcbi_4mm) values (vf, 'ivus', 'pre', 400);
    insert into r (c,o) values ('imaging: LCBI is NIRS only', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('imaging: LCBI is NIRS only', 'PASS'); end;
  begin insert into public.intravascular_imaging (vessel_finding_id, modality, phase, msa_mm2) values (vf, 'ivus', 'pre', 6.1);
    insert into r (c,o) values ('imaging: minimum stent area is post only', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('imaging: minimum stent area is post only', 'PASS'); end;
  insert into public.intravascular_imaging (vessel_finding_id, modality, phase, mla_mm2, plaque_burden_pct) values (vf, 'ivus', 'pre', 3.10, 72);
  insert into public.intravascular_imaging (vessel_finding_id, modality, phase, msa_mm2, stent_expansion_pct, malapposition) values (vf, 'ivus', 'post', 6.40, 91, false);
  insert into r (c,o) values ('imaging: IVUS pre and post rows saved', case when (select count(*) from public.intravascular_imaging where vessel_finding_id = vf) = 2 then 'PASS' else 'FAIL' end);

  -- ─── §2.5 haemodynamics, §2.6 LV ────────────────────────────────────────────
  begin insert into public.haemodynamics (procedure_id, left_status) values (pa, 'recorded');
    insert into r (c,o) values ('haemodynamics: recorded needs a value', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('haemodynamics: recorded needs a value', 'PASS'); end;
  begin insert into public.haemodynamics (procedure_id, left_status, lv_edp) values (pa, 'not_performed', 12);
    insert into r (c,o) values ('haemodynamics: not performed has no values', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('haemodynamics: not performed has no values', 'PASS'); end;
  insert into public.haemodynamics (procedure_id, left_status) values (pa, 'not_performed');
  insert into r (c,o) values ('haemodynamics: "not performed" saved as a recorded fact', 'PASS');
  begin insert into public.haemodynamics (procedure_id, left_status) values (pa, 'not_recorded');
    insert into r (c,o) values ('haemodynamics: one row per procedure', 'FAIL');
  exception when unique_violation then insert into r (c,o) values ('haemodynamics: one row per procedure', 'PASS'); end;
  begin insert into public.lv_wall_motion (procedure_id, segment, motion) values (pa, 18, 'akinetic');
    insert into r (c,o) values ('wall motion: AHA segments 1–17', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('wall motion: AHA segments 1–17', 'PASS'); end;
  insert into public.lv_wall_motion (procedure_id, segment, motion) values (pa, 7, 'hypokinetic');

  -- ─── §2.8 interventions, §2.9 inflations ────────────────────────────────────
  insert into public.interventions (procedure_id, vessel_finding_id, intervention_type, guidewire, residual_stenosis_pct, timi_flow_post, success)
    values (pa, vf, 'pci_des', 'Probe wire', 0, 3, true) returning id into iv;
  begin update public.interventions set techniques = array['predilation', 'other']::public.technique[] where id = iv;
    insert into r (c,o) values ('intervention: technique "other" needs a description', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('intervention: technique "other" needs a description', 'PASS'); end;
  begin update public.interventions set bifurcation_strategy = 'other' where id = iv;
    insert into r (c,o) values ('intervention: bifurcation strategy "other" needs a description', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('intervention: bifurcation strategy "other" needs a description', 'PASS'); end;
  begin update public.interventions set dissection_grade = 'b' where id = iv;
    insert into r (c,o) values ('intervention: dissection grade only when dissection', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('intervention: dissection grade only when dissection', 'PASS'); end;
  begin update public.interventions set perforation_class = 'ellis_2' where id = iv;
    insert into r (c,o) values ('intervention: Ellis class only when perforation', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('intervention: Ellis class only when perforation', 'PASS'); end;
  begin update public.interventions set failure_reason = 'unable_to_cross' where id = iv;
    insert into r (c,o) values ('intervention: failure reason only when not successful', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('intervention: failure reason only when not successful', 'PASS'); end;
  update public.interventions set techniques = array['predilation', 'pot', 'kissing_balloon']::public.technique[],
    bifurcation_strategy = 'provisional', wires = array['Wire A', 'Wire B'] where id = iv;
  insert into r (c,o) values ('intervention: techniques, provisional strategy and two wires saved',
    case when (select cardinality(techniques) = 3 and cardinality(wires) = 2 from public.interventions where id = iv) then 'PASS' else 'FAIL' end);
  insert into public.devices_used (intervention_id, phase, category, product_name, diameter_mm, length_mm, lot_number)
    values (iv, 'deployment', 'stent', 'Probe DES', 3, 20, 'SYN-P-1') returning id into dev;
  insert into public.device_inflations (device_id, sequence, pressure_atm, duration_s) values (dev, 1, 12, 20), (dev, 2, 16, 15);
  begin insert into public.device_inflations (device_id, sequence, pressure_atm) values (dev, 2, 18);
    insert into r (c,o) values ('inflation log: sequence unique per device', 'FAIL');
  exception when unique_violation then insert into r (c,o) values ('inflation log: sequence unique per device', 'PASS'); end;

  -- ─── §2.10 indication detail ────────────────────────────────────────────────
  begin update public.procedures set stress_test_result = 'positive', stress_test_type = null where id = pa;
    insert into r (c,o) values ('indication: stress result only with a stress test', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('indication: stress result only with a stress test', 'PASS'); end;
  begin update public.procedures set door_at = '2026-09-10T10:00:00+05:30', device_time_at = '2026-09-10T09:30:00+05:30' where id = pa;
    insert into r (c,o) values ('indication: device time cannot precede door (no negative door-to-device)', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('indication: device time cannot precede door (no negative door-to-device)', 'PASS'); end;
  insert into r (c,o) values ('indication: shock / arrest / thrombolysis default false; prior PCI/CABG unknown',
    case when (select not cardiogenic_shock and not cardiac_arrest_pre_procedure and not thrombolysis_given and prior_pci is null and prior_cabg is null
               from public.procedures where id = pa) then 'PASS' else 'FAIL' end);

  -- ─── §2.8a events, §2.11 outcomes ───────────────────────────────────────────
  begin insert into public.complications (procedure_id, complication, severity, management, treatments) values (pa, 'perforation', 'major', 'Covered stent', array['none', 'covered_stent']::public.event_treatment[]);
    insert into r (c,o) values ('event: "none" cannot sit with other treatments', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('event: "none" cannot sit with other treatments', 'PASS'); end;
  insert into public.complications (procedure_id, complication, severity, management, treatments, resolution, onset)
    values (pa, 'perforation', 'major', 'Covered stent and pericardiocentesis', array['covered_stent', 'pericardiocentesis']::public.event_treatment[], 'resolved', 'intraprocedural')
    returning id into ev;
  insert into public.complications (procedure_id, complication, severity, management) values (pb, 'no_reflow', 'minor', 'IC adenosine') returning id into evb;

  insert into public.in_hospital_outcomes (procedure_id) values (pa) returning id into oc;
  insert into r (c,o) values ('outcomes: every outcome defaults to not_recorded (never "no")',
    case when (select mi = 'not_recorded' and stroke = 'not_recorded' and death = 'not_recorded' and bleeding = 'not_recorded'
                      and transfusion = 'not_recorded' and vascular_status = 'not_recorded' and aki = 'not_recorded'
                      and new_dialysis = 'not_recorded' and emergency_cabg = 'not_recorded' and cardiac_tamponade = 'not_recorded'
                      and unplanned_repeat_pci = 'not_recorded' from public.in_hospital_outcomes where id = oc) then 'PASS' else 'FAIL' end);
  begin update public.in_hospital_outcomes set vascular_complications = array['haematoma']::public.vascular_complication[] where id = oc;
    insert into r (c,o) values ('outcomes: vascular list needs vascular_status = yes', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('outcomes: vascular list needs vascular_status = yes', 'PASS'); end;
  begin update public.in_hospital_outcomes set vascular_status = 'yes' where id = oc;
    insert into r (c,o) values ('outcomes: vascular_status = yes needs at least one complication', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('outcomes: vascular_status = yes needs at least one complication', 'PASS'); end;
  update public.in_hospital_outcomes set vascular_status = 'yes', vascular_complications = array['haematoma', 'pseudoaneurysm']::public.vascular_complication[] where id = oc;
  insert into r (c,o) values ('outcomes: vascular complications are a multi-select', 'PASS');
  begin update public.in_hospital_outcomes set bleeding_barc = 2 where id = oc;
    insert into r (c,o) values ('outcomes: BARC only when bleeding = yes', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('outcomes: BARC only when bleeding = yes', 'PASS'); end;
  begin update public.in_hospital_outcomes set bleeding = 'yes', bleeding_barc = 2, bleeding_barc_sub = 'a' where id = oc;
    insert into r (c,o) values ('outcomes: BARC sub-class only for BARC 3', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('outcomes: BARC sub-class only for BARC 3', 'PASS'); end;
  update public.in_hospital_outcomes set bleeding = 'yes', bleeding_barc = 3, bleeding_barc_sub = 'a', transfusion = 'yes' where id = oc;
  begin update public.in_hospital_outcomes set death = 'yes' where id = oc;
    insert into r (c,o) values ('outcomes: death = yes needs disposition deceased (same row)', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('outcomes: death = yes needs disposition deceased (same row)', 'PASS'); end;
  begin update public.in_hospital_outcomes set disposition = 'deceased' where id = oc;
    insert into r (c,o) values ('outcomes: disposition deceased needs death = yes', 'FAIL');
  exception when check_violation then insert into r (c,o) values ('outcomes: disposition deceased needs death = yes', 'PASS'); end;
  begin update public.in_hospital_outcomes set death = 'yes', disposition = 'deceased' where id = oc;
    insert into r (c,o) values ('outcomes: death = yes needs post-procedure condition deceased', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('outcomes: death = yes needs post-procedure condition deceased', 'PASS'); end;

  -- Event links
  begin update public.in_hospital_outcomes set cardiac_tamponade = 'yes', event_links = array[evb] where id = oc;
    insert into r (c,o) values ('outcomes: a link to another procedure''s event is refused', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('outcomes: a link to another procedure''s event is refused', 'PASS'); end;
  update public.in_hospital_outcomes set cardiac_tamponade = 'yes', event_links = array[ev] where id = oc;
  insert into r (c,o) values ('outcomes: tamponade linked to the perforation event', 'PASS');
  begin update public.in_hospital_outcomes set event_links = array[ev, ev] where id = oc;
    insert into r (c,o) values ('outcomes: duplicate links refused', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('outcomes: duplicate links refused', 'PASS'); end;

  -- Event type ⇒ matching outcome is not "no", from both sides.
  insert into public.complications (procedure_id, complication, severity, management) values (pa, 'cardiac_tamponade', 'major', 'Pericardiocentesis');
  begin update public.in_hospital_outcomes set cardiac_tamponade = 'no', event_links = '{}' where id = oc;
    insert into r (c,o) values ('rule: outcome cannot be "no" while a tamponade event exists', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('rule: outcome cannot be "no" while a tamponade event exists', 'PASS'); end;
  update public.in_hospital_outcomes set stroke = 'no' where id = oc;
  begin insert into public.complications (procedure_id, complication, severity, management) values (pa, 'stroke', 'major', 'Neurology review');
    insert into r (c,o) values ('rule: a stroke event cannot be added while the outcome says "no"', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('rule: a stroke event cannot be added while the outcome says "no"', 'PASS'); end;

  -- Deleting a linked event drops the link.
  delete from public.complications where id = ev;
  insert into r (c,o) values ('deleting a linked event removes it from event_links',
    case when (select cardinality(event_links) from public.in_hospital_outcomes where id = oc) = 0 then 'PASS' else 'FAIL' end);

  -- Death and discharge (probe B): a death has no discharge, from both sides.
  insert into public.discharges (procedure_id, discharge_date, discharged_at, clinical_status, follow_up_date, follow_up_clinic)
    values (pb, date '2026-09-12', timestamptz '2026-09-12 12:00+05:30', 'stable', date '2026-09-20', 'Cardiology OPD');
  update public.procedures set post_procedure_condition = 'deceased' where id = pb;
  insert into public.in_hospital_outcomes (procedure_id) values (pb);
  begin update public.in_hospital_outcomes set death = 'yes', disposition = 'deceased', death_cause = 'Cardiogenic shock' where procedure_id = pb;
    insert into r (c,o) values ('rule: death = yes refused while a discharge exists', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('rule: death = yes refused while a discharge exists', 'PASS'); end;
  delete from public.discharges where procedure_id = pb;
  update public.in_hospital_outcomes set death = 'yes', disposition = 'deceased', death_cause = 'Cardiogenic shock' where procedure_id = pb;
  insert into r (c,o) values ('rule: death recorded once the discharge is removed', 'PASS');
  begin insert into public.discharges (procedure_id, discharge_date, discharged_at, clinical_status, follow_up_date, follow_up_clinic)
      values (pb, date '2026-09-12', timestamptz '2026-09-12 12:00+05:30', 'stable', date '2026-09-20', 'Cardiology OPD');
    insert into r (c,o) values ('rule: no discharge can be added after a death', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('rule: no discharge can be added after a death', 'PASS'); end;
  begin update public.procedures set post_procedure_condition = 'stable' where id = pb;
    insert into r (c,o) values ('rule: condition cannot leave deceased while the outcome records a death', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('rule: condition cannot leave deceased while the outcome records a death', 'PASS'); end;
  -- Deferred: the same facts in the "wrong" order pass, because the rules are checked at the end.
  begin
    set constraints all deferred;
    update public.in_hospital_outcomes set death = 'not_recorded', disposition = null, death_cause = null where procedure_id = pb;
    update public.procedures set post_procedure_condition = 'stable' where id = pb;
    update public.in_hospital_outcomes set death = 'yes', disposition = 'deceased' where procedure_id = pb;  -- condition not yet deceased
    update public.procedures set post_procedure_condition = 'deceased' where id = pb;
    set constraints all immediate;  -- runs the pending checks now
    insert into r (c,o) values ('deferred rules: death before condition in one transaction is accepted at the end', 'PASS');
  exception when others then insert into r (c,o) values ('deferred rules: death before condition in one transaction is accepted at the end', 'FAIL '||sqlerrm); end;

  -- ─── §2.12 registry completeness ────────────────────────────────────────────
  select * into rc from public.registry_completeness(pa);
  insert into r (c,o) values ('registry: total is 42', case when rc.total = 42 then 'PASS' else 'FAIL '||rc.total end);
  insert into r (c,o) values ('registry: filled + missing = total',
    case when rc.filled + cardinality(rc.missing) = rc.total then 'PASS' else 'FAIL' end);
  insert into r (c,o) values ('registry: recorded outcomes count, not_recorded ones are missing',
    case when 'outcome_bleeding' <> all (rc.missing) and 'outcome_mi' = any (rc.missing) then 'PASS' else 'FAIL '||array_to_string(rc.missing, ',') end);
  n := rc.filled;
  update public.in_hospital_outcomes set mi = 'no' where id = oc;
  insert into r (c,o) values ('registry: recording MI as "no" adds one',
    case when (select filled from public.registry_completeness(pa)) = n + 1 then 'PASS' else 'FAIL' end);
  insert into r (c,o) values ('registry: intermediate lesion (60%) with an FFR row is assessed',
    case when not exists (select 1 from public.registry_completeness(pa) x where 'intermediate_lesion_assessment' = any (x.missing)) then 'PASS' else 'FAIL' end);
  insert into r (c,o) values ('registry: unknown procedure → no row',
    case when not exists (select 1 from public.registry_completeness('00000000-0000-4000-8000-00000000dead')) then 'PASS' else 'FAIL' end);

  -- ─── Snapshot covers the new tables ─────────────────────────────────────────
  snap1 := public.procedure_snapshot(pa);
  insert into r (c,o) values ('snapshot: has grafts, haemodynamics, lv_wall_motion, in_hospital_outcomes',
    case when snap1 ? 'grafts' and snap1 ? 'haemodynamics' and snap1 ? 'lv_wall_motion' and snap1 ? 'in_hospital_outcomes' then 'PASS' else 'FAIL' end);
  insert into r (c,o) values ('snapshot: physiology and imaging nested under their lesion; graft lesion names its graft',
    case when (select count(*) from jsonb_array_elements(snap1->'vessel_findings') x
               where jsonb_array_length(x->'physiology') = 1 and jsonb_array_length(x->'imaging') = 2) = 1
          and (select count(*) from jsonb_array_elements(snap1->'vessel_findings') x where x->'graft'->>'graft_type' = 'svg') = 1
         then 'PASS' else 'FAIL' end);
  insert into r (c,o) values ('snapshot: inflations nested under their device; no row ids in the child parts',
    case when jsonb_array_length(snap1->'interventions'->0->'devices'->0->'inflations') = 2
          and (snap1->'vessel_findings')::text || (snap1->'interventions')::text || (snap1->'in_hospital_outcomes')::text || (snap1->'grafts')::text
              !~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' then 'PASS' else 'FAIL' end);
  update public.device_inflations set duration_s = 25 where device_id = dev and sequence = 1;
  snap2 := public.procedure_snapshot(pa);
  insert into r (c,o) values ('snapshot: an inflation edit changes the snapshot', case when snap1 <> snap2 then 'PASS' else 'FAIL' end);
end $$;

-- ─── Reviewed records stay read-only; an amendment can change Week 7 fields ───
do $$
declare
  p5 uuid; p18 uuid; v5 uuid; v18 uuid; dev5 uuid; n int; snap jsonb;
begin
  select id into p5 from public.procedures where case_code = 'PCI-2026-005';
  select id into p18 from public.procedures where case_code = 'CAG-2026-018';
  select id into v5 from public.vessel_findings where procedure_id = p5 limit 1;
  select id into v18 from public.vessel_findings where procedure_id = p18 limit 1;
  select d.id into dev5 from public.devices_used d join public.interventions i on i.id = d.intervention_id where i.procedure_id = p5 limit 1;

  begin insert into public.lesion_physiology (vessel_finding_id, phase, index, value) values (v5, 'pre', 'ffr', 0.75);
    insert into r (c,o) values ('reviewed: physiology insert refused (guard via the lesion)', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('reviewed: physiology insert refused (guard via the lesion)', 'PASS'); end;
  begin insert into public.device_inflations (device_id, sequence, pressure_atm) values (dev5, 1, 14);
    insert into r (c,o) values ('reviewed: inflation insert refused (guard via the device)', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('reviewed: inflation insert refused (guard via the device)', 'PASS'); end;
  begin update public.haemodynamics set ao_mean = 95 where procedure_id = p5;
    insert into r (c,o) values ('reviewed: copied haemodynamics row cannot be edited', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('reviewed: copied haemodynamics row cannot be edited', 'PASS'); end;
  begin insert into public.in_hospital_outcomes (procedure_id) values (p5);
    insert into r (c,o) values ('reviewed: outcomes insert refused', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('reviewed: outcomes insert refused', 'PASS'); end;
  delete from public.haemodynamics where procedure_id = p5;
  get diagnostics n = row_count;
  insert into r (c,o) values ('reviewed: deleting haemodynamics touches 0 rows (RLS)', case when n = 0 then 'PASS' else 'FAIL' end);
  begin update public.interventions set techniques = array['poba']::public.technique[] where procedure_id = p5;
    insert into r (c,o) values ('reviewed: new intervention columns are read-only too', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('reviewed: new intervention columns are read-only too', 'PASS'); end;

  -- Amending: Week 7 fields become editable and the snapshot shows the change.
  begin perform public.open_amendment(p18, 'Adding the physiology result that was missed');
  exception when others then insert into r (c,o) values ('amending: amendment opened', 'FAIL '||sqlerrm); end;
  begin
    insert into public.lesion_physiology (vessel_finding_id, phase, index, value, decision) values (v18, 'pre', 'ifr', 0.93, 'defer');
    insert into public.in_hospital_outcomes (procedure_id, mi, stroke) values (p18, 'no', 'no');
    insert into r (c,o) values ('amending: physiology and outcomes can be added', 'PASS');
  exception when others then insert into r (c,o) values ('amending: physiology and outcomes can be added', 'FAIL '||sqlerrm); end;
  select snapshot into snap from public.procedure_amendments where procedure_id = p18 and status = 'open';
  insert into r (c,o) values ('amending: record now differs from the snapshot at unlock (the diff will list it)',
    case when snap is distinct from public.procedure_snapshot(p18) then 'PASS' else 'FAIL' end);
  begin perform public.close_amendment(p18, (select id from public.operators order by full_name limit 1), '[]'::jsonb);
    insert into r (c,o) values ('amending: an empty change list is refused (lying-diff check sees Week 7 tables)', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('amending: an empty change list is refused (lying-diff check sees Week 7 tables)', 'PASS'); end;
end $$;

-- Service role bypasses RLS and grants: the guards on the new tables must still hold.
reset role;
do $$
begin
  begin insert into public.lv_wall_motion (procedure_id, segment, motion)
      values ((select id from public.procedures where case_code = 'PCI-2026-005'), 3, 'akinetic');
    insert into r (c,o) values ('service role: reviewed record''s wall motion still refused (trigger)', 'FAIL');
  exception when raise_exception then insert into r (c,o) values ('service role: reviewed record''s wall motion still refused (trigger)', 'PASS'); end;
end $$;
set local role anon;
do $$ begin
  begin perform 1 from public.haemodynamics limit 1;
    insert into r (c,o) values ('anon cannot read the new tables', 'FAIL');
  exception when insufficient_privilege then insert into r (c,o) values ('anon cannot read the new tables', 'PASS'); end;
  begin perform public.registry_completeness('00000000-0000-4000-8000-0000000011a1');
    insert into r (c,o) values ('anon cannot call registry_completeness', 'FAIL');
  exception when insufficient_privilege then insert into r (c,o) values ('anon cannot call registry_completeness', 'PASS'); end;
end $$;
reset role;
do $$ declare s text; begin select string_agg(o||'  '||c, E'\n' order by n) into s from r; raise exception E'PROBE (rolled back)\n%', s; end $$;
