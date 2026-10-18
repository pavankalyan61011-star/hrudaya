-- Hrudaya 0011 — complete structured reporting fields (Week 7 spec §2). Additive only: nothing is
-- renamed or dropped.
--
--  §2.1  value_source enum (where a value came from; Week 7 writes only 'typed' / 'picked')
--  §2.2  vessel_findings: morphology, graft link, QCA-reserved values and image traceability
--  §2.3  lesion_physiology        §2.4  intravascular_imaging
--  §2.5  haemodynamics (left heart only; right heart / valves / shunts are Week 7b, backlog)
--  §2.6  LV function columns on procedures + lv_wall_motion
--  §2.7  grafts                   §2.8  interventions: techniques, bifurcation strategy, grading
--  §2.8a complications become the procedural-event list (treatment, resolution)
--  §2.9  device_inflations        §2.10 indication detail on procedures
--  §2.11 in_hospital_outcomes (tri_state, never a boolean defaulting to "no") and its rules
--  §2.12 registry_completeness(procedure_id) — the element list mirrors lib/registry/nic-elements.ts
--  + procedure_snapshot (Week 6) extended to every new table and column
--
-- Copied into the new homes, old columns kept: procedures.aortic_pressure_* and lvedp_mmhg →
-- haemodynamics (left block); interventions.guidewire → interventions.wires[1], except the seed's
-- "Not recorded" placeholder (guidewire is NOT NULL since 0001), which is not a wire: wires stays empty.
--
-- Interpretations (listed so they can be reviewed):
--  * New tables carry recorded_by / recorded_at (spec §2) instead of created_* / updated_at; a
--    trigger stamps them on insert from the signed-in user and the clock and freezes them after.
--  * "Present only when" rules are CHECK constraints. Rules that span tables (§2.11) are deferred
--    constraint triggers, checked at commit, so a multi-statement change can be made in any order.
--  * haemodynamics.heart_rate_at_measurement and rhythm are not tied to the left-heart block: they
--    describe the measurement session, which Week 7b's right-heart block will share.
--  * procedures.device_time_at may not precede door_at, so the derived door-to-device time can't be
--    negative. outcomes: disposition 'deceased' and death = 'yes' go together, both ways.
--  * Copying values into reviewed records holds off guard_reviewed_child and set_audit_columns for
--    those statements only (the copy is not a clinical edit; updated_at stays as it was).
--  * Refuses to run while an amendment is open: its stored snapshot predates the new columns, so
--    closing it would list every new column as a change.
--
-- New enum values are added outside the transaction and are not used below (Postgres cannot use
-- an enum value in the transaction that added it).

do $$
begin
  if exists (select 1 from public.procedure_amendments where status = 'open') then
    raise exception 'Close every open amendment before applying 0011 (its snapshot predates the new columns)';
  end if;
end;
$$;

-- §2.8a — procedural events (existing values kept). Arrhythmia uses the existing 'arrhythmia' value,
-- its type (VF / VT / complete heart block / AF with compromise) in complications.grade (owner, 2026-10-18).
alter type public.complication_type add value if not exists 'side_branch_closure';
alter type public.complication_type add value if not exists 'abrupt_vessel_closure';
alter type public.complication_type add value if not exists 'acute_stent_thrombosis';
alter type public.complication_type add value if not exists 'distal_embolisation';
alter type public.complication_type add value if not exists 'air_embolism';
alter type public.complication_type add value if not exists 'coronary_spasm';
alter type public.complication_type add value if not exists 'cardiac_arrest';
alter type public.complication_type add value if not exists 'new_cardiogenic_shock';
alter type public.complication_type add value if not exists 'contrast_reaction';
alter type public.complication_type add value if not exists 'pulmonary_oedema';
alter type public.complication_type add value if not exists 'unplanned_repeat_pci';

begin;

-- ─── Enums ────────────────────────────────────────────────────────────────────

create type public.value_source as enum (
  'typed', 'picked', 'scanned', 'measured_viewer', 'pullback', 'hemo_system', 'xray_dose', 'phone', 'generated'
);
create type public.tri_state as enum ('yes', 'no', 'not_recorded');

create type public.lesion_class as enum ('a', 'b1', 'b2', 'c');
create type public.tortuosity_grade as enum ('none', 'moderate', 'severe');
create type public.isr_pattern as enum ('focal', 'diffuse', 'proliferative', 'occlusive');
create type public.stenosis_method as enum ('visual', 'qca_manual_edge', 'qca_auto_edge');

create type public.measurement_phase as enum ('pre', 'post');
create type public.physiology_index as enum ('ffr', 'ifr', 'rfr', 'dfr', 'pd_pa_rest');
create type public.hyperaemic_agent as enum ('adenosine_iv', 'adenosine_ic', 'papaverine', 'regadenoson', 'none');
create type public.physiology_decision as enum ('defer', 'treat');
create type public.physiology_method as enum ('pressure_wire', 'angiography_derived');

