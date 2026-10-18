-- Undo 0012: put registry element 33 back to "guiding_catheter", exactly as 0011 defined it.
-- Function only; safe at any time. Deploy the matching lib/registry/nic-elements.ts with it.

begin;

create or replace function public.registry_completeness(p_procedure_id uuid)
returns table (filled integer, total integer, missing text[])
language sql
stable
set search_path = ''
as $$
  with
  p as (select * from public.procedures where id = p_procedure_id),
  pt as (select pa.* from public.patients pa join p on pa.id = p.patient_id),
  o as (select * from public.in_hospital_outcomes where procedure_id = p_procedure_id),
  treated as (
    select v.*, i.id as intervention_id, i.techniques, i.guiding_catheter as i_guiding_catheter
    from public.interventions i join public.vessel_findings v on v.id = i.vessel_finding_id
    where i.procedure_id = p_procedure_id
  ),
  facts as (
    select
      (select indication::text from p) as indication,
      exists (select 1 from treated) as has_pci
  ),
  e (ord, key, ok) as (
    values
      (1,  'patient_date_of_birth',      (select date_of_birth is not null from pt)),
      (2,  'patient_sex',                (select sex is not null from pt)),
      (3,  'admission_at',               (select admitted_at is not null from p)),
      (4,  'indication',                 (select indication is not null from p)),
      (5,  'urgency',                    (select urgency is not null from p)),
      (6,  'ccs_class',                  (select indication = 'stemi' from facts) or (select ccs_class is not null from p)),
      (7,  'nyha_class',                 (select nyha_class is not null from p)),
      (8,  'cardiogenic_shock',          (select cardiogenic_shock is not null from p)),
      (9,  'cardiac_arrest_pre',         (select cardiac_arrest_pre_procedure is not null from p)),
      (10, 'prior_pci',                  (select prior_pci is not null from p)),
      (11, 'prior_cabg',                 (select prior_cabg is not null from p)),
      (12, 'stress_test',                (select indication in ('stemi', 'nstemi', 'unstable_angina') from facts)
                                           or (select stress_test_type is not null from p)),
      (13, 'troponin',                   (select troponin_elevated is not null from p)),
      (14, 'symptom_onset_at',           (select indication is distinct from 'stemi' from facts) or (select symptom_onset_at is not null from p)),
      (15, 'first_medical_contact_at',   (select indication is distinct from 'stemi' from facts) or (select first_medical_contact_at is not null from p)),
      (16, 'door_at',                    (select indication is distinct from 'stemi' from facts) or (select door_at is not null from p)),
      (17, 'device_time_at',             (select indication is distinct from 'stemi' or not has_pci from facts) or (select device_time_at is not null from p)),
      (18, 'creatinine_pre',             (select creatinine_umol_l is not null from p)),
      (19, 'haemoglobin_pre',            (select haemoglobin_g_dl is not null from p)),
      (20, 'lvef_assessed',              (select lvef_status <> 'not_recorded' from p)),
      (21, 'procedure_start',            (select started_at is not null from p)),
      (22, 'access_site',                (select access_site is not null from p)),
      (23, 'primary_operator',           (select primary_operator_id is not null from p)),
      (24, 'contrast_volume',            (select contrast_volume_ml is not null from p)),
      (25, 'fluoroscopy_time',           (select fluoroscopy_time_min is not null from p)),
      (26, 'radiation_dose',             (select air_kerma_mgy is not null or dap_gy_cm2 is not null from p)),
      (27, 'coronary_dominance',         (select dominance is not null from p)),
      (28, 'coronary_anatomy',           exists (select 1 from public.vessel_findings v where v.procedure_id = p_procedure_id)),
      (29, 'lesion_class',               not exists (select 1 from treated where lesion_class is null)),
      (30, 'lesion_length',              not exists (select 1 from treated where lesion_length_mm is null)),
      (31, 'intermediate_lesion_assessment', not exists (
                                           select 1 from treated t
                                           where t.stenosis_pct between 40 and 69
                                             and not exists (select 1 from public.lesion_physiology lp where lp.vessel_finding_id = t.id)
                                             and not exists (select 1 from public.intravascular_imaging im where im.vessel_finding_id = t.id)
                                             and nullif(btrim(t.lesion_notes), '') is null)),
      (32, 'pci_techniques',             not exists (select 1 from treated where cardinality(techniques) = 0)),
      (33, 'guiding_catheter',           (select not has_pci from facts) or (select guiding_catheter is not null from p)
                                           or not exists (select 1 from treated where i_guiding_catheter is null)),
      (34, 'procedure_medications',      (select not has_pci from facts)
                                           or exists (select 1 from public.procedure_medications m where m.procedure_id = p_procedure_id)),
      (35, 'outcome_mi',                 coalesce((select mi <> 'not_recorded' from o), false)),
      (36, 'outcome_stroke',             coalesce((select stroke <> 'not_recorded' from o), false)),
      (37, 'outcome_death',              coalesce((select death <> 'not_recorded' from o), false)),
      (38, 'outcome_bleeding',           coalesce((select bleeding <> 'not_recorded' from o), false)),
      (39, 'outcome_transfusion',        coalesce((select transfusion <> 'not_recorded' from o), false)),
      (40, 'outcome_vascular',           coalesce((select vascular_status <> 'not_recorded' from o), false)),
      (41, 'outcome_aki',                coalesce((select aki <> 'not_recorded' from o), false)),
      (42, 'disposition',                coalesce((select disposition is not null from o), false))
  )
  select
    (count(*) filter (where coalesce(ok, false)))::integer,
    count(*)::integer,
    coalesce(array_agg(key order by ord) filter (where not coalesce(ok, false)), '{}')
  from e
  where exists (select 1 from p)
  having exists (select 1 from p)
$$;

revoke execute on function public.registry_completeness(uuid) from public, anon;
grant execute on function public.registry_completeness(uuid) to authenticated;

delete from supabase_migrations.schema_migrations where version = '0012';

commit;
