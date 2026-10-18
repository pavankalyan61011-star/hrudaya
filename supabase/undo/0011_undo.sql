-- Undo of 0011_structured_reporting.sql (Week 7). Returns the schema to its 0010 state.
--
-- WHEN IT IS SAFE TO RUN: only before any Week 7 data exists on production that we want to keep.
-- It drops the Week 7 tables and columns, and everything recorded in them goes with them (lesion
-- detail, physiology, imaging, haemodynamics, wall motion, grafts, techniques, inflation logs, event
-- treatments, in-hospital outcomes, indication detail). The old columns 0011 copied from
-- (aortic pressure, LVEDP, guidewire) were never changed by the migration and stay as they are.
--
-- It refuses to run
--   * while any amendment is open (its stored snapshot has the Week 7 shape), and
--   * when Week 7 data exists beyond what 0011 itself copied in — unless the session first runs
--       set hrudaya.undo_0011_discard_week7_data = 'yes';
--     which is a deliberate decision to throw that data away.
-- Rehearsed on a local copy (see docs/structured-reporting.md): 0010 schema → 0011 → test rows →
-- undo → schema identical to 0010 except as noted below; Week 6 behaviour checks pass.
--
-- What cannot be undone: the 11 values 0011 added to public.complication_type (Postgres cannot drop an
-- enum value). They stay, unused by the 0010 code; any complications row that uses one keeps it.
--
-- Run with the same command as a migration, e.g.
--   docker exec -i supabase_db_hrudaya psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/undo/0011_undo.sql
-- NOT for production unless the owner has decided so.

begin;

-- ─── Refusals ─────────────────────────────────────────────────────────────────

do $$
declare
  week7 bigint;
begin
  if exists (select 1 from public.procedure_amendments where status = 'open') then
    raise exception 'Close every open amendment before undoing 0011 (its snapshot has the Week 7 shape)';
  end if;

  -- Week 7 data that is not 0011's own copy: rows in the new tables (haemodynamics counts only when it
  -- differs from the old columns it was copied from), and Week 7 columns away from their defaults.
  select
      (select count(*) from public.lesion_physiology) + (select count(*) from public.intravascular_imaging)
    + (select count(*) from public.grafts) + (select count(*) from public.lv_wall_motion)
    + (select count(*) from public.device_inflations) + (select count(*) from public.in_hospital_outcomes)
    + (select count(*) from public.haemodynamics h join public.procedures p on p.id = h.procedure_id
        where h.recorded_by is not null or h.left_status <> 'recorded' or h.ao_mean is not null or h.lv_systolic is not null
           or h.heart_rate_at_measurement is not null or h.rhythm is not null
           or h.ao_systolic is distinct from p.aortic_pressure_systolic or h.ao_diastolic is distinct from p.aortic_pressure_diastolic
           or h.lv_edp is distinct from (case when p.lvedp_status = 'recorded' then p.lvedp_mmhg end))
    + (select count(*) from public.vessel_findings
        where lesion_class is not null or ostial or bifurcation_medina is not null or tortuosity is not null or cto
           or in_stent_restenosis or collaterals_rentrop is not null or timi_frame_count is not null or graft_id is not null
           or stenosis_source <> 'typed' or mld_mm is not null or rvd_mm is not null or measurement_method is not null
           or image_study_uid is not null or image_series_uid is not null or image_instance_uid is not null
           or image_frame is not null or image_view is not null)
    + (select count(*) from public.interventions
        where cardinality(techniques) > 0 or bifurcation_strategy is not null or guiding_catheter is not null
           or dissection_grade is not null or perforation_class is not null or no_reflow or failure_reason is not null
           or stent_overlap or total_stent_length_mm is not null
           or wires is distinct from (case when nullif(btrim(guidewire), '') is not null and lower(btrim(guidewire)) <> 'not recorded'
                                           then array[btrim(guidewire)] else '{}'::text[] end))
    + (select count(*) from public.complications
        where grade is not null or cardinality(treatments) > 0 or resolution is not null)
    + (select count(*) from public.procedures
        where mitral_regurgitation_grade is not null or lv_gram_performed is not null or ccs_class is not null
           or nyha_class is not null or stress_test_type is not null or cardiogenic_shock or cardiac_arrest_pre_procedure
           or symptom_onset_at is not null or first_medical_contact_at is not null or door_at is not null
           or device_time_at is not null or thrombolysis_given or prior_pci is not null or prior_cabg is not null)
    into week7;
  if week7 > 0 and current_setting('hrudaya.undo_0011_discard_week7_data', true) is distinct from 'yes' then
    raise exception 'Week 7 data exists (% rows/fields). Undoing 0011 would delete it. To discard it on purpose, first run: set hrudaya.undo_0011_discard_week7_data = ''yes'';', week7;
  end if;