create type public.imaging_modality as enum ('ivus', 'oct', 'nirs_ivus');
create type public.imaging_method as enum ('manual', 'vendor_auto');

create type public.heart_rhythm as enum ('sinus', 'af', 'paced', 'other');
create type public.wall_motion as enum ('hypokinetic', 'akinetic', 'dyskinetic', 'aneurysmal');

create type public.graft_type as enum ('lima', 'rima', 'svg', 'radial', 'gastroepiploic', 'other');
create type public.graft_patency as enum ('patent', 'stenosed', 'occluded', 'not_visualised');
create type public.graft_lesion_location as enum ('ostial', 'body', 'distal_anastomosis');

create type public.technique as enum (
  'poba', 'predilation', 'direct_stent', 'post_dilation', 'pot', 're_pot', 'kissing_balloon', 'thrombectomy',
  'rotational_atherectomy', 'orbital_atherectomy', 'intravascular_lithotripsy', 'laser_atherectomy', 'cutting_balloon',
  'scoring_balloon', 'drug_coated_balloon', 'cto_antegrade', 'cto_retrograde', 'bailout_stent', 'other'
);
create type public.bifurcation_strategy as enum (
  'provisional', 't_tap', 'culotte', 'dk_crush', 'mini_crush', 'simultaneous_kissing_stents', 'other'
);
create type public.dissection_grade as enum ('a', 'b', 'c', 'd', 'e', 'f');
create type public.perforation_class as enum ('ellis_1', 'ellis_2', 'ellis_3', 'ellis_3_cavity');
create type public.pci_failure_reason as enum ('unable_to_cross', 'unable_to_dilate', 'unable_to_deliver', 'complication', 'other');

create type public.event_treatment as enum (
  'none', 'additional_stent', 'covered_stent', 'prolonged_balloon_inflation', 'intracoronary_vasodilator',
  'thrombus_aspiration', 'gp_iib_iiia', 'defibrillation', 'cardioversion', 'temporary_pacing', 'pericardiocentesis',
  'iabp', 'impella_or_ecmo', 'intubation', 'emergency_cabg', 'repeat_pci', 'transfusion', 'dialysis', 'other'
);
create type public.event_resolution as enum ('resolved', 'ongoing_at_discharge', 'fatal');

create type public.stress_test_type as enum ('tmt', 'stress_echo', 'spect', 'pet', 'cmr', 'ct_ffr', 'none');
create type public.stress_test_result as enum ('positive', 'negative', 'equivocal');

create type public.vascular_complication as enum (
  'haematoma', 'pseudoaneurysm', 'av_fistula', 'retroperitoneal_bleed', 'limb_ischaemia', 'radial_occlusion',
  'dissection_access_vessel', 'other'
);
create type public.disposition as enum ('home', 'ward', 'ccu', 'icu', 'transferred', 'deceased', 'left_against_advice');

-- ─── recorded_by / recorded_at for the new tables ─────────────────────────────

create function public.set_recorded_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.recorded_at := pg_catalog.now();
    new.recorded_by := coalesce(auth.uid(), new.recorded_by);
  else
    new.recorded_at := old.recorded_at;
    new.recorded_by := old.recorded_by;
  end if;
  return new;
end;
$$;

-- ─── §2.7 grafts (before vessel_findings.graft_id references it) ──────────────

create table public.grafts (
  id              uuid primary key default gen_random_uuid(),
  procedure_id    uuid not null references public.procedures (id) on delete cascade,
  graft_type      public.graft_type not null,
  target_vessel   public.vessel not null,
  sequential      boolean not null default false,
  patency         public.graft_patency not null,
  stenosis_pct    integer check (stenosis_pct between 0 and 100),
  lesion_location public.graft_lesion_location,
  cabg_year       integer check (cabg_year between 1950 and 2100),
  source          public.value_source not null default 'typed',
  recorded_by     uuid references auth.users (id) default auth.uid(),
  recorded_at     timestamptz not null default now(),
  notes           text,
  unique (id, procedure_id),
  constraint grafts_stenosis_only_when_stenosed check (patency = 'stenosed' or stenosis_pct is null),
  constraint grafts_lesion_location_only_when_diseased check (patency in ('stenosed', 'occluded') or lesion_location is null)
);

-- ─── §2.2 vessel_findings ─────────────────────────────────────────────────────

