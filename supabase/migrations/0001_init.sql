-- Hrudaya — Week 1 schema. Source of truth: docs/week1-spec.md §3.
-- Coronary angiography and PCI only. Synthetic data only.
--
-- Interpretations of the spec made here (listed so they can be reviewed):
--  * procedures: columns captured in later form steps are nullable so a draft can be
--    saved at step 1; a CHECK makes them all required once status = 'completed'.
--  * created_by is set from auth.uid() by trigger on insert and can never be changed;
--    rows written by the seed script (service role) have created_by = null.
--  * "No delete from the UI": patients, operators and procedures can never be deleted
--    by a signed-in user. Child rows of a DRAFT procedure (vessels, interventions,
--    devices, complications, medications) and patient risk factors can be removed,
--    because going Back in the form and removing a row must be possible.
--  * procedure_events is written only by trigger; users can read it, never edit it.

begin;

-- ─── Enums ────────────────────────────────────────────────────────────────────

create type public.sex as enum ('male', 'female', 'other');

create type public.risk_factor as enum (
  'hypertension', 'diabetes_t2', 'diabetes_t1', 'dyslipidaemia', 'smoking', 'ex_smoker',
  'family_history', 'ckd', 'obesity', 'prior_pci', 'prior_cabg', 'prior_mi', 'other'
);

create type public.operator_role as enum (
  'interventional_cardiologist', 'fellow', 'cath_lab_technologist', 'nurse'
);

create type public.procedure_type as enum ('diagnostic_angiography', 'pci', 'angiography_and_pci');

create type public.indication as enum (
  'stemi', 'nstemi', 'unstable_angina', 'stable_angina', 'positive_stress_test',
  'pre_op_assessment', 'cardiomyopathy_workup', 'other'
);

create type public.access_site as enum (
  'right_radial', 'left_radial', 'right_femoral', 'left_femoral', 'right_ulnar', 'left_ulnar', 'other'
);

create type public.haemostasis_method as enum (
  'radial_compression_band', 'manual_compression', 'vascular_closure_device', 'other'
);

create type public.procedure_status as enum ('draft', 'completed');

create type public.vessel as enum (
  'lmca', 'lad', 'd1', 'd2', 'lcx', 'om1', 'om2', 'ramus', 'rca', 'pda', 'plv', 'graft', 'other'
);

create type public.vessel_segment as enum ('ostial', 'proximal', 'mid', 'distal');

create type public.intervention_type as enum (
  'pci_des', 'pci_bms', 'poba', 'drug_coated_balloon', 'thrombectomy', 'rotational_atherectomy', 'other'
);

create type public.device_phase as enum ('pre_dilation', 'deployment', 'post_dilation', 'other');

create type public.device_category as enum ('stent', 'balloon_sc', 'balloon_nc', 'guidewire', 'other');

create type public.complication_type as enum (
  'dissection', 'perforation', 'no_reflow', 'access_site_haematoma', 'radial_occlusion',
  'contrast_nephropathy', 'arrhythmia', 'cardiac_tamponade', 'stroke', 'death', 'other'
);

create type public.complication_severity as enum ('minor', 'major');

create type public.dose_unit as enum ('mg', 'mcg', 'g', 'ml', 'iu');

create type public.dose_frequency as enum ('od', 'bd', 'tds', 'qds', 'prn', 'weekly');

create type public.medication_route as enum ('oral', 'sc', 'iv', 'topical');

-- ─── Audit trigger ────────────────────────────────────────────────────────────

-- On insert: stamp created_at/updated_at; created_by = the signed-in user (a client
-- cannot claim to be someone else). On update: created_* are frozen, updated_at moves.
create function public.set_audit_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := pg_catalog.now();
    new.updated_at := new.created_at;
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

-- ─── Tables ───────────────────────────────────────────────────────────────────

create table public.patients (
  id            uuid primary key default gen_random_uuid(),
  mrn           text not null unique check (btrim(mrn) <> ''),
  full_name     text not null check (btrim(full_name) <> ''),
  sex           public.sex not null,
  date_of_birth date not null check (date_of_birth >= date '1900-01-01'),
  mobile        text,
  abha_number   text check (abha_number ~ '^[0-9]{14}$'),
  abha_address  text,
  is_synthetic  boolean not null default true check (is_synthetic),  -- always true in this project
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id) default auth.uid()
);

create table public.patient_risk_factors (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  factor     public.risk_factor not null,
  detail     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid()
);

create table public.operators (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null check (btrim(full_name) <> ''),
  role       public.operator_role not null,
  hpr_id     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid()
);

