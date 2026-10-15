-- Owner correction (2026-10-15): store PRN medicines such as sublingual GTN.
--  1. medication_route gains 'sublingual'.
--  2. dose may be null, but only for a PRN medicine.
--  3. dose_unit is null exactly when dose is null — a unit without a dose would be invented.

alter type public.medication_route add value if not exists 'sublingual';

begin;

alter table public.discharge_medications
  alter column dose drop not null,
  alter column dose_unit drop not null,
  add constraint discharge_medications_dose_only_prn_may_be_blank
    check (dose is not null or frequency = 'prn'),
  add constraint discharge_medications_unit_with_dose
    check ((dose is null) = (dose_unit is null));

commit;