alter table public.vessel_findings
  add column lesion_class        public.lesion_class,
  add column ostial              boolean not null default false,
  add column bifurcation_medina  text,
  add column tortuosity          public.tortuosity_grade,
  add column cto                 boolean not null default false,
  add column cto_duration_months integer,
  add column in_stent_restenosis boolean not null default false,
  add column isr_pattern         public.isr_pattern,
  add column collaterals_rentrop integer check (collaterals_rentrop between 0 and 3),
  add column timi_frame_count    integer check (timi_frame_count >= 0),
  add column graft_id            uuid,
  add column stenosis_source     public.value_source not null default 'typed',
  add column mld_mm              numeric(4, 2) check (mld_mm >= 0),
  add column rvd_mm              numeric(4, 2) check (rvd_mm > 0),
  add column measurement_method  public.stenosis_method,
  add column image_study_uid     text,
  add column image_series_uid    text,
  add column image_instance_uid  text,
  add column image_frame         integer check (image_frame >= 1),
  add column image_view          text,
  -- The graft must belong to the same procedure as the lesion.
  add constraint vessel_findings_graft_fk
    foreign key (graft_id, procedure_id) references public.grafts (id, procedure_id),
  add constraint vessel_findings_medina_format
    check (bifurcation_medina is null or bifurcation_medina ~ '^[01],[01],[01]$'),
  add constraint vessel_findings_medina_only_when_bifurcation check (bifurcation or bifurcation_medina is null),
  add constraint vessel_findings_cto_duration_only_when_cto
    check ((cto or cto_duration_months is null) and (cto_duration_months is null or cto_duration_months >= 0)),
  add constraint vessel_findings_isr_pattern_only_when_isr check (in_stent_restenosis or isr_pattern is null),
  -- A graft lesion names its graft; nothing else does.
  add constraint vessel_findings_graft_link check ((vessel = 'graft') = (graft_id is not null));

create index on public.vessel_findings (graft_id, procedure_id);

-- ─── §2.3 lesion_physiology ───────────────────────────────────────────────────

create table public.lesion_physiology (
  id                uuid primary key default gen_random_uuid(),
  vessel_finding_id uuid not null references public.vessel_findings (id) on delete cascade,
  phase             public.measurement_phase not null,
  index             public.physiology_index not null,
  value             numeric(3, 2) not null check (value between 0 and 1),
  hyperaemic_agent  public.hyperaemic_agent,
  agent_dose        text,
  decision          public.physiology_decision,
  image_study_uid   text,
  image_series_uid  text,
  method            public.physiology_method,
  source            public.value_source not null default 'typed',
  recorded_by       uuid references auth.users (id) default auth.uid(),
  recorded_at       timestamptz not null default now(),
  notes             text,
  -- Resting indices are measured without a hyperaemic agent.
  constraint lesion_physiology_resting_no_agent check (
    index not in ('ifr', 'rfr', 'dfr', 'pd_pa_rest') or hyperaemic_agent is null or hyperaemic_agent = 'none'
  ),
  constraint lesion_physiology_dose_only_with_agent check (
    agent_dose is null or (hyperaemic_agent is not null and hyperaemic_agent <> 'none')
  )
);

create index on public.lesion_physiology (vessel_finding_id);

-- ─── §2.4 intravascular_imaging ───────────────────────────────────────────────

create table public.intravascular_imaging (
  id                   uuid primary key default gen_random_uuid(),
  vessel_finding_id    uuid not null references public.vessel_findings (id) on delete cascade,
  modality             public.imaging_modality not null,
  phase                public.measurement_phase not null,
  mla_mm2              numeric(5, 2) check (mla_mm2 >= 0),
  eem_area_mm2         numeric(5, 2) check (eem_area_mm2 > 0),
  plaque_burden_pct    integer check (plaque_burden_pct between 0 and 100),
  calcium_arc_deg      integer check (calcium_arc_deg between 0 and 360),
  calcium_thickness_mm numeric(4, 2) check (calcium_thickness_mm >= 0),
  lipid_arc_deg        integer check (lipid_arc_deg between 0 and 360),
  max_lcbi_4mm         integer check (max_lcbi_4mm between 0 and 1000),
  msa_mm2              numeric(5, 2) check (msa_mm2 > 0),
  stent_expansion_pct  integer check (stent_expansion_pct between 0 and 150),
  malapposition        boolean,
  edge_dissection      boolean,
  pullback_length_mm   integer check (pullback_length_mm > 0),
  image_study_uid      text,
  image_series_uid     text,
  image_instance_uid   text,
  mla_frame            integer check (mla_frame >= 1),
  method               public.imaging_method,
  source               public.value_source not null default 'typed',
  recorded_by          uuid references auth.users (id) default auth.uid(),
  recorded_at          timestamptz not null default now(),
  notes                text,
  constraint intravascular_imaging_oct_only check (modality = 'oct' or (calcium_thickness_mm is null and lipid_arc_deg is null)),
  constraint intravascular_imaging_lcbi_nirs_only check (modality = 'nirs_ivus' or max_lcbi_4mm is null),
  constraint intravascular_imaging_post_only check (
    phase = 'post' or (msa_mm2 is null and stent_expansion_pct is null and malapposition is null and edge_dissection is null)
  )
);

create index on public.intravascular_imaging (vessel_finding_id);

-- ─── §2.5 haemodynamics (left heart; Week 7b adds further *_status blocks) ─────