create table public.procedures (
  id                     uuid primary key default gen_random_uuid(),
  patient_id             uuid not null references public.patients (id),
  case_code              text not null unique check (btrim(case_code) <> ''),
  procedure_date         date,
  procedure_type         public.procedure_type,
  indication             public.indication,
  presentation_notes     text,
  ecg_findings           text,
  troponin_elevated      boolean,
  access_site            public.access_site,
  sheath_size_fr         integer check (sheath_size_fr in (5, 6, 7, 8)),
  diagnostic_catheters   text[] not null default '{}',
  guiding_catheter       text,
  contrast_volume_ml     integer check (contrast_volume_ml >= 0),
  procedure_duration_min integer check (procedure_duration_min > 0),
  fluoroscopy_time_min   numeric(5, 1) check (fluoroscopy_time_min >= 0),
  radiation_dose_mgy     numeric check (radiation_dose_mgy >= 0),
  primary_operator_id    uuid references public.operators (id),
  haemostasis_method     public.haemostasis_method,
  outcome_summary        text,
  status                 public.procedure_status not null default 'draft',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid references auth.users (id) default auth.uid(),
  -- Drafts may be partial; a completed record may not.
  constraint procedures_completed_is_complete check (
    status = 'draft' or (
      procedure_date is not null and procedure_type is not null and indication is not null
      and nullif(btrim(presentation_notes), '') is not null
      and access_site is not null and sheath_size_fr is not null
      and contrast_volume_ml is not null and procedure_duration_min is not null
      and fluoroscopy_time_min is not null and primary_operator_id is not null
      and haemostasis_method is not null
      and nullif(btrim(outcome_summary), '') is not null
    )
  )
);

create table public.vessel_findings (
  id           uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references public.procedures (id) on delete cascade,
  vessel       public.vessel not null,
  segment      public.vessel_segment,
  stenosis_pct integer not null check (stenosis_pct between 0 and 100),
  timi_flow    integer not null check (timi_flow between 0 and 3),
  is_culprit   boolean not null default false,
  lesion_notes text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) default auth.uid(),
  -- Lets interventions prove their lesion belongs to the same procedure.
  unique (id, procedure_id)
);

create table public.interventions (
  id                    uuid primary key default gen_random_uuid(),
  procedure_id          uuid not null references public.procedures (id) on delete cascade,
  vessel_finding_id     uuid not null,
  intervention_type     public.intervention_type not null,
  guidewire             text not null,
  residual_stenosis_pct integer not null check (residual_stenosis_pct between 0 and 100),
  timi_flow_post        integer not null check (timi_flow_post between 0 and 3),
  success               boolean not null,
  dissection            boolean not null default false,
  perforation           boolean not null default false,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users (id) default auth.uid(),
  foreign key (vessel_finding_id, procedure_id)
    references public.vessel_findings (id, procedure_id) on delete cascade
);

create table public.devices_used (
  id              uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions (id) on delete cascade,
  phase           public.device_phase not null,
  category        public.device_category not null,
  product_name    text not null check (btrim(product_name) <> ''),
  manufacturer    text,
  diameter_mm     numeric(4, 2) not null check (diameter_mm > 0),
  length_mm       numeric(5, 1) not null check (length_mm > 0),
  inflation_atm   integer check (inflation_atm > 0),
  lot_number      text,
  expiry_date     date,
  udi             text,
  quantity        integer not null default 1 check (quantity >= 1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) default auth.uid(),
  -- Traceability: every stent carries a lot number.
  constraint devices_used_stent_has_lot check (
    category <> 'stent' or nullif(btrim(lot_number), '') is not null
  )
);

create table public.complications (
  id           uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references public.procedures (id) on delete cascade,
  complication public.complication_type not null,
  severity     public.complication_severity not null,
  management   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) default auth.uid()
);

create table public.discharges (
  id                   uuid primary key default gen_random_uuid(),
  procedure_id         uuid not null unique references public.procedures (id) on delete cascade,
  discharge_date       date not null,
  length_of_stay_hours integer not null check (length_of_stay_hours >= 0),
  clinical_status      text not null,
  follow_up_date       date not null,
  follow_up_clinic     text not null,
  advice               text[] not null default '{}',
  red_flags            text[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references auth.users (id) default auth.uid(),
  check (follow_up_date >= discharge_date)
);

create table public.discharge_medications (
  id           uuid primary key default gen_random_uuid(),
  discharge_id uuid not null references public.discharges (id) on delete cascade,
  drug_name    text not null check (btrim(drug_name) <> ''),
  dose         numeric not null check (dose > 0),
  dose_unit    public.dose_unit not null,
  frequency    public.dose_frequency not null,
  route        public.medication_route not null default 'oral',
  duration     text,
  purpose      text,
  is_dapt      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) default auth.uid()
);

create table public.procedure_events (
  id           uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references public.procedures (id) on delete cascade,
  event        text not null,
  actor        uuid references auth.users (id),
  at           timestamptz not null default now()
);

-- ─── Indexes on foreign keys ──────────────────────────────────────────────────

