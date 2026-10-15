-- Hrudaya 0005 — clinical documentation round 1 (owner, 2026-10-15).
--  1. DAPT plan on discharges.
--  3. procedure_medications (pre/intra/post-procedure drugs, ACT).
--  4. Sign-off: status 'reviewed'; reviewed records are read-only.
--  5. Admission time on procedures; discharge time replaces length_of_stay_hours.
-- (Item 2, Metoprolol formulation, is seed-only.)
--
-- New enum values are added outside the transaction and are only compared as text below,
-- because Postgres cannot use an enum value in the same transaction that added it.

alter type public.procedure_status add value if not exists 'reviewed' after 'completed';
alter type public.dose_unit add value if not exists 'units';
alter type public.dose_unit add value if not exists 'units_per_kg'; -- weight-based heparin (owner, 2a)
alter type public.medication_route add value if not exists 'intra_arterial';

begin;

-- ─── 1. DAPT plan ─────────────────────────────────────────────────────────────

alter table public.discharges
  add column dapt_planned_months integer check (dapt_planned_months > 0),
  add column dapt_review_date date;

-- ─── 3. Procedure medications ─────────────────────────────────────────────────

create type public.medication_timing as enum ('pre_procedure', 'intra_procedure', 'post_procedure');

create table public.procedure_medications (
  id           uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references public.procedures (id) on delete cascade,
  drug_name    text not null check (btrim(drug_name) <> ''),
  dose         numeric check (dose > 0),
  dose_unit    public.dose_unit,
  route        public.medication_route not null,
  timing       public.medication_timing not null,
  act_seconds  integer check (act_seconds > 0), -- ACT reading taken after this dose
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) default auth.uid(),
  constraint procedure_medications_unit_with_dose check ((dose is null) = (dose_unit is null))
);

create index on public.procedure_medications (procedure_id);

create trigger set_audit_columns before insert or update on public.procedure_medications
  for each row execute function public.set_audit_columns();

alter table public.procedure_medications enable row level security;
create policy "authenticated can read" on public.procedure_medications for select to authenticated using (true);
create policy "authenticated can insert" on public.procedure_medications for insert to authenticated with check (true);
create policy "authenticated can update" on public.procedure_medications for update to authenticated using (true) with check (true);
create policy "authenticated can delete from draft" on public.procedure_medications
  for delete to authenticated using (public.procedure_is_draft(procedure_id));
revoke all on public.procedure_medications from anon;

-- ─── 4. Sign-off ──────────────────────────────────────────────────────────────

alter table public.procedures
  add column reviewed_by uuid references auth.users (id),
  add column reviewed_at timestamptz,
  add column reviewing_clinician_id uuid references public.operators (id),
  add constraint procedures_reviewed_is_signed check (
    status::text <> 'reviewed' or (reviewed_at is not null and reviewing_clinician_id is not null)
  );

create index on public.procedures (reviewing_clinician_id);

-- Review only from 'completed'; once reviewed the row is read-only. reviewed_by and
-- reviewed_at come from the signed-in user and the clock (the seed, with no user, may supply them).
create function public.guard_procedure_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status::text = 'reviewed' then
    raise exception 'This procedure has been reviewed and is read-only'
      using errcode = 'P0001', hint = 'hrudaya:reviewed_read_only';
  end if;

  if new.status::text = 'reviewed' then
    if old.status::text <> 'completed' then
      raise exception 'Only a completed procedure can be marked as reviewed'
        using errcode = 'P0001', hint = 'hrudaya:review_needs_completed';
    end if;
    new.reviewed_by := coalesce(auth.uid(), new.reviewed_by);
    if auth.uid() is not null or new.reviewed_at is null then
      new.reviewed_at := pg_catalog.now();
    end if;
  else
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.reviewing_clinician_id := null;
  end if;
  return new;
end;
$$;

create trigger guard_procedure_review
  before update on public.procedures
  for each row execute function public.guard_procedure_review();

-- Child rows of a reviewed procedure cannot be added or changed. (Deleting them is already
-- refused by RLS for anything that is not a draft.)
create function public.guard_reviewed_child()
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
    'vessel_findings', 'interventions', 'devices_used', 'complications',
    'discharges', 'discharge_medications', 'procedure_medications'
  ] loop
    execute format(
      'create trigger guard_reviewed_child before insert or update on public.%I
         for each row execute function public.guard_reviewed_child()', t);
  end loop;
end;
$$;

-- Event log: same body as 0001 plus a 'reviewed' event (diffed against the live function).
create or replace function public.log_procedure_event()
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
    values (
      new.id,
      case new.status::text when 'completed' then 'completed' when 'reviewed' then 'reviewed' else 'reopened' end,
      auth.uid()
    );
  end if;
  return null;
end;
$$;

-- ─── 5. Admission and discharge times ─────────────────────────────────────────

alter table public.procedures add column admitted_at timestamptz;

alter table public.discharges add column discharged_at timestamptz;

-- Rows written before this migration only have a discharge date: give them midday IST.
update public.discharges
  set discharged_at = (discharge_date + time '12:00') at time zone 'Asia/Kolkata'
  where discharged_at is null;

alter table public.discharges
  alter column discharged_at set not null,
  drop column length_of_stay_hours,
  -- discharge_date stays (spec column) but can never disagree with discharged_at.
  add constraint discharges_date_matches_time
    check (discharge_date = (discharged_at at time zone 'Asia/Kolkata')::date);

commit;