create table public.haemodynamics (
  id                        uuid primary key default gen_random_uuid(),
  procedure_id              uuid not null unique references public.procedures (id) on delete cascade,
  left_status               public.measurement_status not null default 'not_recorded',
  ao_systolic               integer check (ao_systolic > 0),
  ao_diastolic              integer check (ao_diastolic > 0),
  ao_mean                   integer check (ao_mean > 0),
  lv_systolic               integer check (lv_systolic > 0),
  lv_edp                    integer check (lv_edp >= 0),
  heart_rate_at_measurement integer check (heart_rate_at_measurement > 0),
  rhythm                    public.heart_rhythm,
  source                    public.value_source not null default 'typed',
  recorded_by               uuid references auth.users (id) default auth.uid(),
  recorded_at               timestamptz not null default now(),
  notes                     text,
  -- Three-state rule: the block's values are present exactly when it is recorded.
  constraint haemodynamics_left_status_matches check (
    (left_status = 'recorded') = (coalesce(ao_systolic, ao_diastolic, ao_mean, lv_systolic, lv_edp) is not null)
  )
);

-- ─── §2.6 LV function ─────────────────────────────────────────────────────────

create table public.lv_wall_motion (
  id           uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references public.procedures (id) on delete cascade,
  segment      integer not null check (segment between 1 and 17),
  motion       public.wall_motion not null,
  source       public.value_source not null default 'typed',
  recorded_by  uuid references auth.users (id) default auth.uid(),
  recorded_at  timestamptz not null default now(),
  notes        text,
  unique (procedure_id, segment)
);

-- ─── §2.6 + §2.10 procedures ──────────────────────────────────────────────────

alter table public.procedures
  add column mitral_regurgitation_grade   integer check (mitral_regurgitation_grade between 0 and 4),
  add column lv_gram_performed            boolean,
  add column ccs_class                    integer check (ccs_class between 1 and 4),
  add column nyha_class                   integer check (nyha_class between 1 and 4),
  add column stress_test_type             public.stress_test_type,
  add column stress_test_result           public.stress_test_result,
  add column cardiogenic_shock            boolean not null default false,
  add column cardiac_arrest_pre_procedure boolean not null default false,
  add column symptom_onset_at             timestamptz,
  add column first_medical_contact_at     timestamptz,
  add column door_at                      timestamptz,
  add column device_time_at               timestamptz,
  add column thrombolysis_given           boolean not null default false,
  add column prior_pci                    boolean,
  add column prior_cabg                   boolean,
  add constraint procedures_stress_result_only_with_test check (
    stress_test_result is null or (stress_test_type is not null and stress_test_type <> 'none')
  ),
  -- Door-to-device is derived (device_time_at − door_at) and must not come out negative.
  add constraint procedures_device_after_door check (device_time_at is null or door_at is null or device_time_at >= door_at);

-- ─── §2.8 interventions ───────────────────────────────────────────────────────

alter table public.interventions
  add column techniques                 public.technique[] not null default '{}',
  add column technique_other            text,
  add column bifurcation_strategy       public.bifurcation_strategy,
  add column bifurcation_strategy_other text,
  add column guiding_catheter           text,
  add column wires                      text[] not null default '{}',
  add column dissection_grade           public.dissection_grade,
  add column perforation_class          public.perforation_class,
  add column no_reflow                  boolean not null default false,
  add column failure_reason             public.pci_failure_reason,
  add column stent_overlap              boolean not null default false,
  add column total_stent_length_mm      numeric(5, 1) check (total_stent_length_mm > 0),
  add constraint interventions_technique_other check (
    ('other' = any (techniques)) = (nullif(btrim(technique_other), '') is not null)
  ),
  add constraint interventions_bifurcation_strategy_other check (
    coalesce(bifurcation_strategy = 'other', false) = (nullif(btrim(bifurcation_strategy_other), '') is not null)
  ),
  add constraint interventions_dissection_grade_only_when_dissection check (dissection or dissection_grade is null),
  add constraint interventions_perforation_class_only_when_perforation check (perforation or perforation_class is null),
  add constraint interventions_failure_reason_only_when_failed check (not success or failure_reason is null);

-- ─── §2.8a complications → procedural events ──────────────────────────────────

alter table public.complications
  add column grade           text,
  add column treatments      public.event_treatment[] not null default '{}',
  add column treatment_other text,
  add column resolution      public.event_resolution,
  add constraint complications_treatment_other check (
    ('other' = any (treatments)) = (nullif(btrim(treatment_other), '') is not null)
  ),
  add constraint complications_none_alone check (not ('none' = any (treatments)) or cardinality(treatments) = 1);

-- ─── §2.9 device_inflations ───────────────────────────────────────────────────

create table public.device_inflations (
  id           uuid primary key default gen_random_uuid(),
  device_id    uuid not null references public.devices_used (id) on delete cascade,
  sequence     integer not null check (sequence >= 1),
  pressure_atm integer not null check (pressure_atm > 0),
  duration_s   integer check (duration_s >= 0),
  source       public.value_source not null default 'typed',
  recorded_by  uuid references auth.users (id) default auth.uid(),
  recorded_at  timestamptz not null default now(),
  notes        text,
  unique (device_id, sequence)
);

