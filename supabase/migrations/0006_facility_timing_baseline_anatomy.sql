-- Hrudaya 0006 — clinical documentation round 2 (owner, 2026-10-15).
--  1. facilities; procedures.facility_id, referring_clinician
--  2. started_at / ended_at (procedure_duration_min dropped — duration is derived); urgency
--  3. baseline: allergies and labs
--  4. haemodynamics
--  5. coronary dominance; lesion length, calcification, thrombus, bifurcation
--  6. contrast agent
--  7. radiation: air kerma and DAP replace radiation_dose_mgy
--  8. immediate outcome: condition, destination, notes

begin;

create type public.urgency as enum ('elective', 'urgent', 'emergency');
create type public.coronary_dominance as enum ('right', 'left', 'co_dominant');
create type public.calcification_grade as enum ('none', 'mild', 'moderate', 'severe');
create type public.post_procedure_condition as enum ('stable', 'unstable', 'deceased');
create type public.post_procedure_destination as enum ('ward', 'ccu', 'icu', 'day_case_recovery', 'transferred');

-- ─── 1. Facilities ────────────────────────────────────────────────────────────

create table public.facilities (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (btrim(name) <> ''),
  cath_lab_name text not null check (btrim(cath_lab_name) <> ''),
  city          text not null check (btrim(city) <> ''),
  hfr_id        text, -- Health Facility Registry id, for ABDM later
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id) default auth.uid()
);

create trigger set_audit_columns before insert or update on public.facilities
  for each row execute function public.set_audit_columns();

alter table public.facilities enable row level security;
create policy "authenticated can read" on public.facilities for select to authenticated using (true);
create policy "authenticated can insert" on public.facilities for insert to authenticated with check (true);
create policy "authenticated can update" on public.facilities for update to authenticated using (true) with check (true);
revoke all on public.facilities from anon;

-- The one cath lab in Week 1 scope (synthetic). In the migration so the form works on a clean project.
insert into public.facilities (name, cath_lab_name, city)
select 'Synthetic District Hospital', 'Cath Lab 1', 'Chittoor'
where not exists (select 1 from public.facilities where name = 'Synthetic District Hospital' and cath_lab_name = 'Cath Lab 1');

-- ─── Procedures: new columns ──────────────────────────────────────────────────

alter table public.procedures
  add column facility_id uuid references public.facilities (id),
  add column referring_clinician text,
  add column urgency public.urgency,
  add column started_at timestamptz,
  add column ended_at timestamptz,
  add column allergies text,
  add column creatinine_umol_l numeric check (creatinine_umol_l > 0),
  add column egfr numeric check (egfr > 0),
  add column haemoglobin_g_dl numeric check (haemoglobin_g_dl > 0),
  add column platelets_x10e9_l integer check (platelets_x10e9_l > 0),
  add column baseline_bp_systolic integer check (baseline_bp_systolic > 0),
  add column baseline_bp_diastolic integer check (baseline_bp_diastolic > 0),
  add column baseline_heart_rate integer check (baseline_heart_rate > 0),
  add column aortic_pressure_systolic integer check (aortic_pressure_systolic > 0),
  add column aortic_pressure_diastolic integer check (aortic_pressure_diastolic > 0),
  add column lvedp_mmhg integer check (lvedp_mmhg >= 0),
  add column dominance public.coronary_dominance,
  add column contrast_agent text,
  add column air_kerma_mgy numeric check (air_kerma_mgy >= 0),
  add column dap_gy_cm2 numeric check (dap_gy_cm2 >= 0),
  add column post_procedure_condition public.post_procedure_condition,
  add column post_procedure_destination public.post_procedure_destination,
  add column immediate_care_notes text,
  add constraint procedures_ends_after_start check (ended_at > started_at),
  -- The procedure date is the India calendar date the procedure started.
  add constraint procedures_date_matches_start check (
    procedure_date is null or started_at is null
    or procedure_date = (started_at at time zone 'Asia/Kolkata')::date
  );

create index on public.procedures (facility_id);

-- Rows written before this migration: one facility, urgency from indication, and start/end
-- from the stored duration (10:00 IST start), so the completion rule below holds for them.
update public.procedures p set
  facility_id = (select f.id from public.facilities f where f.name = 'Synthetic District Hospital' and f.cath_lab_name = 'Cath Lab 1'),
  urgency = case
    when p.indication = 'stemi' then 'emergency'::public.urgency
    when p.indication in ('nstemi', 'unstable_angina') then 'urgent'::public.urgency
    else 'elective'::public.urgency
  end,
  started_at = (p.procedure_date + time '10:00') at time zone 'Asia/Kolkata',
  ended_at = ((p.procedure_date + time '10:00') at time zone 'Asia/Kolkata') + make_interval(mins => p.procedure_duration_min)
where p.procedure_date is not null and p.procedure_duration_min is not null;

-- ─── Completion rule: duration → start/end; facility and urgency required ─────

alter table public.procedures drop constraint procedures_completed_is_complete;
alter table public.procedures
  drop column procedure_duration_min,
  drop column radiation_dose_mgy;

alter table public.procedures add constraint procedures_completed_is_complete check (
  status = 'draft' or (
    procedure_date is not null and procedure_type is not null and indication is not null
    and nullif(btrim(presentation_notes), '') is not null
    and access_site is not null and sheath_size_fr is not null
    and contrast_volume_ml is not null and started_at is not null and ended_at is not null
    and fluoroscopy_time_min is not null and primary_operator_id is not null
    and haemostasis_method is not null
    and nullif(btrim(outcome_summary), '') is not null
    and facility_id is not null and urgency is not null
  )
);

-- ─── 5. Lesion detail ─────────────────────────────────────────────────────────

alter table public.vessel_findings
  add column lesion_length_mm numeric check (lesion_length_mm > 0),
  add column calcification public.calcification_grade,
  add column thrombus boolean not null default false,
  add column bifurcation boolean not null default false;

commit;
