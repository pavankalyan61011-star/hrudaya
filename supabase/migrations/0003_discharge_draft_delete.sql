-- A discharge row is optional (0002). On a draft, the form must be able to remove one when
-- the user switches to "still admitted". Same rule as the other child tables in 0001:
-- removable only while the procedure is a draft.

create policy "authenticated can delete from draft" on public.discharges
  for delete to authenticated using (public.procedure_is_draft(procedure_id));