-- ─── §2.11 in_hospital_outcomes ───────────────────────────────────────────────

create table public.in_hospital_outcomes (
  id                     uuid primary key default gen_random_uuid(),
  procedure_id           uuid not null unique references public.procedures (id) on delete cascade,
  mi                     public.tri_state not null default 'not_recorded',
  stroke                 public.tri_state not null default 'not_recorded',
  death                  public.tri_state not null default 'not_recorded',
  death_cause            text,
  bleeding               public.tri_state not null default 'not_recorded',
  bleeding_barc          integer check (bleeding_barc between 0 and 5),
  bleeding_barc_sub      text,
  transfusion            public.tri_state not null default 'not_recorded',
  vascular_status        public.tri_state not null default 'not_recorded',
  vascular_complications public.vascular_complication[] not null default '{}',
  aki                    public.tri_state not null default 'not_recorded',
  creatinine_post_umol_l numeric check (creatinine_post_umol_l > 0),
  new_dialysis           public.tri_state not null default 'not_recorded',
  emergency_cabg         public.tri_state not null default 'not_recorded',
  cardiac_tamponade      public.tri_state not null default 'not_recorded',
  unplanned_repeat_pci   public.tri_state not null default 'not_recorded',
  disposition            public.disposition,
  -- complications rows that explain these outcomes (checked by trigger: same procedure).
  event_links            uuid[] not null default '{}',
  source                 public.value_source not null default 'typed',
  recorded_by            uuid references auth.users (id) default auth.uid(),
  recorded_at            timestamptz not null default now(),
  notes                  text,
  constraint outcomes_death_cause_only_when_died check (death = 'yes' or death_cause is null),
  constraint outcomes_barc_only_when_bleeding check (bleeding = 'yes' or bleeding_barc is null),
  constraint outcomes_barc_sub check (
    bleeding_barc_sub is null or (bleeding_barc = 3 and bleeding_barc_sub in ('a', 'b', 'c'))
  ),
  -- An empty list means "none" only when vascular_status says so.
  constraint outcomes_vascular_list_matches check ((vascular_status = 'yes') = (cardinality(vascular_complications) > 0)),
  constraint outcomes_death_disposition check ((death = 'yes') = coalesce(disposition = 'deceased', false))
);

-- ─── Copy existing values into their new homes ────────────────────────────────
-- Before the guards are attached to haemodynamics; interventions' guard is held off for the copy.

insert into public.haemodynamics (procedure_id, left_status, ao_systolic, ao_diastolic, lv_edp, source)
select p.id, 'recorded', p.aortic_pressure_systolic, p.aortic_pressure_diastolic,
       case when p.lvedp_status = 'recorded' then p.lvedp_mmhg end, 'typed'
from public.procedures p
where p.aortic_pressure_systolic is not null or p.aortic_pressure_diastolic is not null or p.lvedp_status = 'recorded';

alter table public.interventions disable trigger guard_reviewed_child;
alter table public.interventions disable trigger set_audit_columns;
update public.interventions set wires = array[btrim(guidewire)]
  where nullif(btrim(guidewire), '') is not null and lower(btrim(guidewire)) <> 'not recorded';
alter table public.interventions enable trigger set_audit_columns;
alter table public.interventions enable trigger guard_reviewed_child;

-- ─── Triggers, guards and RLS for the new tables ──────────────────────────────

