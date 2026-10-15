# Hrudaya — backlog

The Week 1 schema is **frozen** after migration 0007 (2026-10-15). Anything below needs an owner
decision and a new migration; none of it is started.

Rule for every conditional measurement (spec §3): a `*_status` enum — `not_recorded`,
`not_performed`, `recorded` — beside the value. Conditional items are **never required**.

## Requested by the owner

- **Linked consent checklist** — a checklist table (risks discussed, alternatives, interpreter,
  witness) linked to the consent time and clinician recorded today. 0007 stores only who and when.
- **"Not assessed" vs "not recorded"** — a further state for findings that were deliberately not
  assessed, beyond today's three-state rule. Not added yet.
- **Ward medication chart** — inpatient medicines; today only procedure and discharge medicines are
  stored (CAG-2026-020's ward medicines are therefore not in the database).
- **STEMI network timestamps** — first medical contact, door, wire/balloon; door-to-balloon derived.
- **Multi-facility support** — more than one facility and cath lab, with scoping by facility.
- **IVUS / OCT** — conditional intravascular imaging (PCI-2026-015's IVUS is in intervention notes today).
- **FFR / iFR** — conditional physiology per lesion.
- **Left ventriculography** — conditional; would become an `lvef_source` that can carry a value.
- **Mechanical circulatory support** — IABP, Impella, ECMO; conditional.

## Found while building Week 1

- **Patient weight** — weight-based doses (heparin 70 units/kg) are stored per kg; no total dose
  can be derived until weight is recorded.
- **Reviewer role** — any signed-in user can mark a procedure reviewed today (single role,
  spec §3.12); the reviewing clinician is chosen from operators, not tied to the login.
- **Case-file gaps** — guidewire and discharge clinical status are "Not recorded" for 002–020, and
  PCI-2026-001 has no stated DAPT duration; the seed does not invent them.

## Process

- **Migrations that drop or rename a column ship in three steps:** first deploy code that works
  with both the old and the new shape, then apply the migration, then deploy the clean-up that
  drops support for the old shape. On 2026-10-15, migrating 0005–0007 before the matching code was
  live gave 3–4 minutes of errors on the live site; with a pilot site that would matter.