end;
$$;

-- ─── Functions and triggers added by 0011 ─────────────────────────────────────

drop trigger if exists check_outcome_rules on public.discharges;
drop trigger if exists check_outcome_rules on public.complications;
drop trigger if exists check_outcome_rules on public.procedures;
drop trigger if exists unlink_deleted_event on public.complications;
drop function if exists public.registry_completeness(uuid);

-- ─── Tables added by 0011 (their triggers, policies and indexes go with them) ─

drop table if exists public.in_hospital_outcomes;
drop table if exists public.device_inflations;
drop table if exists public.lv_wall_motion;
drop table if exists public.haemodynamics;
drop table if exists public.intravascular_imaging;
drop table if exists public.lesion_physiology;

alter table public.vessel_findings drop constraint if exists vessel_findings_graft_fk;
drop table if exists public.grafts;

drop function if exists public.check_outcome_rules();
drop function if exists public.check_outcome_rules_for(uuid);
drop function if exists public.unlink_deleted_event();
drop function if exists public.set_recorded_columns();

-- ─── Columns added by 0011 (their CHECK constraints go with them) ─────────────

alter table public.vessel_findings
  drop column if exists lesion_class, drop column if exists ostial, drop column if exists bifurcation_medina,
  drop column if exists tortuosity, drop column if exists cto, drop column if exists cto_duration_months,
  drop column if exists in_stent_restenosis, drop column if exists isr_pattern, drop column if exists collaterals_rentrop,
  drop column if exists timi_frame_count, drop column if exists graft_id, drop column if exists stenosis_source,
  drop column if exists mld_mm, drop column if exists rvd_mm, drop column if exists measurement_method,
  drop column if exists image_study_uid, drop column if exists image_series_uid, drop column if exists image_instance_uid,
  drop column if exists image_frame, drop column if exists image_view;

alter table public.interventions
  drop column if exists techniques, drop column if exists technique_other, drop column if exists bifurcation_strategy,
  drop column if exists bifurcation_strategy_other, drop column if exists guiding_catheter, drop column if exists wires,
  drop column if exists dissection_grade, drop column if exists perforation_class, drop column if exists no_reflow,
  drop column if exists failure_reason, drop column if exists stent_overlap, drop column if exists total_stent_length_mm;

alter table public.complications
  drop column if exists grade, drop column if exists treatments, drop column if exists treatment_other,
  drop column if exists resolution;

alter table public.procedures
  drop column if exists mitral_regurgitation_grade, drop column if exists lv_gram_performed, drop column if exists ccs_class,
  drop column if exists nyha_class, drop column if exists stress_test_type, drop column if exists stress_test_result,
  drop column if exists cardiogenic_shock, drop column if exists cardiac_arrest_pre_procedure,
  drop column if exists symptom_onset_at, drop column if exists first_medical_contact_at, drop column if exists door_at,
  drop column if exists device_time_at, drop column if exists thrombolysis_given, drop column if exists prior_pci,
  drop column if exists prior_cabg;

-- ─── Functions 0011 replaced: back to their 0010 bodies (taken from the live 0010 database) ───

