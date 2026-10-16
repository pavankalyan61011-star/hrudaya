-- Hrudaya 0009 — amendments, step A (Week 6 spec §2).
-- Postgres cannot use an enum value in the same transaction that added it, so the new status is
-- added on its own, before 0010. Apply this file first, then 0010, both before any code that
-- references them.
--
-- 'amending' = a reviewed procedure re-opened through open_amendment(); it returns to 'reviewed'
-- only through close_amendment(). The app shows it as "Amendment in progress" (amber), never as
-- "Draft"; print and FHIR export refuse it like a draft.

alter type public.procedure_status add value if not exists 'amending' after 'reviewed';
