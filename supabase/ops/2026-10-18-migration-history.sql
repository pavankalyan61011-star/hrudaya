-- Migration history for production (owner, 2026-10-18).
--
-- Production's migrations 0001–0011 were applied by hand (`supabase db query --linked -f …`), so the
-- Supabase CLI's history table never existed there and `supabase migration list / db push` could not
-- tell what was applied. This creates the same table the CLI creates (shape copied from the CLI
-- v2.116.0 local database: version text primary key, statements text[], name text) and records
-- 0001–0011 as applied, so future migrations can go through the normal CLI path once the project is
-- linked (`supabase link --project-ref zvqcthcndeuvhsukmyuv`, run by the owner).
--
-- `statements` is left null: the CLI uses version (and name) to decide what is applied; the SQL of
-- each migration is in supabase/migrations/. Idempotent: safe to run again; it never changes data
-- outside supabase_migrations.

begin;

create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version    text primary key,
  statements text[],
  name       text
);

insert into supabase_migrations.schema_migrations (version, name) values
  ('0001', 'init'),
  ('0002', 'seed_amendments'),
  ('0003', 'discharge_draft_delete'),
  ('0004', 'sublingual_prn_dose'),
  ('0005', 'dapt_meds_signoff_times'),
  ('0006', 'facility_timing_baseline_anatomy'),
  ('0007', 'safety_access_communication_measurements'),
  ('0008', 'discharge_summaries'),
  ('0009', 'amending_status'),
  ('0010', 'amendments'),
  ('0011', 'structured_reporting')
on conflict (version) do nothing;

commit;
