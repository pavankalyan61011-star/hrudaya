-- Hrudaya — amendments needed by the synthetic cases 002–020.
--  1. devices_used.category: balloon_dcb (drug-coated balloon), balloon_scoring.
--  2. procedures.lvef_pct: post-procedure LVEF where recorded.
--  3. A discharge row is optional (a patient may remain admitted): completion no
--     longer requires one. The 0001 completion trigger is replaced with the same
--     body minus the discharge check.
--  4. Second operator: Dr Meera Shah (fictional).

alter type public.device_category add value if not exists 'balloon_dcb';
alter type public.device_category add value if not exists 'balloon_scoring';

begin;

alter table public.procedures
  add column lvef_pct integer check (lvef_pct between 0 and 100);

create or replace function public.check_procedure_completion()
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
    -- No discharge check: a completed procedure may belong to a patient still admitted.
  end if;
  return new;
end;
$$;

insert into public.operators (full_name, role)
select 'Dr Meera Shah', 'interventional_cardiologist'
where not exists (select 1 from public.operators where full_name = 'Dr Meera Shah');

commit;
