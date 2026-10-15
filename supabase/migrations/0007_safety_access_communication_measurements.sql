-- Hrudaya 0007 — clinical documentation round 3, then the Week 1 schema is frozen.
--  1. Consent and time-out (who and when)
--  2. Access technique (ultrasound, attempts, sheath removal)
--  3. procedure_medications: administered_at, act_measured_at
--  5. Complications: onset, onset_at, outcome
--  6. Communication of findings
--  + LVEF provenance (source, date)
--  + Three-state rule for conditional measurements: lvedp_status, lvef_status
--  + success = true requires residual_stenosis_pct
-- (Device traceability needs no schema change. 'Subcutaneous' already exists as route 'sc'.)

begin;

create type public.complication_onset as enum ('intraprocedural', 'inpatient');
create type public.lvef_source as enum ('echo', 'ventriculography', 'mri', 'other');
-- Three-state rule (spec §3): a conditional measurement says whether it was recorded,
-- deliberately not performed, or simply not recorded — a null value alone cannot say which.
create type public.measurement_status as enum ('not_recorded', 'not_performed', 'recorded');

-- ─── 1, 2, 6 + LVEF / LVEDP status: procedures ────────────────────────────────

alter table public.procedures
  add column consent_obtained_at timestamptz,
  add column consent_by_operator_id uuid references public.operators (id),
  add column timeout_completed_at timestamptz,
  add column timeout_by_operator_id uuid references public.operators (id),
  add column access_ultrasound_guided boolean,
  add column access_attempts integer check (access_attempts >= 1),
  add column sheath_removed_at timestamptz,
  add column findings_communicated_to_patient_at timestamptz,
  add column findings_communicated_to_team boolean not null default false,
  add column communication_notes text,
  add column lvef_source public.lvef_source,
  add column lvef_measured_on date,
  add column lvef_status public.measurement_status not null default 'not_recorded',
  add column lvedp_status public.measurement_status not null default 'not_recorded';

create index on public.procedures (consent_by_operator_id);
create index on public.procedures (timeout_by_operator_id);

-- Rows written before this migration: an LVEF value present means it was recorded.
update public.procedures set lvef_status = 'recorded' where lvef_pct is not null;
update public.procedures set lvedp_status = 'recorded' where lvedp_mmhg is not null;

alter table public.procedures
  -- A value exists exactly when the status says recorded.
  add constraint procedures_lvef_status_matches check ((lvef_status = 'recorded') = (lvef_pct is not null)),
  add constraint procedures_lvedp_status_matches check ((lvedp_status = 'recorded') = (lvedp_mmhg is not null)),
  -- Provenance only describes a recorded value.
  add constraint procedures_lvef_provenance check (
    lvef_status = 'recorded' or (lvef_source is null and lvef_measured_on is null)
  );

-- ─── 3. Procedure medication timestamps ───────────────────────────────────────

alter table public.procedure_medications
  add column administered_at timestamptz,
  add column act_measured_at timestamptz;

-- ─── 5. Complications ─────────────────────────────────────────────────────────

alter table public.complications
  add column onset public.complication_onset,
  add column onset_at timestamptz,
  add column outcome text;

-- ─── Residual stenosis is operator-entered ────────────────────────────────────
-- residual_stenosis_pct is already NOT NULL (0001), so this cannot fail today; it states the
-- rule explicitly so it survives if that column is ever made optional.

alter table public.interventions
  add constraint interventions_success_needs_residual
    check (success is not true or residual_stenosis_pct is not null);

commit;
