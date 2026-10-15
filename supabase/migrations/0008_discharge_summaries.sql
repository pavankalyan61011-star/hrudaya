-- Hrudaya 0008 — AI discharge summaries (Week 4 spec §3). Additive only: nothing live reads it.
--
--  * discharge_summaries: one row per (procedure, language, version). Old versions are kept.
--  * Insert only for a REVIEWED procedure that HAS a discharge row (trigger), always as a draft.
--  * draft_text and the generation fields never change after insert; edits go to approved_text.
--  * An approved row is immutable. approved_by / approved_at come from the signed-in user and the
--    clock; generated_by / generated_at likewise (a script with no user may supply them).
--  * procedure_events gets 'summary_generated' and 'summary_approved' rows by trigger. The spec asks
--    for a payload of language and version; procedure_events had no column for it, so this adds a
--    nullable `payload jsonb` (additive — every existing row and writer is unaffected).
--  * RLS: authenticated may select and insert; update only while status = 'draft'; no delete.

-- Six languages (owner's Week 4 prompt): English, Telugu, Hindi, Tamil, Kannada, Malayalam.
create type public.summary_language as enum ('en', 'te', 'hi', 'ta', 'kn', 'ml');
create type public.summary_status   as enum ('draft', 'approved');

begin;

create table public.discharge_summaries (
  id                      uuid primary key default gen_random_uuid(),
  procedure_id            uuid not null references public.procedures (id) on delete cascade,
  language                public.summary_language not null,
  version                 integer not null check (version >= 1),
  status                  public.summary_status not null default 'draft',
  model                   text not null,
  prompt_version          text not null,
  input_hash              text not null,            -- sha256 of canonical input JSON
  draft_text              text not null,            -- model output, verbatim, never edited
  audit_flags             jsonb not null default '[]',
  approved_text           text,                     -- clinician's final text
  approving_clinician_id  uuid references public.operators (id),
  approved_by             uuid references auth.users (id),
  approved_at             timestamptz,
  tokens_in               integer,
  tokens_out              integer,
  generated_by            uuid references auth.users (id) default auth.uid(),
  generated_at            timestamptz not null default now(),
  unique (procedure_id, language, version),
  check (status = 'draft' or (approved_text is not null and approving_clinician_id is not null and approved_at is not null))
);

create index on public.discharge_summaries (procedure_id, language, version desc);
create index on public.discharge_summaries (generated_by, generated_at); -- daily cap (spec §6)
create index on public.discharge_summaries (approving_clinician_id);

-- ─── Insert: reviewed + discharged procedures only; always a fresh draft ──────

create function public.guard_summary_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.procedures p
    where p.id = new.procedure_id and p.status::text = 'reviewed'
  ) then
    raise exception 'A discharge summary needs a reviewed procedure'
      using errcode = 'P0001', hint = 'hrudaya:summary_needs_reviewed';
  end if;
  if not exists (select 1 from public.discharges d where d.procedure_id = new.procedure_id) then
    raise exception 'A discharge summary needs a discharge'
      using errcode = 'P0001', hint = 'hrudaya:summary_needs_discharge';
  end if;
  if new.status <> 'draft' or new.approved_text is not null or new.approving_clinician_id is not null
     or new.approved_by is not null or new.approved_at is not null then
    raise exception 'A discharge summary is created as a draft and approved afterwards'
      using errcode = 'P0001', hint = 'hrudaya:summary_insert_as_draft';
  end if;

  new.generated_by := coalesce(auth.uid(), new.generated_by);
  if auth.uid() is not null then
    new.generated_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

create trigger guard_summary_insert
  before insert on public.discharge_summaries
  for each row execute function public.guard_summary_insert();

-- ─── Update: approved rows immutable; generation fields never change ─────────

create function public.guard_summary_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'approved' then
    raise exception 'An approved discharge summary cannot be changed; create a new version'
      using errcode = 'P0001', hint = 'hrudaya:summary_approved_immutable';
  end if;

  if new.procedure_id   is distinct from old.procedure_id
     or new.language       is distinct from old.language
     or new.version        is distinct from old.version
     or new.model          is distinct from old.model
     or new.prompt_version is distinct from old.prompt_version
     or new.input_hash     is distinct from old.input_hash
     or new.draft_text     is distinct from old.draft_text
     or new.tokens_in      is distinct from old.tokens_in
     or new.tokens_out     is distinct from old.tokens_out
     or new.generated_by   is distinct from old.generated_by
     or new.generated_at   is distinct from old.generated_at then
    raise exception 'The generated draft and its provenance cannot be changed'
      using errcode = 'P0001', hint = 'hrudaya:summary_draft_immutable';
  end if;

  if new.status = 'approved' then
    new.approved_by := coalesce(auth.uid(), new.approved_by);
    if auth.uid() is not null or new.approved_at is null then
      new.approved_at := pg_catalog.now();
    end if;
  else
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end;
$$;

create trigger guard_summary_update
  before update on public.discharge_summaries
  for each row execute function public.guard_summary_update();

-- ─── Event log ────────────────────────────────────────────────────────────────

alter table public.procedure_events add column payload jsonb;

-- SECURITY DEFINER so the log can be written although users have no insert policy on it.
create function public.log_summary_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.procedure_events (procedure_id, event, actor, payload)
    values (new.procedure_id, 'summary_generated', auth.uid(),
            pg_catalog.jsonb_build_object('language', new.language, 'version', new.version));
  elsif new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.procedure_events (procedure_id, event, actor, payload)
    values (new.procedure_id, 'summary_approved', auth.uid(),
            pg_catalog.jsonb_build_object('language', new.language, 'version', new.version));
  end if;
  return null;
end;
$$;

revoke execute on function public.log_summary_event() from public, anon, authenticated;

create trigger log_summary_event
  after insert or update of status on public.discharge_summaries
  for each row execute function public.log_summary_event();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.discharge_summaries enable row level security;
create policy "authenticated can read" on public.discharge_summaries
  for select to authenticated using (true);
create policy "authenticated can insert" on public.discharge_summaries
  for insert to authenticated with check (true);
create policy "authenticated can update drafts" on public.discharge_summaries
  for update to authenticated using (status = 'draft') with check (true);
revoke all on public.discharge_summaries from anon;

commit;
