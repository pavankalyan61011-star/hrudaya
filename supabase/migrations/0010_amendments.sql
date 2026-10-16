-- Hrudaya 0010 — amendments, step B (Week 6 spec §2: "0009b"). Requires 0009 (the 'amending' status).
--
-- A reviewed procedure is never edited in place. A clinician opens an amendment with a reason
-- (open_amendment), which stores a snapshot of the record and moves it to 'amending'; the capture
-- steps can then change it; close_amendment re-reviews it (second signature) and stores the list
-- of changes, refusing a list that contradicts the record.
--
--  * procedure_snapshot(id): the canonical record — what an amendment can change, nothing else.
--  * procedure_amendments: one row per amendment; at most one open per procedure; written only by
--    the two functions (no insert/update/delete policies).
--  * Guards: 'amending' is editable like 'draft'; reviewed ⇄ amending only through the functions
--    (transaction-local setting hrudaya.amending); while amending, case code, procedure date and
--    patient are locked, and so is the patient's own row and risk factors.
--  * Deletes of child rows: procedure_is_editable (draft or amending) replaces procedure_is_draft.
--  * Events: amendment_opened / amendment_closed with payload; no generic event for these moves.
--
-- Functions replaced here were taken from the LIVE definitions (pg_get_functiondef, 2026-10-16),
-- not from older migration files, and changed only where marked "0009".
--
-- Security note: hrudaya.amending is a convention between the two functions and the guard, not a
-- boundary against someone with direct SQL access. Through the API, only the two functions can set
-- it, because PostgREST exposes no way to run set_config.

begin;

-- ─── Snapshot ─────────────────────────────────────────────────────────────────
-- Deterministic: children sorted by explicit natural-key tuples (enums as text, collate "C",
-- nulls first) so lib/amendments/snapshot.ts can build the identical object from the loader's rows.
-- Excluded: row ids, foreign keys, audit columns, and fields an amendment cannot change.

create function public.procedure_snapshot(p_procedure_id uuid)
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
$$;

-- ─── Amendments table ─────────────────────────────────────────────────────────

create type public.amendment_status as enum ('open', 'closed');

create table public.procedure_amendments (
  id                               uuid primary key default gen_random_uuid(),
  procedure_id                     uuid not null references public.procedures (id) on delete cascade,
  amendment_no                     integer not null check (amendment_no >= 1),
  status                           public.amendment_status not null default 'open',
  reason                           text not null check (length(btrim(reason)) >= 10),
  opened_by                        uuid references auth.users (id),
  opened_at                        timestamptz not null default now(),
  snapshot                         jsonb not null,
  previous_reviewed_at             timestamptz not null,
  previous_reviewing_clinician_id  uuid references public.operators (id),
  closed_by                        uuid references auth.users (id),
  closed_at                        timestamptz,
  reviewing_clinician_id           uuid references public.operators (id),
  changes                          jsonb,
  unique (procedure_id, amendment_no),
  check (status = 'open' or (closed_at is not null and reviewing_clinician_id is not null and changes is not null)),
  check (changes is null or jsonb_typeof(changes) = 'array')
);

create unique index procedure_amendments_one_open on public.procedure_amendments (procedure_id) where status = 'open';
create index on public.procedure_amendments (reviewing_clinician_id);
create index on public.procedure_amendments (previous_reviewing_clinician_id);

-- A closed amendment is history: never changed. An open one changes only by being closed.
create function public.guard_amendment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'closed' then
    raise exception 'A closed amendment cannot be changed'
      using errcode = 'P0001', hint = 'hrudaya:amendment_closed_immutable';
  end if;
  if coalesce(pg_catalog.current_setting('hrudaya.amending', true), '') <> 'on'
     or new.procedure_id is distinct from old.procedure_id or new.amendment_no is distinct from old.amendment_no
     or new.reason is distinct from old.reason or new.snapshot is distinct from old.snapshot
     or new.opened_by is distinct from old.opened_by or new.opened_at is distinct from old.opened_at
     or new.previous_reviewed_at is distinct from old.previous_reviewed_at
     or new.previous_reviewing_clinician_id is distinct from old.previous_reviewing_clinician_id then
    raise exception 'An amendment changes only by being closed'
      using errcode = 'P0001', hint = 'hrudaya:amendment_via_function_only';
  end if;
  return new;