create index on public.patient_risk_factors (patient_id);
create index on public.procedures (patient_id);
create index on public.procedures (primary_operator_id);
create index on public.procedures (procedure_date desc);
create index on public.vessel_findings (procedure_id);
create index on public.interventions (procedure_id);
create index on public.interventions (vessel_finding_id, procedure_id);
create index on public.devices_used (intervention_id);
create index on public.complications (procedure_id);
create index on public.discharge_medications (discharge_id);
create index on public.procedure_events (procedure_id, at);

-- ─── Audit triggers ───────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'patients', 'patient_risk_factors', 'operators', 'procedures', 'vessel_findings',
    'interventions', 'devices_used', 'complications', 'discharges', 'discharge_medications'
  ] loop
    execute format(
      'create trigger set_audit_columns before insert or update on public.%I
         for each row execute function public.set_audit_columns()', t);
  end loop;
end;
$$;

-- ─── Completion rules ─────────────────────────────────────────────────────────

-- A procedure can only move to 'completed' when its record is whole.
create function public.check_procedure_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  n_interventions integer;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if not exists (select 1 from public.vessel_findings v where v.procedure_id = new.id) then
      raise exception 'Cannot complete: no angiography findings recorded'
        using errcode = 'P0001', hint = 'hrudaya:no_vessel_findings';
    end if;

    select count(*) into n_interventions from public.interventions i where i.procedure_id = new.id;
    if new.procedure_type = 'diagnostic_angiography' and n_interventions > 0 then
      raise exception 'Cannot complete: a diagnostic-only procedure has interventions recorded'
        using errcode = 'P0001', hint = 'hrudaya:diagnostic_with_intervention';
    end if;
    if new.procedure_type in ('pci', 'angiography_and_pci') and n_interventions = 0 then
      raise exception 'Cannot complete: a PCI procedure needs at least one intervention'
        using errcode = 'P0001', hint = 'hrudaya:pci_without_intervention';
    end if;

    if not exists (select 1 from public.discharges d where d.procedure_id = new.id) then
      raise exception 'Cannot complete: no discharge recorded'
        using errcode = 'P0001', hint = 'hrudaya:no_discharge';
    end if;
  end if;
  return new;
end;
$$;

create trigger check_procedure_completion
  before update of status on public.procedures
  for each row execute function public.check_procedure_completion();

-- ─── Procedure event log ──────────────────────────────────────────────────────

-- SECURITY DEFINER so the log can be written although users have no insert policy on it.
create function public.log_procedure_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.procedure_events (procedure_id, event, actor)
    values (new.id, 'created', auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.procedure_events (procedure_id, event, actor)
    values (new.id, case when new.status = 'completed' then 'completed' else 'reopened' end, auth.uid());
  end if;
  return null;
end;
$$;

revoke execute on function public.log_procedure_event() from public, anon, authenticated;

create trigger log_procedure_event
  after insert or update of status on public.procedures
  for each row execute function public.log_procedure_event();

-- ─── Row-level security (Week 1: single role) ─────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'patients', 'patient_risk_factors', 'operators', 'procedures', 'vessel_findings',
    'interventions', 'devices_used', 'complications', 'discharges', 'discharge_medications'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "authenticated can read" on public.%I for select to authenticated using (true)', t);
    execute format(
      'create policy "authenticated can insert" on public.%I for insert to authenticated with check (true)', t);
    execute format(
      'create policy "authenticated can update" on public.%I for update to authenticated using (true) with check (true)', t);
  end loop;
end;
$$;

alter table public.procedure_events enable row level security;
create policy "authenticated can read" on public.procedure_events
  for select to authenticated using (true);

-- Removing rows while a procedure is still a draft (form Back + remove row).
create function public.procedure_is_draft(p_procedure_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.procedures p where p.id = p_procedure_id and p.status = 'draft'
  );
$$;

create policy "authenticated can delete from draft" on public.vessel_findings
  for delete to authenticated using (public.procedure_is_draft(procedure_id));

create policy "authenticated can delete from draft" on public.interventions
  for delete to authenticated using (public.procedure_is_draft(procedure_id));

create policy "authenticated can delete from draft" on public.devices_used
  for delete to authenticated using (
    public.procedure_is_draft((select i.procedure_id from public.interventions i where i.id = intervention_id))
  );

create policy "authenticated can delete from draft" on public.complications
  for delete to authenticated using (public.procedure_is_draft(procedure_id));

create policy "authenticated can delete from draft" on public.discharge_medications
  for delete to authenticated using (
    public.procedure_is_draft((select d.procedure_id from public.discharges d where d.id = discharge_id))
  );

create policy "authenticated can delete" on public.patient_risk_factors
  for delete to authenticated using (true);

-- The anon role reads and writes nothing.
revoke all on all tables in schema public from anon;

commit;