CREATE OR REPLACE FUNCTION public.procedure_snapshot(p_procedure_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'procedure',
      pg_catalog.to_jsonb(p) - array['id', 'patient_id', 'case_code', 'procedure_date', 'status', 'created_at', 'updated_at',
                                     'created_by', 'reviewed_by', 'reviewed_at', 'reviewing_clinician_id'],
    'vessel_findings', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(v) - array['id', 'procedure_id', 'created_at', 'updated_at', 'created_by']
        order by v.vessel::text collate "C", v.segment::text collate "C" nulls first, v.stenosis_pct nulls first, v.timi_flow nulls first,
                 v.is_culprit nulls first, v.lesion_length_mm nulls first, v.calcification::text collate "C" nulls first,
                 v.thrombus nulls first, v.bifurcation nulls first, v.lesion_notes collate "C" nulls first)
      from public.vessel_findings v where v.procedure_id = p.id), '[]'::jsonb),
    'interventions', coalesce((
      select pg_catalog.jsonb_agg(
        (pg_catalog.to_jsonb(i) - array['id', 'procedure_id', 'vessel_finding_id', 'created_at', 'updated_at', 'created_by'])
        || pg_catalog.jsonb_build_object(
             'lesion', pg_catalog.jsonb_build_object('vessel', vf.vessel, 'segment', vf.segment),
             'devices', coalesce((
               select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) - array['id', 'intervention_id', 'created_at', 'updated_at', 'created_by']
                 order by d.phase::text collate "C", d.category::text collate "C", d.product_name collate "C" nulls first,
                          d.diameter_mm nulls first, d.length_mm nulls first, d.inflation_atm nulls first, d.lot_number collate "C" nulls first,
                          d.expiry_date nulls first, d.udi collate "C" nulls first, d.manufacturer collate "C" nulls first, d.quantity nulls first)
               from public.devices_used d where d.intervention_id = i.id), '[]'::jsonb))
        order by vf.vessel::text collate "C" nulls first, vf.segment::text collate "C" nulls first, i.intervention_type::text collate "C",
                 i.residual_stenosis_pct nulls first, i.timi_flow_post nulls first, i.guidewire collate "C" nulls first, i.notes collate "C" nulls first)
      from public.interventions i left join public.vessel_findings vf on vf.id = i.vessel_finding_id
      where i.procedure_id = p.id), '[]'::jsonb),
    'procedure_medications', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) - array['id', 'procedure_id', 'created_at', 'updated_at', 'created_by']
        order by m.timing::text collate "C", m.drug_name collate "C", m.administered_at nulls first, m.dose nulls first,
                 m.dose_unit::text collate "C" nulls first, m.route::text collate "C", m.act_seconds nulls first,
                 m.act_measured_at nulls first, m.notes collate "C" nulls first)
      from public.procedure_medications m where m.procedure_id = p.id), '[]'::jsonb),
    'complications', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) - array['id', 'procedure_id', 'created_at', 'updated_at', 'created_by']
        order by c.complication::text collate "C", c.onset::text collate "C" nulls first, c.onset_at nulls first,
                 c.severity::text collate "C", c.management collate "C" nulls first, c.outcome collate "C" nulls first)
      from public.complications c where c.procedure_id = p.id), '[]'::jsonb),
    'discharge', (
      select (pg_catalog.to_jsonb(d) - array['id', 'procedure_id', 'created_at', 'updated_at', 'created_by'])
        || pg_catalog.jsonb_build_object('medications', coalesce((
             select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) - array['id', 'discharge_id', 'created_at', 'updated_at', 'created_by']
               order by m.drug_name collate "C", m.dose nulls first, m.dose_unit::text collate "C" nulls first, m.frequency::text collate "C",
                        m.route::text collate "C", m.duration collate "C" nulls first, m.purpose collate "C" nulls first, m.is_dapt)
             from public.discharge_medications m where m.discharge_id = d.id), '[]'::jsonb))
      from public.discharges d where d.procedure_id = p.id)
  )
  from public.procedures p
  where p.id = p_procedure_id
$function$;

CREATE OR REPLACE FUNCTION public.guard_reviewed_child()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  parent uuid;
begin
  if tg_table_name = 'devices_used' then
    select i.procedure_id into parent from public.interventions i where i.id = new.intervention_id;
  elsif tg_table_name = 'discharge_medications' then
    select d.procedure_id into parent from public.discharges d where d.id = new.discharge_id;
  else
    parent := new.procedure_id;
  end if;

  if exists (select 1 from public.procedures p where p.id = parent and p.status::text = 'reviewed') then
    raise exception 'This procedure has been reviewed and is read-only'
      using errcode = 'P0001', hint = 'hrudaya:reviewed_read_only';
  end if;
  return new;
end;
$function$;

-- ─── Enum types added by 0011 ─────────────────────────────────────────────────

drop type if exists public.value_source, public.tri_state, public.lesion_class, public.tortuosity_grade, public.isr_pattern,
  public.stenosis_method, public.measurement_phase, public.physiology_index, public.hyperaemic_agent,
  public.physiology_decision, public.physiology_method, public.imaging_modality, public.imaging_method,
  public.heart_rhythm, public.wall_motion, public.graft_type, public.graft_patency, public.graft_lesion_location,
  public.technique, public.bifurcation_strategy, public.dissection_grade, public.perforation_class,
  public.pci_failure_reason, public.event_treatment, public.event_resolution, public.stress_test_type,
  public.stress_test_result, public.vascular_complication, public.disposition;

commit;