end;
$$;

create trigger guard_amendment_update
  before update on public.procedure_amendments
  for each row execute function public.guard_amendment_update();

alter table public.procedure_amendments enable row level security;
create policy "authenticated can read" on public.procedure_amendments for select to authenticated using (true);
-- No insert / update / delete policies: only open_amendment and close_amendment (security definer) write.
revoke all on public.procedure_amendments from anon;
revoke insert, update, delete on public.procedure_amendments from authenticated;

-- ─── Guards (live bodies, changed where marked 0009) ──────────────────────────

create or replace function public.guard_procedure_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  via_function boolean := coalesce(pg_catalog.current_setting('hrudaya.amending', true), '') = 'on';  -- 0009
begin
  -- 0009: into and out of an amendment, only through open_amendment / close_amendment.
  if (old.status::text = 'reviewed' and new.status::text = 'amending')
     or (old.status::text = 'amending' and new.status::text = 'reviewed') then
    if not via_function then
      raise exception 'An amendment is opened and closed only through open_amendment and close_amendment'
        using errcode = 'P0001', hint = 'hrudaya:amendment_via_function_only';
    end if;
    if new.case_code is distinct from old.case_code or new.procedure_date is distinct from old.procedure_date
       or new.patient_id is distinct from old.patient_id then
      raise exception 'Case code, procedure date and patient cannot be amended'
        using errcode = 'P0001', hint = 'hrudaya:amendment_identity_locked';
    end if;
    if new.status::text = 'amending' then
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.reviewing_clinician_id := null;
    else
      new.reviewed_by := coalesce(auth.uid(), new.reviewed_by);
      new.reviewed_at := pg_catalog.now();
    end if;
    return new;
  end if;

  if old.status::text = 'reviewed' then
    raise exception 'This procedure has been reviewed and is read-only'
      using errcode = 'P0001', hint = 'hrudaya:reviewed_read_only';
  end if;

  -- 0009: while amending, edits are allowed (like a draft) but the status cannot move, and the
  -- record's identity is locked.
  if old.status::text = 'amending' or new.status::text = 'amending' then
    if new.status::text is distinct from old.status::text then
      raise exception 'While an amendment is open, the status changes only by closing it'
        using errcode = 'P0001', hint = 'hrudaya:amendment_via_function_only';
    end if;
    if new.case_code is distinct from old.case_code or new.procedure_date is distinct from old.procedure_date
       or new.patient_id is distinct from old.patient_id then
      raise exception 'Case code, procedure date and patient cannot be amended'
        using errcode = 'P0001', hint = 'hrudaya:amendment_identity_locked';
    end if;
    return new;
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