-- Live body (0005) plus the parents of the three new tables that don't carry procedure_id.
create or replace function public.guard_reviewed_child()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent uuid;
begin
  if tg_table_name = 'devices_used' then
    select i.procedure_id into parent from public.interventions i where i.id = new.intervention_id;
  elsif tg_table_name = 'discharge_medications' then
    select d.procedure_id into parent from public.discharges d where d.id = new.discharge_id;
  elsif tg_table_name in ('lesion_physiology', 'intravascular_imaging') then  -- 0011
    select v.procedure_id into parent from public.vessel_findings v where v.id = new.vessel_finding_id;
  elsif tg_table_name = 'device_inflations' then  -- 0011
    select i.procedure_id into parent
      from public.devices_used d join public.interventions i on i.id = d.intervention_id where d.id = new.device_id;
  else
    parent := new.procedure_id;
  end if;

  if exists (select 1 from public.procedures p where p.id = parent and p.status::text = 'reviewed') then
    raise exception 'This procedure has been reviewed and is read-only'
      using errcode = 'P0001', hint = 'hrudaya:reviewed_read_only';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'grafts', 'lesion_physiology', 'intravascular_imaging', 'haemodynamics', 'lv_wall_motion',
    'device_inflations', 'in_hospital_outcomes'
  ] loop
    execute format(
      'create trigger set_recorded_columns before insert or update on public.%I
         for each row execute function public.set_recorded_columns()', t);
    execute format(
      'create trigger guard_reviewed_child before insert or update on public.%I
         for each row execute function public.guard_reviewed_child()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "authenticated can read" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "authenticated can insert" on public.%I for insert to authenticated with check (true)', t);
    execute format(
      'create policy "authenticated can update" on public.%I for update to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

create policy "authenticated can delete while editable" on public.grafts
  for delete to authenticated using (public.procedure_is_editable(procedure_id));
create policy "authenticated can delete while editable" on public.haemodynamics
  for delete to authenticated using (public.procedure_is_editable(procedure_id));
create policy "authenticated can delete while editable" on public.lv_wall_motion
  for delete to authenticated using (public.procedure_is_editable(procedure_id));
create policy "authenticated can delete while editable" on public.in_hospital_outcomes
  for delete to authenticated using (public.procedure_is_editable(procedure_id));
create policy "authenticated can delete while editable" on public.lesion_physiology
  for delete to authenticated using (
    public.procedure_is_editable((select v.procedure_id from public.vessel_findings v where v.id = vessel_finding_id))
  );
create policy "authenticated can delete while editable" on public.intravascular_imaging
  for delete to authenticated using (
    public.procedure_is_editable((select v.procedure_id from public.vessel_findings v where v.id = vessel_finding_id))
  );
create policy "authenticated can delete while editable" on public.device_inflations
  for delete to authenticated using (
    public.procedure_is_editable((
      select i.procedure_id from public.devices_used d join public.interventions i on i.id = d.intervention_id
      where d.id = device_id))
  );

create index on public.grafts (procedure_id);
create index on public.lv_wall_motion (procedure_id);
create index on public.device_inflations (device_id);

-- ─── §2.11 rules across tables (deferred: checked at commit) ──────────────────
-- Every trigger re-checks the procedure's CURRENT state when it runs: a deferred trigger's NEW is
-- the row as it was at the time of the change, and a later statement in the same transaction may
-- already have made it consistent.

create function public.check_outcome_rules_for(p_procedure_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  o public.in_hospital_outcomes;
  n_links integer;
begin
  select * into o from public.in_hospital_outcomes where procedure_id = p_procedure_id;
  if not found then
    return;
  end if;

  if o.death = 'yes' then
    if not exists (select 1 from public.procedures p where p.id = p_procedure_id and p.post_procedure_condition = 'deceased') then
      raise exception 'A death must also be recorded as the post-procedure condition (deceased)'
        using errcode = 'P0001', hint = 'hrudaya:outcome_death_condition';
    end if;
    if exists (select 1 from public.discharges d where d.procedure_id = p_procedure_id) then
      raise exception 'A patient who died has no discharge'
        using errcode = 'P0001', hint = 'hrudaya:outcome_death_discharged';
    end if;
  end if;

  if (o.death = 'no' and exists (select 1 from public.complications c where c.procedure_id = p_procedure_id and c.complication = 'death'))
     or (o.stroke = 'no' and exists (select 1 from public.complications c where c.procedure_id = p_procedure_id and c.complication = 'stroke'))
     or (o.cardiac_tamponade = 'no' and exists (
           select 1 from public.complications c where c.procedure_id = p_procedure_id and c.complication = 'cardiac_tamponade')) then
    raise exception 'An outcome cannot be "no" while a procedural event of that type is recorded'
      using errcode = 'P0001', hint = 'hrudaya:outcome_contradicts_event';
  end if;

  select count(*) into n_links from public.complications c where c.id = any (o.event_links) and c.procedure_id = p_procedure_id;
  if n_links <> cardinality(o.event_links) or cardinality(o.event_links) <> cardinality(array(select distinct unnest(o.event_links))) then
    raise exception 'Outcome links must name distinct procedural events of the same procedure'
      using errcode = 'P0001', hint = 'hrudaya:outcome_link_invalid';
  end if;
end;
$$;

create function public.check_outcome_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Separate branches: NEW has different columns on the four tables.
  if tg_table_name = 'procedures' then
    perform public.check_outcome_rules_for(new.id);
  else
    perform public.check_outcome_rules_for(new.procedure_id);
  end if;
  return null;
end;
$$;

create constraint trigger check_outcome_rules
  after insert or update on public.in_hospital_outcomes
  deferrable initially deferred
  for each row execute function public.check_outcome_rules();
create constraint trigger check_outcome_rules
  after insert or update on public.discharges
  deferrable initially deferred
  for each row execute function public.check_outcome_rules();
create constraint trigger check_outcome_rules
  after insert or update of complication on public.complications
  deferrable initially deferred
  for each row execute function public.check_outcome_rules();
create constraint trigger check_outcome_rules
  after update of post_procedure_condition on public.procedures
  deferrable initially deferred
  for each row execute function public.check_outcome_rules();

-- A deleted event drops out of any outcome links (unless the whole procedure is being deleted).
create function public.unlink_deleted_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.in_hospital_outcomes o
    set event_links = pg_catalog.array_remove(o.event_links, old.id)
    where o.procedure_id = old.procedure_id and old.id = any (o.event_links)
      and exists (select 1 from public.procedures p where p.id = old.procedure_id);
  return null;
end;
$$;

create trigger unlink_deleted_event
  after delete on public.complications
  for each row execute function public.unlink_deleted_event();

-- ─── Week 6 snapshot, extended (0011) ─────────────────────────────────────────
-- Same rules as 0010: no ids, foreign keys, audit or recorded_* columns; foreign keys replaced by
-- natural keys (a lesion's graft → {graft_type, target_vessel}; outcome links → the linked events'
-- {complication, onset_at});
-- children sorted by explicit tuples over every column (text collate "C", nulls first, arrays
-- joined with ','). lib/amendments/snapshot.ts builds the identical object.

create or replace function public.procedure_snapshot(p_procedure_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'procedure',
      pg_catalog.to_jsonb(p) - array['id', 'patient_id', 'case_code', 'procedure_date', 'status', 'created_at', 'updated_at',
                                     'created_by', 'reviewed_by', 'reviewed_at', 'reviewing_clinician_id'],
    'vessel_findings', coalesce((
      select pg_catalog.jsonb_agg(
        (pg_catalog.to_jsonb(v) - array['id', 'procedure_id', 'created_at', 'updated_at', 'created_by', 'graft_id'])
        || pg_catalog.jsonb_build_object(
             'graft', (select pg_catalog.jsonb_build_object('graft_type', g.graft_type, 'target_vessel', g.target_vessel)
                       from public.grafts g where g.id = v.graft_id),
             'physiology', coalesce((
               select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(lp) - array['id', 'vessel_finding_id', 'recorded_by', 'recorded_at']
                 order by lp.phase::text collate "C", lp.index::text collate "C", lp.value, lp.hyperaemic_agent::text collate "C" nulls first,
                          lp.agent_dose collate "C" nulls first, lp.decision::text collate "C" nulls first, lp.method::text collate "C" nulls first,
                          lp.image_study_uid collate "C" nulls first, lp.image_series_uid collate "C" nulls first,
                          lp.source::text collate "C", lp.notes collate "C" nulls first)
               from public.lesion_physiology lp where lp.vessel_finding_id = v.id), '[]'::jsonb),
             'imaging', coalesce((
               select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(im) - array['id', 'vessel_finding_id', 'recorded_by', 'recorded_at']
                 order by im.modality::text collate "C", im.phase::text collate "C", im.mla_mm2 nulls first, im.eem_area_mm2 nulls first,
                          im.plaque_burden_pct nulls first, im.calcium_arc_deg nulls first, im.calcium_thickness_mm nulls first,
                          im.lipid_arc_deg nulls first, im.max_lcbi_4mm nulls first, im.msa_mm2 nulls first,
                          im.stent_expansion_pct nulls first, im.malapposition nulls first, im.edge_dissection nulls first,
                          im.pullback_length_mm nulls first, im.image_study_uid collate "C" nulls first,
                          im.image_series_uid collate "C" nulls first, im.image_instance_uid collate "C" nulls first,
                          im.mla_frame nulls first, im.method::text collate "C" nulls first, im.source::text collate "C",
                          im.notes collate "C" nulls first)
               from public.intravascular_imaging im where im.vessel_finding_id = v.id), '[]'::jsonb))
        order by v.vessel::text collate "C", v.segment::text collate "C" nulls first, v.stenosis_pct nulls first, v.timi_flow nulls first,
                 v.is_culprit nulls first, v.lesion_length_mm nulls first, v.calcification::text collate "C" nulls first,
                 v.thrombus nulls first, v.bifurcation nulls first, v.lesion_notes collate "C" nulls first,
                 v.lesion_class::text collate "C" nulls first, v.ostial, v.bifurcation_medina collate "C" nulls first,
                 v.tortuosity::text collate "C" nulls first, v.cto, v.cto_duration_months nulls first, v.in_stent_restenosis,
                 v.isr_pattern::text collate "C" nulls first, v.collaterals_rentrop nulls first, v.timi_frame_count nulls first,
                 v.stenosis_source::text collate "C", v.mld_mm nulls first, v.rvd_mm nulls first,
                 v.measurement_method::text collate "C" nulls first, v.image_study_uid collate "C" nulls first,
                 v.image_series_uid collate "C" nulls first, v.image_instance_uid collate "C" nulls first,
                 v.image_frame nulls first, v.image_view collate "C" nulls first)
      from public.vessel_findings v where v.procedure_id = p.id), '[]'::jsonb),
    'interventions', coalesce((
      select pg_catalog.jsonb_agg(
        (pg_catalog.to_jsonb(i) - array['id', 'procedure_id', 'vessel_finding_id', 'created_at', 'updated_at', 'created_by'])
        || pg_catalog.jsonb_build_object(
             'lesion', pg_catalog.jsonb_build_object('vessel', vf.vessel, 'segment', vf.segment),
             'devices', coalesce((
               select pg_catalog.jsonb_agg(
                 (pg_catalog.to_jsonb(d) - array['id', 'intervention_id', 'created_at', 'updated_at', 'created_by'])
                 || pg_catalog.jsonb_build_object('inflations', coalesce((
                      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(fl) - array['id', 'device_id', 'recorded_by', 'recorded_at']
                        order by fl.sequence, fl.pressure_atm, fl.duration_s nulls first, fl.source::text collate "C",
                                 fl.notes collate "C" nulls first)
                      from public.device_inflations fl where fl.device_id = d.id), '[]'::jsonb))
                 order by d.phase::text collate "C", d.category::text collate "C", d.product_name collate "C" nulls first,
                          d.diameter_mm nulls first, d.length_mm nulls first, d.inflation_atm nulls first, d.lot_number collate "C" nulls first,
                          d.expiry_date nulls first, d.udi collate "C" nulls first, d.manufacturer collate "C" nulls first, d.quantity nulls first)
               from public.devices_used d where d.intervention_id = i.id), '[]'::jsonb))
        order by vf.vessel::text collate "C" nulls first, vf.segment::text collate "C" nulls first, i.intervention_type::text collate "C",
                 i.residual_stenosis_pct nulls first, i.timi_flow_post nulls first, i.guidewire collate "C" nulls first, i.notes collate "C" nulls first,
                 i.success, i.dissection, i.perforation,
                 pg_catalog.array_to_string(i.techniques::text[], ',') collate "C", i.technique_other collate "C" nulls first,
                 i.bifurcation_strategy::text collate "C" nulls first, i.bifurcation_strategy_other collate "C" nulls first,
                 i.guiding_catheter collate "C" nulls first, pg_catalog.array_to_string(i.wires, ',') collate "C",
                 i.dissection_grade::text collate "C" nulls first, i.perforation_class::text collate "C" nulls first, i.no_reflow,
                 i.failure_reason::text collate "C" nulls first, i.stent_overlap, i.total_stent_length_mm nulls first)
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
                 c.severity::text collate "C", c.management collate "C" nulls first, c.outcome collate "C" nulls first,
                 c.grade collate "C" nulls first, pg_catalog.array_to_string(c.treatments::text[], ',') collate "C",
                 c.treatment_other collate "C" nulls first, c.resolution::text collate "C" nulls first)
      from public.complications c where c.procedure_id = p.id), '[]'::jsonb),
    'discharge', (
      select (pg_catalog.to_jsonb(d) - array['id', 'procedure_id', 'created_at', 'updated_at', 'created_by'])
        || pg_catalog.jsonb_build_object('medications', coalesce((
             select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) - array['id', 'discharge_id', 'created_at', 'updated_at', 'created_by']
               order by m.drug_name collate "C", m.dose nulls first, m.dose_unit::text collate "C" nulls first, m.frequency::text collate "C",
                        m.route::text collate "C", m.duration collate "C" nulls first, m.purpose collate "C" nulls first, m.is_dapt)
             from public.discharge_medications m where m.discharge_id = d.id), '[]'::jsonb))
      from public.discharges d where d.procedure_id = p.id),
    'grafts', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(g) - array['id', 'procedure_id', 'recorded_by', 'recorded_at']
        order by g.graft_type::text collate "C", g.target_vessel::text collate "C", g.sequential, g.patency::text collate "C",
                 g.stenosis_pct nulls first, g.lesion_location::text collate "C" nulls first, g.cabg_year nulls first,
                 g.source::text collate "C", g.notes collate "C" nulls first)
      from public.grafts g where g.procedure_id = p.id), '[]'::jsonb),
    'haemodynamics', (
      select pg_catalog.to_jsonb(h) - array['id', 'procedure_id', 'recorded_by', 'recorded_at']
      from public.haemodynamics h where h.procedure_id = p.id),
    'lv_wall_motion', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(w) - array['id', 'procedure_id', 'recorded_by', 'recorded_at']
        order by w.segment, w.motion::text collate "C", w.source::text collate "C", w.notes collate "C" nulls first)
      from public.lv_wall_motion w where w.procedure_id = p.id), '[]'::jsonb),
    'in_hospital_outcomes', (
      select (pg_catalog.to_jsonb(o) - array['id', 'procedure_id', 'recorded_by', 'recorded_at', 'event_links'])
        || pg_catalog.jsonb_build_object('linked_events', coalesce((
             select pg_catalog.jsonb_agg(
                      pg_catalog.jsonb_build_object('complication', c.complication, 'onset_at', c.onset_at)
                      order by c.complication::text collate "C", c.onset_at nulls first)
             from public.complications c where c.id = any (o.event_links)), '[]'::jsonb))
      from public.in_hospital_outcomes o where o.procedure_id = p.id)
  )
  from public.procedures p
  where p.id = p_procedure_id
$$;

-- ─── §2.12 registry completeness ──────────────────────────────────────────────
-- The 42 elements of lib/registry/nic-elements.ts, in the same order and with the same keys (a test
-- compares them). An element that does not apply to this case (e.g. STEMI timings for an elective
-- case, lesion detail for a diagnostic study) counts as filled. tri_state 'not_recorded' is missing.

create function public.registry_completeness(p_procedure_id uuid)
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

commit;