-- Live body; 0009 adds the same checks on amending → reviewed (close_amendment "attempts the
-- transition", so an incomplete record cannot be re-reviewed).
create or replace function public.check_procedure_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  n_interventions integer;
begin
  if (new.status = 'completed' and old.status is distinct from 'completed')
     or (new.status::text = 'reviewed' and old.status::text = 'amending') then  -- 0009
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
    -- No discharge check: a completed procedure may belong to a patient still admitted.
  end if;
  return new;
end;
$$;

-- Live body; 0009: moves into and out of 'amending' are logged by the two functions with their own
-- events (amendment_opened / amendment_closed), not as a generic status change.
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
  elsif new.status is distinct from old.status
        and old.status::text <> 'amending' and new.status::text <> 'amending' then  -- 0009
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

-- 0009: while any procedure of the patient is being amended, the patient's row and risk factors are
-- locked. Patient data is not part of the amendment diff, so a change there would not be signed.
create function public.guard_patient_during_amendment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  pid uuid;
begin
  -- Separate branches: NEW/OLD have different columns on the two tables, and NEW is null on DELETE.
  if tg_table_name = 'patients' then
    pid := old.id;
  elsif tg_op = 'INSERT' then
    pid := new.patient_id;
  else
    pid := old.patient_id;
  end if;
  if exists (select 1 from public.procedures p where p.patient_id = pid and p.status::text = 'amending') then
    raise exception 'Patient details are locked while an amendment is open'
      using errcode = 'P0001', hint = 'hrudaya:amendment_identity_locked';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger guard_patient_during_amendment
  before update on public.patients
  for each row execute function public.guard_patient_during_amendment();
create trigger guard_patient_during_amendment
  before insert or update or delete on public.patient_risk_factors
  for each row execute function public.guard_patient_during_amendment();

-- ─── Deletes of child rows: draft or amending ─────────────────────────────────

create function public.procedure_is_editable(p_procedure_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.procedures p where p.id = p_procedure_id and p.status::text in ('draft', 'amending')
  );
$$;

drop policy "authenticated can delete from draft" on public.vessel_findings;
create policy "authenticated can delete while editable" on public.vessel_findings
  for delete to authenticated using (public.procedure_is_editable(procedure_id));
drop policy "authenticated can delete from draft" on public.interventions;
create policy "authenticated can delete while editable" on public.interventions
  for delete to authenticated using (public.procedure_is_editable(procedure_id));
drop policy "authenticated can delete from draft" on public.devices_used;
create policy "authenticated can delete while editable" on public.devices_used
  for delete to authenticated using (
    public.procedure_is_editable((select i.procedure_id from public.interventions i where i.id = intervention_id))
  );
drop policy "authenticated can delete from draft" on public.complications;
create policy "authenticated can delete while editable" on public.complications
  for delete to authenticated using (public.procedure_is_editable(procedure_id));
drop policy "authenticated can delete from draft" on public.discharge_medications;
create policy "authenticated can delete while editable" on public.discharge_medications
  for delete to authenticated using (
    public.procedure_is_editable((select d.procedure_id from public.discharges d where d.id = discharge_id))
  );
drop policy "authenticated can delete from draft" on public.discharges;
create policy "authenticated can delete while editable" on public.discharges
  for delete to authenticated using (public.procedure_is_editable(procedure_id));
drop policy "authenticated can delete from draft" on public.procedure_medications;
create policy "authenticated can delete while editable" on public.procedure_medications
  for delete to authenticated using (public.procedure_is_editable(procedure_id));

-- ─── open_amendment / close_amendment ────────────────────────────────────────

create function public.open_amendment(p_procedure_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_prev_at timestamptz;
  v_prev_clinician uuid;
  v_no integer;
  v_id uuid;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
begin
  if auth.uid() is null then
    raise exception 'Sign in to amend a procedure'
      using errcode = 'P0001', hint = 'hrudaya:amendment_needs_user';
  end if;
  if pg_catalog.length(v_reason) < 10 then
    raise exception 'Give a reason of at least 10 characters'
      using errcode = 'P0001', hint = 'hrudaya:amendment_reason_too_short';
  end if;

  select p.status::text, p.reviewed_at, p.reviewing_clinician_id
    into v_status, v_prev_at, v_prev_clinician
    from public.procedures p where p.id = p_procedure_id for update;
  if not found then
    raise exception 'Procedure not found' using errcode = 'P0002', hint = 'hrudaya:procedure_not_found';
  end if;
  if v_status <> 'reviewed' then
    raise exception 'Only a reviewed procedure can be amended'
      using errcode = 'P0001', hint = 'hrudaya:amend_needs_reviewed';
  end if;

  select coalesce(max(a.amendment_no), 0) + 1 into v_no from public.procedure_amendments a where a.procedure_id = p_procedure_id;

  insert into public.procedure_amendments
    (procedure_id, amendment_no, reason, opened_by, snapshot, previous_reviewed_at, previous_reviewing_clinician_id)
  values
    (p_procedure_id, v_no, v_reason, auth.uid(), public.procedure_snapshot(p_procedure_id), v_prev_at, v_prev_clinician)
  returning id into v_id;

  perform pg_catalog.set_config('hrudaya.amending', 'on', true);
  update public.procedures set status = 'amending' where id = p_procedure_id;
  perform pg_catalog.set_config('hrudaya.amending', 'off', true);

  insert into public.procedure_events (procedure_id, event, actor, payload)
  values (p_procedure_id, 'amendment_opened', auth.uid(),
          pg_catalog.jsonb_build_object('amendment_no', v_no, 'reason', v_reason));
  return v_id;
end;
$$;

create function public.close_amendment(p_procedure_id uuid, p_reviewing_clinician_id uuid, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_amendment public.procedure_amendments;
  v_same boolean;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to re-review a procedure'
      using errcode = 'P0001', hint = 'hrudaya:amendment_needs_user';
  end if;
  if p_changes is null or pg_catalog.jsonb_typeof(p_changes) <> 'array' then
    raise exception 'The list of changes is missing'
      using errcode = 'P0001', hint = 'hrudaya:amendment_changes_invalid';
  end if;
  if p_reviewing_clinician_id is null then
    raise exception 'Choose the re-reviewing clinician'
      using errcode = 'P0001', hint = 'hrudaya:amendment_needs_clinician';
  end if;

  select p.status::text into v_status from public.procedures p where p.id = p_procedure_id for update;
  if not found then
    raise exception 'Procedure not found' using errcode = 'P0002', hint = 'hrudaya:procedure_not_found';
  end if;
  select * into v_amendment from public.procedure_amendments a
    where a.procedure_id = p_procedure_id and a.status = 'open' for update;
  if v_status <> 'amending' or v_amendment.id is null then
    raise exception 'There is no open amendment for this procedure'
      using errcode = 'P0001', hint = 'hrudaya:amendment_not_open';
  end if;

  -- The stored diff cannot lie: it is empty exactly when the record is unchanged.
  v_same := v_amendment.snapshot = public.procedure_snapshot(p_procedure_id);
  v_count := pg_catalog.jsonb_array_length(p_changes);
  if v_count = 0 and not v_same then
    raise exception 'The record has changed, but no changes were submitted'
      using errcode = 'P0001', hint = 'hrudaya:amendment_diff_mismatch';
  end if;
  if v_count > 0 and v_same then
    raise exception 'Changes were submitted, but the record is unchanged'
      using errcode = 'P0001', hint = 'hrudaya:amendment_diff_mismatch';
  end if;

  -- Attempt the transition: the guard stamps the second signature; the completion trigger and the
  -- completeness CHECK refuse an incomplete record.
  perform pg_catalog.set_config('hrudaya.amending', 'on', true);
  update public.procedures set status = 'reviewed', reviewing_clinician_id = p_reviewing_clinician_id where id = p_procedure_id;
  update public.procedure_amendments
     set status = 'closed', closed_by = auth.uid(), closed_at = pg_catalog.now(),
         reviewing_clinician_id = p_reviewing_clinician_id, changes = p_changes
   where id = v_amendment.id;
  perform pg_catalog.set_config('hrudaya.amending', 'off', true);

  insert into public.procedure_events (procedure_id, event, actor, payload)
  values (p_procedure_id, 'amendment_closed', auth.uid(),
          pg_catalog.jsonb_build_object('amendment_no', v_amendment.amendment_no, 'change_count', v_count,
                                        'reviewing_clinician_id', p_reviewing_clinician_id));
end;
$$;

revoke execute on function public.open_amendment(uuid, text) from public, anon;
revoke execute on function public.close_amendment(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.procedure_snapshot(uuid) from public, anon;
grant execute on function public.open_amendment(uuid, text) to authenticated;
grant execute on function public.close_amendment(uuid, uuid, jsonb) to authenticated;
grant execute on function public.procedure_snapshot(uuid) to authenticated;

commit;
